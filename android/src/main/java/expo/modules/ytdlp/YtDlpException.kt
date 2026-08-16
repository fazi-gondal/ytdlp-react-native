package expo.modules.ytdlp

/**
 * Internal exception carrying a public error code.
 *
 * The code is embedded in a prefixed [message] so that it survives the
 * Expo Modules bridge, which only guarantees `message` (and a generic
 * `code`) to JavaScript. The TypeScript layer parses the prefix.
 */
internal class YtDlpNativeException(
  val errorCode: String,
  userMessage: String,
  cause: Throwable? = null,
) : Exception("YTD_NATIVE|$errorCode|$userMessage", cause)