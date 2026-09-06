package expo.modules.ytdlp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import java.lang.ref.WeakReference

/**
 * Foreground service that keeps the process alive while downloads are active
 * (issue #3, AGENTS.md §38).
 *
 * Architecture: `ExpoYtDlpModule` → [YtDlpDownloadManager] → this service →
 * yt-dlp. The manager starts the service when the first run begins and stops
 * it when the last run ends, so the notification is only visible while there
 * is real work. The service itself never downloads; it only promotes the
 * process to foreground, shows progress, and forwards the notification's
 * Cancel action to the manager.
 *
 * Only framework APIs are used (no new Gradle dependencies). All
 * version-gated calls are branched on [Build.VERSION.SDK_INT]; the module's
 * `minSdk` is 24.
 *
 * Honest limits (documented in the README): the service keeps a *running*
 * process alive when the app is backgrounded or the screen is off, but it
 * cannot resurrect downloads after the process is killed or the device
 * reboots — tasks are process-local by design.
 */
internal class YtDlpForegroundService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = WeakReference(this)
    // Keep the CPU awake during screen-off downloads; released in onDestroy,
    // and dies with the process if the system kills us.
    val powerManager = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).also {
      it.acquire()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CANCEL_ALL) {
      manager()?.cancelAll()
      return START_NOT_STICKY
    }
    ensureChannel()
    promote(buildNotification())
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Throwable) {
      // Best effort; the lock dies with the process regardless.
    }
    wakeLock = null
    if (instance?.get() === this) instance = null
    super.onDestroy()
  }

  /** Rebuilds the notification from the latest snapshot (no-op pre-promotion). */
  private fun refresh() {
    try {
      notificationManager().notify(NOTIFICATION_ID, buildNotification())
    } catch (_: Throwable) {
      // Notification updates are best effort.
    }
  }

  private fun promote(notification: Notification) {
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val (title, text, percent) = content(activeCount, lastPercent, lastTitle)
    val cancelIntent = PendingIntent.getService(
      this,
      REQUEST_CANCEL,
      Intent(this, YtDlpForegroundService::class.java).setAction(ACTION_CANCEL_ALL),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    builder
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, percent ?: 0, percent == null)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", cancelIntent)
    contentIntent()?.let { builder.setContentIntent(it) }
    if (Build.VERSION.SDK_INT < 26) {
      @Suppress("DEPRECATION")
      builder.priority = Notification.PRIORITY_LOW
    }
    return builder.build()
  }

  /** Tapping the notification reopens the host app when possible. */
  private fun contentIntent(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
      this,
      REQUEST_OPEN,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = notificationManager()
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shows active yt-dlp downloads."
          setShowBadge(false)
        },
      )
    }
  }

  private fun notificationManager(): NotificationManager {
    return getSystemService(NotificationManager::class.java)
  }

  companion object {
    const val ACTION_START = "expo.modules.ytdlp.action.START"
    const val ACTION_CANCEL_ALL = "expo.modules.ytdlp.action.CANCEL_ALL"

    private const val CHANNEL_ID = "ytdlp_downloads"
    private const val CHANNEL_NAME = "Downloads"
    private const val NOTIFICATION_ID = 1001
    private const val WAKE_LOCK_TAG = "ytdlp-react-native:download"
    private const val REQUEST_CANCEL = 1
    private const val REQUEST_OPEN = 2

    private var instance: WeakReference<YtDlpForegroundService>? = null
    private var managerRef: WeakReference<YtDlpDownloadManager>? = null

    @Volatile
    private var activeCount = 0

    @Volatile
    private var lastPercent: Double? = null

    @Volatile
    private var lastTitle: String? = null

    /** Called once by the owning [YtDlpDownloadManager]; held weakly. */
    fun setManager(manager: YtDlpDownloadManager?) {
      managerRef = manager?.let { WeakReference(it) }
    }

    private fun manager(): YtDlpDownloadManager? = managerRef?.get()

    /**
     * Promote the process to foreground. Best effort: when the system refuses
     * (e.g. background-start restrictions on API 31+), the download still
     * proceeds without the promotion.
     */
    fun start(context: Context, active: Int) {
      activeCount = active
      val intent = Intent(context.applicationContext, YtDlpForegroundService::class.java)
        .setAction(ACTION_START)
      try {
        if (Build.VERSION.SDK_INT >= 26) {
          context.applicationContext.startForegroundService(intent)
        } else {
          @Suppress("DEPRECATION")
          context.applicationContext.startService(intent)
        }
      } catch (_: Throwable) {
        // Best effort (see KDoc).
      }
    }

    fun stop(context: Context) {
      activeCount = 0
      lastPercent = null
      lastTitle = null
      try {
        context.applicationContext.stopService(
          Intent(context.applicationContext, YtDlpForegroundService::class.java),
        )
      } catch (_: Throwable) {
        // Best effort.
      }
    }

    /** Refreshes the notification from the latest progress snapshot. */
    fun update(active: Int, percent: Double?, title: String?) {
      activeCount = active
      if (percent != null) lastPercent = percent
      if (!title.isNullOrBlank()) lastTitle = title
      try {
        instance?.get()?.refresh()
      } catch (_: Throwable) {
        // Notification updates are best effort.
      }
    }

    private fun content(active: Int, percent: Double?, title: String?): Triple<String, String, Int?> {
      val pct = percent?.coerceIn(0.0, 100.0)?.toInt()
      return if (active > 1) {
        val sub = listOfNotNull(pct?.let { "$it%" }, title)
          .joinToString(" • ").ifBlank { "In progress" }
        Triple("Downloading $active files", sub, pct)
      } else {
        Triple(title ?: "Downloading", pct?.let { "$it%" } ?: "In progress", pct)
      }
    }
  }
}
