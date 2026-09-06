import { YtDlpError, fromNativeCode, normalizeError, normalizeExtractionError } from '../errors';

describe('YtDlpError', () => {
  it('exposes code, message and optional metadata', () => {
    const error = new YtDlpError('CANCELLED', 'Download cancelled', { taskId: 'abc' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('YtDlpError');
    expect(error.code).toBe('CANCELLED');
    expect(error.message).toBe('Download cancelled');
    expect(error.taskId).toBe('abc');
  });

  it('keeps taskId/cause undefined when not provided', () => {
    const error = new YtDlpError('UNKNOWN', 'boom');
    expect(error.taskId).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});

describe('normalizeError', () => {
  it('passes through an existing YtDlpError unchanged', () => {
    const original = new YtDlpError('INVALID_URL', 'nope');
    expect(normalizeError(original)).toBe(original);
  });

  it('parses native-prefixed messages into a typed error', () => {
    const error = normalizeError(new Error('YTD_NATIVE|GEO_RESTRICTED|Blocked'));
    expect(error).toBeInstanceOf(YtDlpError);
    expect(error.code).toBe('GEO_RESTRICTED');
    expect(error.message).toBe('Blocked');
  });

  it('accepts native-prefixed string throws', () => {
    const error = normalizeError('YTD_NATIVE|NETWORK_ERROR|timeout');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe('timeout');
  });

  it('maps unknown native codes to UNKNOWN', () => {
    const error = normalizeError(new Error('YTD_NATIVE|NOT_A_REAL_CODE|oops'));
    expect(error.code).toBe('UNKNOWN');
  });

  it('falls back to UNKNOWN for plain errors without leaking stack traces', () => {
    const error = normalizeError(new Error('kaboom'));
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('kaboom');
  });

  it('uses the fallback message for non-error, non-string causes', () => {
    const error = normalizeError({ weird: true }, 'Fallback');
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('Fallback');
  });
});

describe('fromNativeCode', () => {
  it('builds an error from a code and message', () => {
    const error = fromNativeCode('STORAGE_ERROR', 'No space');
    expect(error.code).toBe('STORAGE_ERROR');
    expect(error.message).toBe('No space');
  });

  it('degrades unknown codes to UNKNOWN', () => {
    const error = fromNativeCode('BOGUS', 'x');
    expect(error.code).toBe('UNKNOWN');
  });
});

describe('normalizeExtractionError', () => {
  it('passes through a non-extraction normalized error untouched', () => {
    const error = normalizeExtractionError(new Error('YTD_NATIVE|CANCELLED|stopped'));
    expect(error.code).toBe('CANCELLED');
  });

  it('classifies connection failures as NETWORK_ERROR', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|HTTP Error 429')
    );
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('classifies sign-in prompts as AUTHENTICATION_REQUIRED', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|Please sign in to confirm you are not a bot')
    );
    expect(error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('classifies private content', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|This video is private')
    );
    expect(error.code).toBe('PRIVATE_CONTENT');
  });

  it('classifies age-restricted content', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|Sign in to confirm your age')
    );
    expect(error.code).toBe('AGE_RESTRICTED');
  });

  it('classifies geo-restricted content', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|Not available in your country')
    );
    expect(error.code).toBe('GEO_RESTRICTED');
  });

  it('keeps the base code when nothing matches', () => {
    const error = normalizeExtractionError(
      new Error('YTD_NATIVE|EXTRACTION_FAILED|Unsupported URL')
    );
    expect(error.code).toBe('EXTRACTION_FAILED');
  });
});
