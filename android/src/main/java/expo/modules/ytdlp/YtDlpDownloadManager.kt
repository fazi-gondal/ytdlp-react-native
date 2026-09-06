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
 *
 * Pause/resume (issue #4): `pause()` asks yt-dlp to abort via the progress
 * hook; the `.part` file stays on disk and the task stays registered with
 * status `PAUSED`. `resume()` re-runs the exact same download and yt-dlp
 * continues from the partial file by default (`--continue`), so no extra
 * options are needed. a [runGeneration] counter per task ensures a stale
 * runner thread (the one that just paused) can never overwrite the fresh run.
 */
internal class YtDlpDownloadManager(
  private val context: Context,
  private val onEvent: (Map<String, Any>) -> Unit,
) {

  private val tasks = ConcurrentHashMap<String, YtDlpTask>()
  private val resumeOptions = ConcurrentHashMap<String, Map<String, Any?>>()
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

    val generation = task.beginRun()
    tasks[task.id] = task
    resumeOptions[task.id] = options
    task.setStatus(YtDlpStatus.EXTRACTING)
    task.emitState()
    executor.execute { runTask(task, outputDirectory, generation) }
    return mapOf("taskId" to task.id, "directory" to outputDirectory.absolutePath)
  }

  /**
   * Pause an in-flight download. Returns `false` when the task is unknown,
   * already paused, or already in a terminal state.
   */
  @Synchronized
  fun pause(taskId: String): Boolean {
    val task = tasks[taskId] ?: return false
    return task.requestPause()
  }

  /**
   * Resume a paused download. Returns `false` when the task is unknown or not
   * in the `PAUSED` state.
   */
  @Synchronized
  fun resume(taskId: String): Boolean {
    val task = tasks[taskId] ?: return false
    if (task.status != YtDlpStatus.PAUSED) return false
    val options = resumeOptions[taskId] ?: return false
    val generation = task.beginRun()
    task.setStatus(YtDlpStatus.EXTRACTING)
    task.emitState()
    executor.execute { runTask(task, task.outputDirectory, generation) }
    return true
  }

  /**
   * Cancel a download. A paused task is finalized immediately (there is no
   * runner alive to observe the cancel request).
   */
  @Synchronized
  fun cancel(taskId: String): Boolean {
    val task = tasks[taskId] ?: return false
    if (task.status == YtDlpStatus.PAUSED) {
      task.emitCancelled()
      releaseTask(task.id)
      return true
    }
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

  private fun runTask(task: YtDlpTask, outputDirectory: File, generation: Int) {
    val options = resumeOptions[task.id]
    if (options == null) {
      synchronized(this) {
        if (task.runGeneration == generation) releaseTask(task.id)
      }
      return
    }
    try {
      YtDlpEngine.executeDownload(task, options, outputDirectory)
      completeRun(task, generation, outputDirectory)
    } catch (e: YtDlpNativeException) {
      failRun(task, generation, e.errorCode, e.message ?: "Download failed")
    } catch (e: Throwable) {
      failRun(task, generation, "DOWNLOAD_FAILED", e.message ?: "Download failed")
    }
  }

  private fun completeRun(task: YtDlpTask, generation: Int, outputDirectory: File) {
    synchronized(this) {
      if (task.runGeneration != generation) return
      val file = YtDlpFileUtil.findNewestFile(outputDirectory, task.startTime)
      val secured = file?.let { YtDlpFileUtil.ensureContained(it, outputDirectory) }
      task.emitCompleted(secured)
      releaseTask(task.id)
    }
  }

  private fun failRun(task: YtDlpTask, generation: Int, code: String, message: String) {
    synchronized(this) {
      if (task.runGeneration != generation) return
      when {
        // Cancel has priority over pause when both were requested.
        task.isCancelRequested() || code == "CANCELLED" -> {
          task.emitCancelled()
          releaseTask(task.id)
        }
        task.isPauseRequested() || code == "PAUSED" -> {
          // Keep the task registered so it can be resumed; the `.part` file
          // stays on disk and yt-dlp continues from it on the next run.
          task.emitPaused()
        }
        else -> {
          task.emitError(code, message)
          releaseTask(task.id)
        }
      }
    }
  }

  private fun releaseTask(taskId: String) {
    tasks.remove(taskId)
    resumeOptions.remove(taskId)
  }

  private companion object {
    const val SUB_DIRECTORY = "yt-dlp"
  }
}