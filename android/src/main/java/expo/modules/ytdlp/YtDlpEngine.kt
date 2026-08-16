package expo.modules.ytdlp

import android.content.Context
import com.chaquo.python.Kwarg
import com.chaquo.python.PyObject
import com.chaquo.python.Python
import dev.ffmpegkit_maintained.ytdlp.YtDlp
import dev.ffmpegkit_maintained.ytdlp.YtDlpException
import java.io.File

/**
 * Adapter isolating every call into the third-party `yt-dlp-android` library
 * and its bundled Chaquopy/Python runtime.
 *
 * Only this file talks to `dev.ffmpegkit_maintained.ytdlp` and
 * `com.chaquo.python`. Everything above relies on this adapter.
 */
internal object YtDlpEngine {

  @Volatile
  private var initialized = false

  /** Starts the embedded Python runtime. Safe to call repeatedly. Not on the main thread. */
  @Synchronized
  fun ensureInitialized(context: Context) {
    if (initialized) return
    try {
      YtDlp.init(context.applicationContext)
      initialized = true
    } catch (e: YtDlpException) {
      throw YtDlpNativeException("INIT_FAILED", "Failed to initialize the yt-dlp runtime.", e)
    } catch (e: Throwable) {
      throw YtDlpNativeException(
        "INIT_FAILED",
        "The yt-dlp runtime is unavailable on this device (its native library may be missing).",
        e,
      )
    }
  }

  /** Reads the bundled yt-dlp version via Chaquopy. */
  fun getYtDlpVersion(): String {
    try {
      val module = Python.getInstance().getModule("yt_dlp.version")
      return module.get("__version__").toString()
    } catch (e: Exception) {
      throw YtDlpNativeException("VERSION_UNREADABLE", "Failed to read the yt-dlp version.", e)
    }
  }

  /**
   * Extracts media information for [url] without downloading anything and
   * returns it serialized as JSON (see AGENTS.md §34).
   *
   * The bundled `yt_dlp` package is driven directly through Chaquopy because
   * the wrapper's own `ytdlp_runner` exposes no extraction/output-capture API.
   */
  fun extractInfoJson(url: String, options: Map<String, Any?>?): String {
    validateUrl(url)
    try {
      val py = Python.getInstance()
      val opts = toPyObject(py, extractOptions(options))
      val ydlClass = py.getModule("yt_dlp").get("YoutubeDL")!!
      val ydl = ydlClass.call(opts)
      val info = ydl.callAttr("extract_info", url, Kwarg("download", false))
      val sanitized = ydl.callAttr("sanitize_info", info)
      val json = py.getModule("json")
      return json.callAttr("dumps", sanitized, Kwarg("ensure_ascii", false)).toString()
    } catch (e: YtDlpNativeException) {
      throw e
    } catch (e: Exception) {
      throw YtDlpNativeException("EXTRACTION_FAILED", "Failed to extract information: ${e.message}", e)
    }
  }

  /** Builds the yt-dlp options dict shared by extraction and download. */
  private fun extractOptions(options: Map<String, Any?>?): MutableMap<String, Any> {
    val opts = mutableMapOf<String, Any>("skip_download" to true)
    applyCommonOptions(opts, options)
    return opts
  }

  private fun applyCommonOptions(opts: MutableMap<String, Any>, options: Map<String, Any?>?) {
    if (options == null) return
    val cookies = options["cookies"] as? Map<*, *>
    (cookies?.get("path") as? String)?.let { opts["cookiefile"] = it }
    (options["proxy"] as? String)?.let { opts["proxy"] = it }
    val headers = mutableMapOf<String, Any>()
    (options["headers"] as? Map<*, *>)?.forEach { (key, value) ->
      if (key != null && value != null) headers[key.toString()] = value.toString()
    }
    (options["userAgent"] as? String)?.let { headers["User-Agent"] = it }
    if (headers.isNotEmpty()) opts["http_headers"] = headers
  }

