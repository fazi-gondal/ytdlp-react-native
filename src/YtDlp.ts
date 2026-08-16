import { NativeExpoYtDlp, type ExpoYtDlpNativeModule } from './ExpoYtDlpModule';
import { LIBRARY_VERSION, SUPPORTED_PLATFORM_MESSAGE } from './constants';
import { YtDlpDownloadTask } from './downloadTask';
import { normalizeError, normalizeExtractionError, YtDlpError } from './errors';
import { mapVideoInfo } from './mappers';
import type {
  CookieOptions,
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

function serializeExtractOptions(options: ExtractOptions | undefined): Record<string, unknown> {
  if (!options) return {};
  const out: Record<string, unknown> = {};
  if (options.cookies) out.cookies = serializeCookies(options.cookies);
  if (options.proxy) out.proxy = options.proxy;
  if (options.userAgent || options.headers) {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.userAgent) headers['User-Agent'] = options.userAgent;
    out.headers = headers;
  }
  return out;
}

function serializeDownloadOptions(options: DownloadOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { url: options.url };
  if (options.format) out.format = options.format;
  if (options.output) {
    const output: Record<string, unknown> = {};
    if (options.output.directory) output.directory = options.output.directory;
    if (options.output.filename) output.filename = options.output.filename;
    if (Object.keys(output).length > 0) out.output = output;
  }
  if (options.merge != null) out.merge = options.merge;
  if (options.cookies) out.cookies = serializeCookies(options.cookies);
  if (options.userAgent || options.headers) {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.userAgent) headers['User-Agent'] = options.userAgent;
    out.headers = headers;
  }
  if (options.referer) out.referer = options.referer;
  if (options.proxy) out.proxy = options.proxy;
  if (options.playlist) {
    const playlist: Record<string, unknown> = {};
    if (options.playlist.enabled != null) playlist.enabled = options.playlist.enabled;
    if (options.playlist.start != null) playlist.start = options.playlist.start;
    if (options.playlist.end != null) playlist.end = options.playlist.end;
    if (Object.keys(playlist).length > 0) out.playlist = playlist;
  }
  if (options.network) {
    const network: Record<string, unknown> = {};
    if (options.network.timeout != null) network.timeout = options.network.timeout;
    if (options.network.retries != null) network.retries = options.network.retries;
    if (Object.keys(network).length > 0) out.network = network;
  }
  if (options.subtitles) {
    const subtitles: Record<string, unknown> = {};
    if (options.subtitles.enabled != null) subtitles.enabled = options.subtitles.enabled;
    if (options.subtitles.languages?.length) subtitles.languages = options.subtitles.languages;
    if (options.subtitles.autoGenerated != null)
      subtitles.autoGenerated = options.subtitles.autoGenerated;
    if (Object.keys(subtitles).length > 0) out.subtitles = subtitles;
  }
  return out;
}

function serializeCookies(cookies: CookieOptions): Record<string, unknown> {
  if (cookies.source === 'file' && cookies.path) {
    return { path: cookies.path };
  }
  throw new YtDlpError('INVALID_URL', 'Cookies must reference a cookies file path.');
}
