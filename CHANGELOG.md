# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-08-17

### Fixed

- Downloads no longer fail with `Download failed: null`. The Python `execute`
  helper was fetched from the exec namespace with attribute access
  (`PyObject.get`) even though it is a dict item; the downloader now uses
  container access (`ns.asMap()`), which makes `YtDlp.download(...)` work.

## [0.1.2] - 2026-08-17

### Fixed

- Chaquopy 17 does not convert Java maps/lists to Python dicts/lists
  automatically. Download and extraction options are now converted explicitly
  so yt-dlp receives real Python containers.

## [0.1.1] - 2026-08-17

### Fixed

- Progress events now arrive through the native event emitter
  (`module.addListener`), matching Expo SDK 52+ modules, instead of RN's
  `NativeEventEmitter`.

## [0.1.0] - 2026-08-16

### Added

- Standalone Expo module for Android with the native yt-dlp engine embedded
  via `dev.ffmpegkit-maintained:yt-dlp-android:2.0.2` (pinned).
- `YtDlp.getVersion()` — read the embedded yt-dlp version and the library version.
- `YtDlp.extractInfo(url, options?)` — extract normalized media information
  without downloading.
- `YtDlp.getFormats(url, options?)` — list normalized download formats,
  reusing the extraction result.
- `YtDlp.download(options)` — start a concurrent download task backed by a
  native task registry.
- `YtDlp.cancel(taskId)` — cancel a task by id.
- `DownloadTask` with `progress` / `state` / `completed` / `error` listeners,
  `cancel()`, `getStatus()` and `getProgress()`.
- Native cancellation via a custom Chaquopy progress hook that aborts yt-dlp.
- Progress events throttled to ~200 ms with structured numeric fields.
- Normalized `YtDlpError` codes and safe error translation across the bridge.
- Safe app-scoped file storage with filename/directory sanitization and
  path-traversal protection.
- Supported options: `format`, `output`, `headers`, `userAgent`, `referer`,
  `proxy`, `cookies.path`, `playlist`, `subtitles`, `network`.
- Example application (`example/`) for manual integration testing.

### Unsupported

- iOS and web.
- FFmpeg-dependent features (merging, audio extraction/re-encoding, metadata
  and thumbnail embedding) are rejected up front with `PROCESSING_FAILED`.
- Runtime updating of the embedded yt-dlp.
- Background/foreground-service downloads.

### Security

- Added `SECURITY.md` with a vulnerability reporting policy.

### Pinned dependency

- `dev.ffmpegkit-maintained:yt-dlp-android:2.0.2`