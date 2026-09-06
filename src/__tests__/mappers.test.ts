import { mapDownloadProgress, mapFormat, mapVideoInfo } from '../mappers';

describe('mapVideoInfo', () => {
  it('maps known fields and ignores unknown ones', () => {
    const info = mapVideoInfo({
      id: 'abc',
      title: 'Hello',
      duration: 12.5,
      duration_string: '00:12',
      view_count: 100,
      is_live: true,
      live_status: 'is_live',
      extractor: 'youtube',
      thumbnail: 'https://example.com/t.jpg',
      formats: [],
    });

    expect(info.id).toBe('abc');
    expect(info.title).toBe('Hello');
    expect(info.duration).toBe(12.5);
    expect(info.durationString).toBe('00:12');
    expect(info.viewCount).toBe(100);
    expect(info.isLive).toBe(true);
    expect(info.wasLive).toBe(false);
    expect(info.extractor).toBe('youtube');
    expect(info.thumbnail).toBe('https://example.com/t.jpg');
    expect(info.formats).toEqual([]);
  });

  it('treats missing fields as undefined', () => {
    const info = mapVideoInfo({});
    expect(info.title).toBeUndefined();
    expect(info.duration).toBeUndefined();
    expect(info.likeCount).toBeUndefined();
    expect(info.formats).toEqual([]);
  });

  it('maps non-live statuses as not live', () => {
    expect(mapVideoInfo({ live_status: 'was_live' }).wasLive).toBe(true);
    expect(mapVideoInfo({ live_status: 'not_live' }).isLive).toBe(false);
  });

  it('normalizes thumbnails and falls back to the single thumbnail', () => {
    const info = mapVideoInfo({
      thumbnails: [
        { url: 'https://example.com/a.jpg', width: 120, height: 90 },
        { url: 'https://example.com/b.jpg' },
      ],
    });
    expect(info.thumbnails).toHaveLength(2);
    expect(info.thumbnails[0]).toEqual({
      url: 'https://example.com/a.jpg',
      width: 120,
      height: 90,
      resolution: undefined,
      id: undefined,
    });
  });

  it('skips thumbnails without a url and creates one from the single thumbnail', () => {
    const info = mapVideoInfo({
      thumbnails: [{ width: 10 }],
      thumbnail: 'https://example.com/fallback.jpg',
    });
    expect(info.thumbnails).toHaveLength(1);
    expect(info.thumbnails[0].url).toBe('https://example.com/fallback.jpg');
  });

  it('converts numeric strings to numbers', () => {
    const info = mapVideoInfo({ duration: '42', view_count: '7' });
    expect(info.duration).toBe(42);
    expect(info.viewCount).toBe(7);
  });
});

describe('mapFormat', () => {
  it('maps a combined stream with video and audio', () => {
    const format = mapFormat({
      format_id: '18',
      url: 'https://example.com/v.mp4',
      ext: 'mp4',
      width: 640,
      height: 360,
      vcodec: 'avc1',
      acodec: 'mp4a',
      filesize: 1000,
    });

    expect(format.id).toBe('18');
    expect(format.url).toBe('https://example.com/v.mp4');
    expect(format.width).toBe(640);
    expect(format.hasVideo).toBe(true);
    expect(format.hasAudio).toBe(true);
    expect(format.audioOnly).toBe(false);
    expect(format.videoOnly).toBe(false);
  });

  it('detects audio-only and video-only streams', () => {
    const audio = mapFormat({ format_id: '140', vcodec: 'none', acodec: 'mp4a' });
    expect(audio.hasAudio).toBe(true);
    expect(audio.hasVideo).toBe(false);
    expect(audio.audioOnly).toBe(true);

    const video = mapFormat({ format_id: '137', vcodec: 'avc1', acodec: 'none' });
    expect(video.hasVideo).toBe(true);
    expect(video.hasAudio).toBe(false);
    expect(video.videoOnly).toBe(true);
  });

  it('falls back to a blank string id rather than leaking garbage', () => {
    expect(mapFormat({}).id).toBe('');
    expect(mapFormat({}).hasVideo).toBe(false);
  });

  it('maps format id from either key', () => {
    expect(mapFormat({ id: 'x' }).id).toBe('x');
    expect(mapFormat({ format_id: 'y' }).id).toBe('y');
  });

  it('treats non-finite numbers as undefined', () => {
    const format = mapFormat({ width: NaN, fps: 'NaN', abr: Infinity });
    expect(format.width).toBeUndefined();
    expect(format.fps).toBeUndefined();
    expect(format.abr).toBeUndefined();
  });
});

describe('mapDownloadProgress', () => {
  it('maps a full progress payload', () => {
    const progress = mapDownloadProgress(
      {
        status: 'downloading',
        phase: 'downloading',
        percent: 50,
        downloadedBytes: 100,
        totalBytes: 200,
        speedBytesPerSecond: 10,
        etaSeconds: 5,
        filename: 'video.mp4',
      },
      'task-1'
    );

    expect(progress).not.toBeNull();
    expect(progress?.taskId).toBe('task-1');
    expect(progress?.status).toBe('downloading');
    expect(progress?.percent).toBe(50);
    expect(progress?.filename).toBe('video.mp4');
  });

  it('normalizes phase values', () => {
    expect(mapDownloadProgress({ phase: 'extracting' }, 't')?.phase).toBe('extracting');
    expect(mapDownloadProgress({ phase: 'processing' }, 't')?.phase).toBe('processing');
    expect(mapDownloadProgress({ phase: 'unknown' }, 't')?.phase).toBe('downloading');
  });

  it('returns null for non-object payloads', () => {
    expect(mapDownloadProgress(null, 't')).toBeNull();
    expect(mapDownloadProgress('downloading', 't')).toBeNull();
  });

  it('never returns NaN - missing numbers become undefined', () => {
    const progress = mapDownloadProgress({ percent: NaN, etaSeconds: 'bad' }, 't');
    expect(progress?.percent).toBeUndefined();
    expect(progress?.etaSeconds).toBeUndefined();
  });
});
