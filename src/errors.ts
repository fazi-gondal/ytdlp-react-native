import type { YtDlpErrorCode } from './types';

/** Prefix used by the Kotlin layer to carry error codes across the bridge. */
const NATIVE_PREFIX = 'YTD_NATIVE|';

export class YtDlpError extends Error {
  readonly code: YtDlpErrorCode;
  readonly taskId?: string;
  readonly cause?: unknown;

  constructor(
    code: YtDlpErrorCode,
    message: string,
    options?: { taskId?: string; cause?: unknown }
  ) {
    super(message);
    this.name = 'YtDlpError';
    this.code = code;
    if (options?.taskId) this.taskId = options.taskId;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Normalizes anything thrown by the native layer into a `YtDlpError`.
 * Unknown/missing codes map to `UNKNOWN`; raw stack traces are never surfaced.
 */
export function normalizeError(
  cause: unknown,
  fallbackMessage = 'Unknown yt-dlp error'
): YtDlpError {
  if (cause instanceof YtDlpError) return cause;

  if (cause instanceof Error) {
    const parsed = parseNativeMessage(cause.message);
    if (parsed) {
      return new YtDlpError(parsed.code, parsed.message, { cause });
    }
    return new YtDlpError('UNKNOWN', cause.message || fallbackMessage, { cause });
  }

  if (typeof cause === 'string') {
    const parsed = parseNativeMessage(cause);
    if (parsed) return new YtDlpError(parsed.code, parsed.message);
    return new YtDlpError('UNKNOWN', cause || fallbackMessage);
  }

  return new YtDlpError('UNKNOWN', fallbackMessage, { cause });
}

function parseNativeMessage(message: string): { code: YtDlpErrorCode; message: string } | null {
  if (!message.startsWith(NATIVE_PREFIX)) return null;
  const rest = message.slice(NATIVE_PREFIX.length);
  const separator = rest.indexOf('|');
  if (separator === -1) return null;
  const rawCode = rest.slice(0, separator);
  const text = rest.slice(separator + 1);
  const code = toKnownCode(rawCode);
  return { code, message: text || rawCode };
}

function toKnownCode(rawCode: string): YtDlpErrorCode {
  const known: YtDlpErrorCode[] = [
    'INVALID_URL',
    'EXTRACTION_FAILED',
    'DOWNLOAD_FAILED',
    'CANCELLED',
    'FORMAT_UNAVAILABLE',
    'NETWORK_ERROR',
    'AUTHENTICATION_REQUIRED',
    'GEO_RESTRICTED',
    'PRIVATE_CONTENT',
    'AGE_RESTRICTED',
    'PROCESSING_FAILED',
    'STORAGE_ERROR',
    'INIT_FAILED',
    'UNSUPPORTED_PLATFORM',
    'UNKNOWN',
  ];
  if ((known as readonly string[]).includes(rawCode)) return rawCode as YtDlpErrorCode;
  return 'UNKNOWN';
}

/**
 * Builds a `YtDlpError` from a code+message pair received from native events.
 * Unknown codes degrade to `UNKNOWN` (AGENTS.md §23).
 */
export function fromNativeCode(code: string, message: string): YtDlpError {
  return new YtDlpError(toKnownCode(code), message);
}

/**
 * Refines an extraction failure into a more specific code by matching the
 * yt-dlp error message. Kept conservative: no match falls back to the
 * normalized code.
 */
export function normalizeExtractionError(
  cause: unknown,
  fallbackMessage = 'Failed to extract media information'
): YtDlpError {
  const base = normalizeError(cause, fallbackMessage);
  if (base.code !== 'EXTRACTION_FAILED' && base.code !== 'UNKNOWN') return base;

  const message = base.message.toLowerCase();
  if (
    /http error|connection|timed out|unreachable|name or service not known|failed to establish|reset by peer|couldn't connect|503|429/.test(
      message
    )
  ) {
    return new YtDlpError('NETWORK_ERROR', base.message, { cause: base.cause });
  }
  if (message.includes('age') || message.includes('mature') || message.includes('under 18')) {
    return new YtDlpError('AGE_RESTRICTED', base.message, { cause: base.cause });
  }
  if (
    message.includes('sign in to confirm') ||
    message.includes('log in') ||
    message.includes('sign up')
  ) {
    return new YtDlpError('AUTHENTICATION_REQUIRED', base.message, { cause: base.cause });
  }
  if (message.includes('private') || message.includes('members-only')) {
    return new YtDlpError('PRIVATE_CONTENT', base.message, { cause: base.cause });
  }
  if (
    message.includes('geographic') ||
    message.includes('geo-') ||
    message.includes('not available in your country')
  ) {
    return new YtDlpError('GEO_RESTRICTED', base.message, { cause: base.cause });
  }
  return base;
}
