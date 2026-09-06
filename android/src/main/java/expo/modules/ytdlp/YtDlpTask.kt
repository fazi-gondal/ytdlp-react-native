package expo.modules.ytdlp

import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

internal enum class YtDlpStatus {
  QUEUED,
  EXTRACTING,
  DOWNLOADING,
  PROCESSING,
  PAUSED,
  COMPLETED,
  CANCELLED,
  FAILED,
}

/**
 * A single download unit.
 *
 * Downloads are driven directly through Chaquopy (not the wrapper's runner),
 * because the wrapper's Python runner wraps its progress hook in
 * `try/except Exception` and swallows any exception we throw from Java — that
 * would make cancellation impossible (see AGENTS.md §22). Instead our own
 * Python hook calls back into Java through [onPythonProgress] and checks
 * [isCancelRequested]; when cancellation is requested, the hook raises
 * `RuntimeError("YTDLP_CANCELLED")` inside yt-dlp, aborting it natively.
 */
internal class YtDlpTask(
  val id: String = UUID.randomUUID().toString(),
  val outputDirectory: File,
  private val onEvent: (Map<String, Any>) -> Unit,
) {

  @Volatile
  var status: YtDlpStatus = YtDlpStatus.QUEUED
    private set

  @Volatile
  var errorCode: String? = null

  @Volatile
  var errorMessage: String? = null

  @Volatile
  var startTime: Long = System.currentTimeMillis()

  private val cancelRequested = AtomicBoolean(false)
  private val pauseRequested = AtomicBoolean(false)

  /** Increments on every run (initial start and each resume); see AGENTS.md §4 lifecycle. */
  @Volatile
  var runGeneration = 0
    private set

  internal val snapshot = ProgressSnapshot()
  private val lastEmit = AtomicLong(0L)

  fun isCancelRequested(): Boolean = cancelRequested.get()

  fun requestCancel(): Boolean = cancelRequested.compareAndSet(false, true)

  fun isPauseRequested(): Boolean = pauseRequested.get()

  /** Accepts the pause only while a run is actually in flight (not terminal, not already paused). */
  fun requestPause(): Boolean {
    val current = status
    if (current == YtDlpStatus.COMPLETED || current == YtDlpStatus.CANCELLED ||
      current == YtDlpStatus.FAILED || current == YtDlpStatus.PAUSED
    ) {
      return false
    }
    return pauseRequested.compareAndSet(false, true)
  }

  /**
   * Prepares a fresh run (initial start or resume): bumps the generation so
   * any stale runner thread stops touching the task, clears pause/cancel
   * requests and error state, and restarts the completion clock.
   */
  @Synchronized
  fun beginRun(): Int {
    runGeneration += 1
    pauseRequested.set(false)
    cancelRequested.set(false)
    errorCode = null
    errorMessage = null
    startTime = System.currentTimeMillis()
    return runGeneration
  }

  @Synchronized
  fun setStatus(newStatus: YtDlpStatus) {
    if (status == YtDlpStatus.COMPLETED || status == YtDlpStatus.CANCELLED || status == YtDlpStatus.FAILED) return
    status = newStatus
  }

  /**
   * Called from Python (via the Chaquopy bridge) on every progress tick.
   * Structured numbers come straight from yt-dlp's progress hook dict.
   */
  fun onPythonProgress(
    downloadedBytes: Long,
    totalBytes: Long,
    speedBytesPerSecond: Long,
    etaSeconds: Long,
    filename: String,
  ) {
    if (cancelRequested.get() || pauseRequested.get()) return
    snapshot.update(downloadedBytes, totalBytes, speedBytesPerSecond, etaSeconds, filename)
    when {
      status == YtDlpStatus.QUEUED -> setStatus(YtDlpStatus.EXTRACTING)
      status == YtDlpStatus.EXTRACTING && (snapshot.downloadedBytes ?: 0L) > 0L ->
        setStatus(YtDlpStatus.DOWNLOADING)
    }
    emitProgress()
  }

  fun emitState() {
    onEvent(statePayload())
  }

  fun emitCompleted(resultFile: File?) {
    setStatus(YtDlpStatus.COMPLETED)
    onEvent(completedPayload(resultFile))
  }

  fun emitCancelled() {
    setStatus(YtDlpStatus.CANCELLED)
    onEvent(cancelledPayload())
  }

  fun emitPaused() {
    setStatus(YtDlpStatus.PAUSED)
    onEvent(statePayload())
  }

  fun emitError(code: String, message: String) {
    errorCode = code
    errorMessage = message
    setStatus(YtDlpStatus.FAILED)
    onEvent(errorPayload())
  }

  private fun emitProgress() {
    val now = System.nanoTime()
    if (now - lastEmit.get() >= THROTTLE_NANOS) {
      lastEmit.set(now)
      onEvent(progressPayload())
    }
  }

  private fun phaseOf(): String = when (status) {
    YtDlpStatus.QUEUED, YtDlpStatus.EXTRACTING -> "extracting"
    YtDlpStatus.DOWNLOADING, YtDlpStatus.PAUSED -> "downloading"
    YtDlpStatus.PROCESSING, YtDlpStatus.COMPLETED -> "processing"
    YtDlpStatus.CANCELLED, YtDlpStatus.FAILED -> "downloading"
  }

  private fun progressPayload(): Map<String, Any> = mapOf(
    "type" to "progress",
    "taskId" to id,
    "status" to status.name.lowercase(),
    "phase" to phaseOf(),
    "progress" to mapOf(
      "percent" to snapshot.percent,
      "downloadedBytes" to snapshot.downloadedBytes,
      "totalBytes" to snapshot.totalBytes,
      "speedBytesPerSecond" to snapshot.speedBytesPerSecond,
      "etaSeconds" to snapshot.etaSeconds,
      "filename" to snapshot.filename,
    ),
  )

  private fun statePayload(): Map<String, Any> = mapOf(
    "type" to "state",
    "taskId" to id,
    "status" to status.name.lowercase(),
    "phase" to phaseOf(),
  )

  private fun completedPayload(resultFile: File?): Map<String, Any> {
    val size = resultFile?.length() ?: 0L
    return mapOf(
      "type" to "completed",
      "taskId" to id,
      "status" to "completed",
      "phase" to "processing",
      "result" to mapOf(
        "taskId" to id,
        "path" to (resultFile?.absolutePath ?: null),
        "uri" to null,
        "filename" to (resultFile?.name ?: null),
        "mimeType" to null,
        "size" to (if (size > 0) size else null),
        "duration" to null,
      ),
    )
  }

  private fun errorPayload(): Map<String, Any> = mapOf(
    "type" to "error",
    "taskId" to id,
    "status" to "failed",
    "phase" to phaseOf(),
    "error" to mapOf(
      "code" to (errorCode ?: "DOWNLOAD_FAILED"),
      "message" to (errorMessage ?: "Download failed"),
    ),
  )

  private fun cancelledPayload(): Map<String, Any> = mapOf(
    "type" to "cancelled",
    "taskId" to id,
    "status" to "cancelled",
    "phase" to "downloading",
  )

  private companion object {
    const val THROTTLE_NANOS = 200_000_000L // 200 ms, see AGENTS.md §40
  }
}

/** Rolling view of the latest structured download progress numbers. */
internal class ProgressSnapshot {
  @Volatile
  var percent: Double? = null
    private set

  @Volatile
  var downloadedBytes: Long? = null
    private set

  @Volatile
  var totalBytes: Long? = null
    private set

  @Volatile
  var speedBytesPerSecond: Long? = null
    private set

  @Volatile
  var etaSeconds: Long? = null
    private set

  @Volatile
  var filename: String? = null
    private set

  fun update(
    downloaded: Long,
    total: Long,
    speed: Long,
    eta: Long,
    name: String,
  ) {
    if (downloaded > 0L) downloadedBytes = downloaded
    if (total > 0L) {
      totalBytes = total
      percent = downloaded.coerceAtMost(total) * 100.0 / total
    }
    if (speed > 0L) speedBytesPerSecond = speed
    if (eta >= 0L) etaSeconds = eta
    if (name.isNotBlank()) filename = name
  }
}