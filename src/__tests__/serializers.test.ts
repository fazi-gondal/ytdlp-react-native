import { YtDlpError } from '../errors';
import { serializeDownloadOptions, serializeExtractOptions } from '../serializers';

describe('serializeDownloadOptions', () => {
  it('sends url and format through', () => {
    const out = serializeDownloadOptions({
      url: 'https://x.test/v',
      format: 'bestvideo+bestaudio',
    });
    expect(out.url).toBe('https://x.test/v');
    expect(out.format).toBe('bestvideo+bestaudio');
  });

  it('passes ffmpeg.location through', () => {
    const out = serializeDownloadOptions({
      url: 'https://x.test/v',
      format: 'bestvideo+bestaudio',
      ffmpeg: { location: '/data/user/0/com.app/files/ffmpeg' },
    });
    expect(out.ffmpeg).toEqual({ location: '/data/user/0/com.app/files/ffmpeg' });
  });

  it('trims ffmpeg.location whitespace', () => {
    const out = serializeDownloadOptions({
      url: 'https://x.test/v',
      ffmpeg: { location: '  /data/ffmpeg  ' },
    });
    expect(out.ffmpeg).toEqual({ location: '/data/ffmpeg' });
  });

  it('throws PROCESSING_FAILED for a blank ffmpeg.location', () => {
    expect(() =>
      serializeDownloadOptions({ url: 'https://x.test/v', ffmpeg: { location: '   ' } })
    ).toThrow(YtDlpError);
    try {
      serializeDownloadOptions({ url: 'https://x.test/v', ffmpeg: { location: '   ' } });
    } catch (error) {
      expect((error as YtDlpError).code).toBe('PROCESSING_FAILED');
    }
  });

  it('omits ffmpeg when not provided', () => {
    const out = serializeDownloadOptions({ url: 'https://x.test/v' });
    expect(out.ffmpeg).toBeUndefined();
  });

  it('passes merge through', () => {
    expect(serializeDownloadOptions({ url: 'u', merge: true }).merge).toBe(true);
    expect(serializeDownloadOptions({ url: 'u' }).merge).toBeUndefined();
  });
});

describe('serializeExtractOptions', () => {
  it('returns an empty object when no options are given', () => {
    expect(serializeExtractOptions(undefined)).toEqual({});
    expect(serializeExtractOptions({})).toEqual({});
  });

  it('merges a custom User-Agent into headers', () => {
    const out = serializeExtractOptions({ userAgent: 'UA/1.0' });
    expect(out.headers).toEqual({ 'User-Agent': 'UA/1.0' });
  });

  it('passes headers and cookies through', () => {
    const out = serializeExtractOptions({
      headers: { Referer: 'https://x.test' },
      cookies: { source: 'file', path: '/data/cookies.txt' },
    });
    expect(out.headers).toEqual({ Referer: 'https://x.test' });
    expect(out.cookies).toEqual({ path: '/data/cookies.txt' });
  });
});