  /**
   * Runs the download for [task]. Drives yt-dlp directly through Chaquopy so
   * that our own progress hook can abort natively on cancellation (see
   * AGENTS.md §22 and [YtDlpTask]).
   *
   * Throws a classified [YtDlpNativeException] on failure.
   */
  fun executeDownload(task: YtDlpTask, options: Map<String, Any?>, outputDirectory: File) {
    val url = (options["url"] as? String)?.trim().takeIf { !it.isNullOrBlank() }
      ?: throw YtDlpNativeException("INVALID_URL", "URL is required.")
    try {
      rejectUnsupportedFeatures(options)
      val py = Python.getInstance()
      val opts = buildDownloadOptions(options, outputDirectory)
      downloaderFunction(py).callAttr("execute", task, url, toPyObject(py, opts))
    } catch (e: YtDlpNativeException) {
      throw e
    } catch (e: com.chaquo.python.PyException) {
      val message = e.message ?: ""
      if (task.isCancelRequested() || message.contains(CANCEL_SENTINEL)) {
        throw YtDlpNativeException("CANCELLED", "Download cancelled.")
      }
      throw YtDlpNativeException(classifyDownloadFailure(message), message, e)
    } catch (e: Exception) {
      throw YtDlpNativeException("DOWNLOAD_FAILED", "Download failed: ${e.message}", e)
    }
  }

  private fun buildDownloadOptions(options: Map<String, Any?>, outputDirectory: File): MutableMap<String, Any> {
    val opts = mutableMapOf<String, Any>()
    (options["format"] as? String)?.takeIf { it.isNotBlank() }?.let { opts["format"] = it }
    val filename = (options["output"] as? Map<*, *>)?.get("filename") as? String
    val sanitizedTemplate = YtDlpFileUtil.sanitizeFilenameTemplate(filename ?: YtDlpFileUtil.DEFAULT_FILENAME)
    opts["outtmpl"] = File(outputDirectory, sanitizedTemplate).absolutePath
    opts["quiet"] = true

    applyCommonOptions(opts, options)

    (options["referer"] as? String)?.takeIf { it.isNotBlank() }?.let { opts["http_referer"] = it }

    val playlist = options["playlist"] as? Map<*, *>
    if (playlist?.get("enabled") != true) opts["noplaylist"] = true
    (playlist?.get("start") as? Number)?.takeIf { it.toInt() > 0 }?.let { opts["playliststart"] = it.toInt() }
    (playlist?.get("end") as? Number)?.takeIf { it.toInt() > 0 }?.let { opts["playlistend"] = it.toInt() }

    val subtitles = options["subtitles"] as? Map<*, *>
    if (subtitles?.get("enabled") == true) {
      opts["writesubtitles"] = true
      (subtitles["languages"] as? List<*>)?.mapNotNull { it as? String }?.takeIf { it.isNotEmpty() }
        ?.let { opts["subtitleslangs"] = it }
      if (subtitles["autoGenerated"] == true) opts["writeautomaticsub"] = true
    }

    val network = options["network"] as? Map<*, *>
    (network?.get("timeout") as? Number)?.takeIf { it.toInt() > 0 }?.let { opts["socket_timeout"] = it.toInt() }
    (network?.get("retries") as? Number)?.takeIf { it.toInt() >= 0 }?.let { opts["retries"] = it.toInt() }

    return opts
  }

  /** Anything we cannot honestly support is rejected up front (AGENTS.md §19). */
  private fun rejectUnsupportedFeatures(options: Map<String, Any?>) {
    if (options["merge"] == true) {
      throw YtDlpNativeException(
        "PROCESSING_FAILED",
        "Merging video and audio requires FFmpeg, which is not bundled with yt-dlp-android.",
      )
    }
    val audio = options["audio"] as? Map<*, *>
    if (audio?.get("only") == true || audio?.get("format") != null || audio?.get("quality") != null) {
      throw YtDlpNativeException(
        "PROCESSING_FAILED",
        "Audio extraction and re-encoding require FFmpeg, which is not bundled with yt-dlp-android.",
      )
    }
    if (options["metadata"] != null || options["thumbnail"] != null) {
      throw YtDlpNativeException(
        "PROCESSING_FAILED",
        "Metadata and thumbnail embedding are not supported in this version.",
      )
    }
  }

