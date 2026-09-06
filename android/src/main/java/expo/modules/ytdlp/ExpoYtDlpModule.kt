package expo.modules.ytdlp

import android.content.Context
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoYtDlpModule : Module() {

  private var downloadManager: YtDlpDownloadManager? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoYtDlp")

    Events("downloadEvent")

    AsyncFunction("getVersion") {
      runCatching {
        YtDlpEngine.ensureInitialized(requireContext())
        YtDlpEngine.getYtDlpVersion()
      }.getOrElse { failure ->
        Log.w(LOG_TAG, "getVersion failed", failure)
        throw failure
      }
    }

    AsyncFunction("extractInfo") { url: String, options: Map<String, Any?>? ->
      runCatching {
        YtDlpEngine.ensureInitialized(requireContext())
        YtDlpEngine.extractInfoJson(url, options)
      }.getOrElse { failure ->
        Log.w(LOG_TAG, "extractInfo failed", failure)
        throw failure
      }
    }

    AsyncFunction("startDownload") { options: Map<String, Any?> ->
      runCatching {
        manager().start(options)
      }.getOrElse { failure ->
        Log.w(LOG_TAG, "startDownload failed", failure)
        throw failure
      }
    }

    Function("cancelDownload") { taskId: String ->
      manager().cancel(taskId)
    }

    Function("pauseDownload") { taskId: String ->
      manager().pause(taskId)
    }

    Function("resumeDownload") { taskId: String ->
      manager().resume(taskId)
    }

    Function("getDownloadStatus") { taskId: String ->
      manager().statusOf(taskId)
    }

    OnDestroy {
      downloadManager?.shutdown()
      downloadManager = null
    }
  }

  private fun manager(): YtDlpDownloadManager {
    downloadManager?.let { return it }
    return YtDlpDownloadManager(requireContext()) { payload -> sendEvent("downloadEvent", payload) }
      .also { downloadManager = it }
  }

  private fun requireContext(): Context {
    return appContext.reactContext
      ?: throw YtDlpNativeException("INIT_FAILED", "The React Native context is not available.")
  }

  private companion object {
    const val LOG_TAG = "ExpoYtDlp"
  }
}