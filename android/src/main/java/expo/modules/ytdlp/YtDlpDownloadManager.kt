package expo.modules.ytdlp

import android.content.Context
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Owns the concurrent download task registry (AGENTS.md §21) and runs each
 * task on its own background thread so the module call thread is never
 * blocked for the duration of a download (AGENTS.md §39).
 */
internal class YtDlpDownloadManager(
  private val context: Context,
  private val onEvent: (Map<String, Any>) -> Unit,
) {

  private val tasks = ConcurrentHashMap<String, YtDlpTask>()
  private val executor: ExecutorService = Executors.newCachedThreadPool()

  /** Creates, registers and starts a download. Returns the public task info. */
  fun start(options: Map<String, Any?>): Map<String, Any> {
    YtDlpEngine.ensureInitialized(context)

    val url = (options["url"] as? String)?.trim().takeIf { !it.isNullOrBlank() }
      ?: throw YtDlpNativeException("INVALID_URL", "URL is required.")

    val output = options["output"] as? Map<*, *>
    val requestedDirectory = output?.get("directory") as? String
    val baseDir = File(context.getExternalFilesDir(null) ?: context.filesDir, SUB_DIRECTORY)
    val outputDirectory = YtDlpFileUtil.resolveOutputDirectory(baseDir, requestedDirectory)

    val task = YtDlpTask(
      id = UUID.randomUUID().toString(),
      outputDirectory = outputDirectory,
      onEvent = onEvent,
    )

    tasks[task.id] = task
    task.setStatus(YtDlpStatus.EXTRACTING)
    task.emitState()
    executor.execute { runTask(task, options, outputDirectory) }
    return mapOf("taskId" to task.id, "directory" to outputDirectory.absolutePath)
  }

  fun cancel(taskId: String): Boolean {
    val task = tasks[taskId] ?: return false
    return task.requestCancel()
  }

  fun statusOf(taskId: String): Map<String, Any?>? {
    val task = tasks[taskId] ?: return null
    return mapOf<String, Any?>(
      "taskId" to task.id,
      "status" to task.status.name.lowercase(),
      "percent" to task.snapshot.percent,
      "downloadedBytes" to task.snapshot.downloadedBytes,
      "totalBytes" to task.snapshot.totalBytes,
      "speedBytesPerSecond" to task.snapshot.speedBytesPerSecond,
      "etaSeconds" to task.snapshot.etaSeconds,
      "filename" to task.snapshot.filename,
    )
  }

  fun shutdown() {
    executor.shutdownNow()
  }

  private fun runTask(task: YtDlpTask, options: Map<String, Any?>, outputDirectory: File) {
    try {
      YtDlpEngine.executeDownload(task, options, outputDirectory)
      val file = YtDlpFileUtil.findNewestFile(outputDirectory, task.startTime)
      val secured = file?.let { YtDlpFileUtil.ensureContained(it, outputDirectory) }
      task.emitCompleted(secured)
    } catch (e: YtDlpNativeException) {
      if (task.isCancelRequested() || e.errorCode == "CANCELLED") {
        task.emitCancelled()
      } else {
        task.emitError(e.errorCode, e.message ?: "Download failed")
      }
    } catch (e: Throwable) {
      if (task.isCancelRequested()) {
        task.emitCancelled()
      } else {
        task.emitError("DOWNLOAD_FAILED", e.message ?: "Download failed")
      }
    } finally {
      tasks.remove(task.id)
    }
  }

  private companion object {
    const val SUB_DIRECTORY = "yt-dlp"
  }
}