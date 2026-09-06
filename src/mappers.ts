/**
 * Mapping from the raw JSON produced by yt-dlp into the stable public types.
 *
 * Everything is defensive: unknown fields become `undefined`, never fake
 * values (see AGENTS.md §11, §69, §70).
 */
import type { DownloadProgress, Format, Thumbnail, VideoInfo } from './types';

type RawRecord = Record<string, unknown>;

const NONE_CODEC = 'none';

export function mapVideoInfo(raw: unknown): VideoInfo {
  const info = asRecord(raw);

  const formats = Array.isArray(info.formats) ? info.formats.map(mapFormat) : [];

  const liveStatus = stringOf(info.live_status);
  const thumbnails = normalizeThumbnails(info.thumbnails, stringOf(info.thumbnail));

  return {
    id: stringOf(info.id),
    title: stringOf(info.title),
    description: stringOf(info.description),
    uploader: stringOf(info.uploader),
    uploaderId: stringOf(info.uploader_id),
    uploaderUrl: stringOf(info.uploader_url),
    channel: stringOf(info.channel),
    channelId: stringOf(info.channel_id),
    channelUrl: stringOf(info.channel_url),
    webpageUrl: stringOf(info.webpage_url),
    originalUrl: stringOf(info.original_url),
    thumbnail: firstThumbnailUrl(thumbnails) ?? stringOf(info.thumbnail),
    thumbnails,
    duration: numberOf(info.duration),
    durationString: stringOf(info.duration_string),
    uploadDate: stringOf(info.upload_date),
    timestamp: numberOf(info.timestamp),
    viewCount: numberOf(info.view_count),
    likeCount: numberOf(info.like_count),
    commentCount: numberOf(info.comment_count),
    ageLimit: numberOf(info.age_limit),
    isLive: liveStatus === 'is_live',
    wasLive: liveStatus === 'was_live',
    extractor: stringOf(info.extractor),
    extractorKey: stringOf(info.extractor_key),
    webpageUrlDomain: stringOf(info.webpage_url_domain),
    formats,
  };
}

export function mapFormat(raw: unknown): Format {
  const format = asRecord(raw);
  const vcodec = stringOf(format.vcodec);
  const acodec = stringOf(format.acodec);
  const hasVideo = vcodec !== undefined && vcodec.toLowerCase() !== NONE_CODEC;
  const hasAudio = acodec !== undefined && acodec.toLowerCase() !== NONE_CODEC;

  return {
    id: stringOf(format.format_id) ?? stringOf(format.id) ?? '',
    url: stringOf(format.url),
    ext: stringOf(format.ext),
    protocol: stringOf(format.protocol),
    format: stringOf(format.format),
    formatNote: stringOf(format.format_note),
    width: numberOf(format.width),
    height: numberOf(format.height),
    fps: numberOf(format.fps),
    vcodec,
    acodec,
    abr: numberOf(format.abr),
    vbr: numberOf(format.vbr),
    tbr: numberOf(format.tbr),
    filesize: numberOf(format.filesize),
    filesizeApprox: numberOf(format.filesize_approx),
    quality: numberOf(format.quality),
    audioOnly: hasAudio && !hasVideo,
    videoOnly: hasVideo && !hasAudio,
    hasVideo,
    hasAudio,
    language: stringOf(format.language),
    container: stringOf(format.container),
  };
}

/**
 * Maps the raw progress payload from the native `downloadEvent` into a
 * `DownloadProgress`, replacing any non-finite numbers with `undefined`.
 */
export function mapDownloadProgress(raw: unknown, taskId: string): DownloadProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const progress = raw as RawRecord;

  const percent = numberOf(progress.percent);
  const phaseRaw = stringOf(progress.phase);

  return {
    taskId,
    status: statusOf(progress.status),
    phase: phaseRaw === 'extracting' || phaseRaw === 'processing' ? phaseRaw : 'downloading',
    percent,
    downloadedBytes: numberOf(progress.downloadedBytes),
    totalBytes: numberOf(progress.totalBytes),
    speedBytesPerSecond: numberOf(progress.speedBytesPerSecond),
    etaSeconds: numberOf(progress.etaSeconds),
    filename: stringOf(progress.filename),
  };
}

function statusOf(value: unknown): DownloadProgress['status'] {
  const s = stringOf(value);
  switch (s) {
    case 'queued':
    case 'extracting':
    case 'downloading':
    case 'processing':
    case 'completed':
    case 'cancelled':
    case 'failed':
      return s;
    default:
      return 'downloading';
  }
}

function normalizeThumbnails(value: unknown, fallbackUrl?: string): Thumbnail[] {
  const result: Thumbnail[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      const url = stringOf(record.url);
      if (!url) continue;
      result.push({
        url,
        width: numberOf(record.width),
        height: numberOf(record.height),
        resolution: stringOf(record.resolution),
        id: stringOf(record.id),
      });
    }
  }
  if (result.length === 0 && fallbackUrl) {
    result.push({ url: fallbackUrl });
  }
  return result;
}

function firstThumbnailUrl(thumbnails: Thumbnail[]): string | undefined {
  return thumbnails[0]?.url;
}

function stringOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asRecord(value: unknown): RawRecord {
  if (typeof value === 'object' && value !== null) return value as RawRecord;
  return {};
}