  private fun classifyDownloadFailure(message: String): String {
    val haystack = message.lowercase()
    return when {
      haystack.contains("youtube") && haystack.contains("sign in to confirm") -> "AUTHENTICATION_REQUIRED"
      haystack.contains("login required") || haystack.contains("log in") || haystack.contains("sign up") ->
        "AUTHENTICATION_REQUIRED"
      haystack.contains("private") || haystack.contains("members-only") -> "PRIVATE_CONTENT"
      haystack.contains("age-") || haystack.contains("age restricted") || haystack.contains("mature") ->
        "AGE_RESTRICTED"
      haystack.contains("geo") || haystack.contains("not available in your country") -> "GEO_RESTRICTED"
      haystack.contains("ffmpeg") || haystack.contains("postprocess") || haystack.contains("merge") ->
        "PROCESSING_FAILED"
      haystack.contains("requested format") || haystack.contains("no video formats") ||
        haystack.contains("format combination") -> "FORMAT_UNAVAILABLE"
      haystack.contains("http error") || haystack.contains("connection") || haystack.contains("timed out") ||
        haystack.contains("timeout") || haystack.contains("unreachable") || haystack.contains("reset by peer") ||
        haystack.contains("couldn't connect") || haystack.contains("503") || haystack.contains("429") ->
        "NETWORK_ERROR"
      else -> "DOWNLOAD_FAILED"
    }
  }

  /** Lazily execs (once) the Python helper used to run downloads. */
  private fun downloaderFunction(py: Python): PyObject {
    return downloaderStore.getOrPut(py) {
      val builtins = py.getBuiltins()
      val ns = builtins.callAttr("dict")
      builtins.callAttr("exec", DOWNLOAD_HELPER_SCRIPT, ns, ns)
      ns.get("execute")!!
    }
  }

  private fun validateUrl(url: String?) {
    if (url.isNullOrBlank()) {
      throw YtDlpNativeException("INVALID_URL", "URL is required.")
    }
  }

  /**
   * Converts a Kotlin value into a genuine Python object. Chaquopy does not
   * automatically convert Java Maps/Lists into Python containers (see
   * chaquo/chaquopy#1048), so they would otherwise reach yt-dlp as opaque
   * `java.util.LinkedHashMap` proxies and break `dict.get(key, default)` calls.
   */
  private fun toPyObject(py: Python, value: Any?): PyObject {
    return when (value) {
      null -> PyObject.fromJava(null)
      is PyObject -> value
      is Map<*, *> -> {
        val d = py.getBuiltins().callAttr("dict")
        val view = d.asMap()
        value.forEach { (key, v) ->
          if (key != null && v != null) {
            view.put(PyObject.fromJava(key.toString()), toPyObject(py, v))
          }
        }
        d
      }
      is List<*> -> {
        val l = py.getBuiltins().callAttr("list")
        val view = l.asList()
        value.filterNotNull().forEach { view.add(toPyObject(py, it)) }
        l
      }
      else -> PyObject.fromJava(value)
    }
  }

private const val CANCEL_SENTINEL = "YTDLP_CANCELLED"

  /**
   * Drive the bundled yt-dlp directly. Importing is deferred so our first
   * call stays fast. `execute` returns the download retcode (0 = success);
   * raising from the progress hook aborts yt-dlp natively on cancellation.
   */
  private val DOWNLOAD_HELPER_SCRIPT = """
    def _expo_ytdlp_hook(task, d):
        if task.isCancelRequested():
            raise RuntimeError("YTDLP_CANCELLED")
        downloaded = int(d.get('downloaded_bytes') or 0)
        total = int(d.get('total_bytes') or d.get('total_bytes_estimate') or 0)
        speed = int(d.get('speed') or 0)
        eta = int(d.get('eta') or 0)
        filename = str(d.get('filename') or '')
        task.onPythonProgress(downloaded, total, speed, eta, filename)

    def execute(task, url, opts):
        import yt_dlp
        opts = dict(opts)
        opts['progress_hooks'] = [lambda d, t=task: _expo_ytdlp_hook(t, d)]
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.download([url])
  """.trimIndent()

  private val downloaderStore = java.util.concurrent.ConcurrentHashMap<Python, PyObject>()
}