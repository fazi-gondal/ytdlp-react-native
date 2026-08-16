package expo.modules.ytdlp

import java.io.File

/**
 * Safe handling of the yt-dlp output location.
 *
 * All output lives inside app-specific storage (see AGENTS.md §24). User
 * strings are treated as untrusted input: no path traversal, no illegal
 * characters, no absurd lengths (see AGENTS.md §25, §26).
 */
internal object YtDlpFileUtil {

  const val DEFAULT_DIRECTORY = "Downloads"
  const val DEFAULT_FILENAME = "%(title)s.%(ext)s"

  /** Single-segment directory name; separators and `..` are removed. */
  fun sanitizeDirectorySegment(name: String): String {
    val cleaned = name
      .replace(Regex("[\\\\/]"), "_")
      .replace(Regex("[\\p{Cntrl}]"), "")
      .replace("..", "_")
      .replace(Regex("^[.\\s]+"), "")
      .take(64)
    return cleaned.ifBlank { DEFAULT_DIRECTORY }
  }

  /**
   * Sanitizes a yt-dlp output template. `%(...)s` directives are preserved,
   * every other character is scrubbed to stay safe on the filesystem.
   */
  fun sanitizeFilenameTemplate(template: String): String {
    if (template.isBlank()) return DEFAULT_FILENAME
    val directive = Regex("%\\([^)]*\\)s")
    val out = StringBuilder()
    var index = 0
    for (match in directive.findAll(template)) {
      out.append(sanitizeStatic(template.substring(index, match.range.first)))
      out.append(match.value)
      index = match.range.last + 1
    }
    out.append(sanitizeStatic(template.substring(index)))
    return out.toString().ifBlank { DEFAULT_FILENAME }
  }

  fun resolveOutputDirectory(baseDir: File, requested: String?): File {
    val name = requested?.takeIf { it.isNotBlank() } ?: DEFAULT_DIRECTORY
    val dir = File(baseDir, sanitizeDirectorySegment(name))
    if (!dir.exists() && !dir.mkdirs()) {
      throw YtDlpNativeException("STORAGE_ERROR", "Could not create output directory.")
    }
    if (!dir.isDirectory) {
      throw YtDlpNativeException("STORAGE_ERROR", "Output path is not a directory.")
    }
    return dir
  }

  /** Returns the newest file created under [baseDir] after [createdAfter]. */
  fun findNewestFile(baseDir: File, createdAfter: Long): File? {
    if (!baseDir.exists()) return null
    return baseDir
      .walkTopDown()
      .filter { it.isFile && it.lastModified() >= createdAfter - GRACE_MS }
      .maxByOrNull { it.lastModified() }
  }

  /** Moves a file back inside [baseDir] if it escaped (path traversal defense). */
  fun ensureContained(file: File, baseDir: File): File {
    val base = baseDir.canonicalFile
    val fileCanonical = file.canonicalFile
    if (fileCanonical.path == base.path || fileCanonical.path.startsWith(base.path + File.separator)) {
      return file
    }
    val target = File(baseDir, file.name)
    if (file.renameTo(target)) {
      return target
    }
    throw YtDlpNativeException("STORAGE_ERROR", "Downloaded file could not be secured in the output directory.")
  }

  private fun sanitizeStatic(part: String): String {
    return part
      .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
      .replace("..", "_")
      .take(240)
  }

  private const val GRACE_MS = 60_000L
}