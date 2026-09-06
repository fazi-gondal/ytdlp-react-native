import { NativeExpoYtDlp, type ExpoYtDlpNativeModule } from './ExpoYtDlpModule';
import { LIBRARY_VERSION, SUPPORTED_PLATFORM_MESSAGE } from './constants';
import { YtDlpDownloadTask } from './downloadTask';
import { normalizeError, normalizeExtractionError, YtDlpError } from './errors';
import { mapVideoInfo } from './mappers';
import { serializeDownloadOptions, serializeExtractOptions } from './serializers';
import type {
  DownloadOptions,
  DownloadTask,
  ExtractOptions,
  Format,
  VideoInfo,
  YtDlpVersion,
} from './types';

function requireNative(): ExpoYtDlpNativeModule {
  if (!NativeExpoYtDlp) {
    throw new YtDlpError('UNSUPPORTED_PLATFORM', SUPPORTED_PLATFORM_MESSAGE);
  }
  return NativeExpoYtDlp;
}

function validateUrl(url: string | undefined): void {
  if (!url || url.trim().length === 0) {
    throw new YtDlpError('INVALID_URL', 'URL is required.');
  }
}

/**
 * Read the yt-dlp version embedded in the native runtime plus this package's
 * version. The two are independent (see AGENTS.md §35).
 */
export async function getVersion(): Promise<YtDlpVersion> {
  try {
    const native = requireNative();
    const ytDlp = await native.getVersion();
    return { ytDlp, library: LIBRARY_VERSION };
  } catch (cause) {
    throw normalizeError(cause);
  }
}

/**
 * Extract normalized media information without downloading anything.
 */
export async function extractInfo(url: string, options?: ExtractOptions): Promise<VideoInfo> {
  validateUrl(url);
  try {
    const native = requireNative();
    const json = await native.extractInfo(url, serializeExtractOptions(options));
    return mapVideoInfo(JSON.parse(json));
  } catch (cause) {
    throw normalizeExtractionError(cause);
  }
}

/**
 * List usable download formats. Internally reuses the same extraction as
 * `extractInfo` to avoid redundant work (see AGENTS.md §34).
 */
export async function getFormats(url: string, options?: ExtractOptions): Promise<Format[]> {
  const info = await extractInfo(url, options);
  return info.formats;
}

/**
 * Start a download. Resolves with a [DownloadTask] immediately; progress and
 * the final result arrive through the task's listeners (AGENTS.md §12).
 */
export async function download(options: DownloadOptions): Promise<DownloadTask> {
  validateUrl(options.url);
  try {
    const native = requireNative();
    const info = await native.startDownload(serializeDownloadOptions(options));
    return new YtDlpDownloadTask(native, info.taskId);
  } catch (cause) {
    throw normalizeError(cause);
  }
}

/** Cancel a download by task id, e.g. after app re-creation (AGENTS.md §22). */
export async function cancel(taskId: string): Promise<boolean> {
  try {
    const native = requireNative();
    return await native.cancelDownload(taskId);
  } catch (cause) {
    throw normalizeError(cause);
  }
}

/**
 * Pause an in-flight download by task id. Returns `false` if the task is
 * unknown, already paused, or already finished.
 */
export async function pause(taskId: string): Promise<boolean> {
  try {
    const native = requireNative();
    return await native.pauseDownload(taskId);
  } catch (cause) {
    throw normalizeError(cause);
  }
}

/**
 * Resume a paused download by task id. Returns `false` if the task is unknown
 * or not paused. yt-dlp continues from the partial `.part` file by default.
 */
export async function resume(taskId: string): Promise<boolean> {
  try {
    const native = requireNative();
    return await native.resumeDownload(taskId);
  } catch (cause) {
    throw normalizeError(cause);
  }
}
