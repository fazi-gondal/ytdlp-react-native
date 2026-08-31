# AGENTS.md

# Project: ytdlp-react-native

## 0. Mission

Build a production-quality, Android-first Expo/React Native native module named:

`ytdlp-react-native`

The package will wrap the Android library:

`dev.ffmpegkit-maintained:yt-dlp-android`

and expose a clean, strongly typed, feature-rich TypeScript API to Expo / React Native applications.

The final package must be publishable to npm and usable by third-party Expo/React Native applications.

The primary purpose is to expose yt-dlp functionality to JavaScript while keeping the implementation native and asynchronous.

The module must NOT require application developers to manually configure Chaquopy, Python, yt-dlp, or FFmpeg.

The Android dependency is responsible for embedding yt-dlp/Python. The Expo module is an adapter and public API layer.

---

# 1. Important external documentation

Read these before implementing anything:

## Expo

Expo Modules API:

https://docs.expo.dev/modules/overview/

Expo Modules API reference:

https://docs.expo.dev/modules/module-api/

Create a standalone Expo module:

https://docs.expo.dev/more/create-expo-module/

Use a standalone Expo module:

https://docs.expo.dev/modules/use-standalone-expo-module-in-your-project/

Wrap a third-party native library:

https://docs.expo.dev/modules/third-party-library/

Expo native module tutorial:

https://docs.expo.dev/modules/native-module-tutorial/

Expo currently recommends standalone modules when a module is intended to be reused or published to npm.

## yt-dlp Android

Repository:

https://github.com/ffmpegkit-maintained/yt-dlp-android

Maven Central:

https://central.sonatype.com/artifact/dev.ffmpegkit-maintained/yt-dlp-android

Current Maven artifact:

`dev.ffmpegkit-maintained:yt-dlp-android`

IMPORTANT:

Do not hard-code assumptions about the library's Java API.

Inspect the exact version being used and its source/API before implementing the adapter.

## yt-dlp

Official repository:

https://github.com/yt-dlp/yt-dlp

Official documentation:

https://github.com/yt-dlp/yt-dlp#usage-and-options

Do not reimplement yt-dlp's extraction logic.

The native library is the extraction engine.

---

# 2. Product vision

The developer experience should look approximately like this:

```ts
import YtDlp from "ytdlp-react-native";

const info = await YtDlp.extractInfo(url);

console.log(info.title);
console.log(info.duration);
console.log(info.thumbnail);
console.log(info.formats);
```

Downloading:

```ts
const task = await YtDlp.download({
  url,
  format: "bestvideo+bestaudio",
  output: {
    directory: "Movies",
  },
});

task.addListener("progress", progress => {
  console.log(progress.percent);
});
```

Cancellation:

```ts
await task.cancel();
```

The public API must feel like a modern TypeScript library, not like a thin Java-to-JavaScript bridge.

---

# 3. Platform scope

Initial release:

- Android: supported
- iOS: unsupported
- Web: unsupported

Do NOT create fake iOS implementations.

Do NOT silently fall back to JavaScript.

The package must clearly identify Android as the supported platform.

If imported on an unsupported platform, provide a meaningful error.

Example:

```text
ytdlp-react-native is currently supported on Android only.
```

The architecture should leave room for future iOS support, but do not implement iOS unless explicitly requested.

---

# 4. Project initialization

Create the project as a standalone Expo module.

Preferred command:

```bash
npx create-expo-module@latest ytdlp-react-native
```

Choose:

- standalone module
- Android support
- TypeScript
- example application

Do not create this as a local-only Expo module.

The generated example application is part of the development/test workflow.

---

# 5. Expected project structure

Target structure:

```text
ytdlp-react-native/
│
├── android/
│   └── src/
│       └── main/
│           ├── java/
│           │   └── expo/
│           │       └── modules/
│           │           └── ytdlp/
│           │               ├── ExpoYtDlpModule.kt
│           │               ├── YtDlpTask.kt
│           │               ├── YtDlpMapper.kt
│           │               ├── YtDlpException.kt
│           │               └── ...
│           │
│           └── AndroidManifest.xml
│
├── src/
│   ├── ExpoYtDlp.ts
│   ├── YtDlp.ts
│   ├── types.ts
│   ├── errors.ts
│   ├── events.ts
│   ├── constants.ts
│   └── index.ts
│
├── example/
│   ├── app/
│   ├── package.json
│   └── ...
│
├── expo-module.config.json
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── AGENTS.md
└── ...
```

Do not unnecessarily create this exact structure if the latest Expo module template uses a different convention.

Follow the current Expo template where appropriate.

---

# 6. Core architecture

Use this architecture:

```text
React Native / Expo
        │
        ▼
TypeScript public API
        │
        ▼
Expo Modules API
        │
        ▼
Kotlin native module
        │
        ▼
yt-dlp-android
        │
        ├── Python
        │
        └── yt-dlp
```

The TypeScript layer owns:

- public types
- ergonomic API
- input validation
- JS event interfaces
- task abstraction
- error normalization
- documentation-facing API

The Kotlin layer owns:

- native calls
- task lifecycle
- native events
- Android filesystem integration
- URI/path conversion
- cancellation
- native exceptions
- mapping native result objects to JS-compatible objects

The underlying `yt-dlp-android` library owns:

- Python runtime
- yt-dlp
- extraction
- downloading
- yt-dlp internals

Never duplicate yt-dlp logic.

---

# 7. Dependency strategy

Use the exact Maven version of:

```gradle
implementation("dev.ffmpegkit-maintained:yt-dlp-android:<PINNED_VERSION>")
```

Do not use:

```text
+
latest
dynamic versions
```

Pin an exact version.

Before implementation:

1. Inspect Maven Central.
2. Inspect the GitHub source.
3. Determine the exact Java API.
4. Determine available callbacks.
5. Determine result types.
6. Determine cancellation behavior.
7. Determine update/version APIs.
8. Determine whether FFmpeg is bundled.
9. Determine ABI requirements.
10. Determine Android minimum SDK requirements.

Do not guess these APIs.

---

# 8. Native dependency isolation

Keep all dependency-specific code behind an adapter.

For example:

```text
Kotlin
 │
 └── YtDlpEngine
       │
       └── actual yt-dlp-android API
```

Do not spread calls to the third-party library throughout the module.

The reason:

If `yt-dlp-android` changes its Java API, only the adapter should need significant modification.

---

# 9. Public TypeScript API

The API should be feature-rich but stable.

Proposed root API:

```ts
export const YtDlp = {
  extractInfo,
  getFormats,
  download,
  cancel,
  getVersion,
  update,
};
```

Also expose task-based functionality.

Prefer:

```ts
const task = YtDlp.download(...)
```

over exposing raw native IDs wherever possible.

---

# 10. Information extraction

Implement:

```ts
extractInfo(url, options?)
```

Return a normalized object:

```ts
interface VideoInfo {
  id?: string;
  title?: string;
  description?: string;
  uploader?: string;
  uploaderId?: string;
  channel?: string;
  channelId?: string;
  webpageUrl?: string;
  originalUrl?: string;
  thumbnail?: string;
  thumbnails?: Thumbnail[];
  duration?: number;
  durationString?: string;
  uploadDate?: string;
  timestamp?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  ageLimit?: number;
  isLive?: boolean;
  wasLive?: boolean;
  extractor?: string;
  extractorKey?: string;
  webpageUrlDomain?: string;
  formats: Format[];
}
```

Do not promise that every field exists for every website.

Use optional fields.

---

# 11. Format model

Expose a normalized format model.

Example:

```ts
interface Format {
  id: string;
  url?: string;

  ext?: string;
  protocol?: string;

  format?: string;
  formatNote?: string;

  width?: number;
  height?: number;
  fps?: number;

  vcodec?: string;
  acodec?: string;

  abr?: number;
  vbr?: number;

  tbr?: number;

  filesize?: number;
  filesizeApprox?: number;

  quality?: number;

  audioOnly: boolean;
  videoOnly: boolean;

  hasVideo: boolean;
  hasAudio: boolean;

  language?: string;

  container?: string;
}
```

Native values must be converted safely.

Unknown values should become `undefined` rather than fake values.

---

# 12. Download API

Primary API:

```ts
download(options: DownloadOptions): Promise<DownloadTask>;
```

Example:

```ts
const task = await YtDlp.download({
  url,
  format: "bestvideo+bestaudio",
  output: {
    directory: "Movies",
    filename: "%(title)s.%(ext)s",
  },
});
```

---

# 13. Download options

Design:

```ts
interface DownloadOptions {
  url: string;

  format?: string;

  output?: {
    directory?: string;
    filename?: string;
    extension?: string;
  };

  audio?: {
    only?: boolean;
    format?: string;
    quality?: string | number;
  };

  video?: {
    only?: boolean;
    maxHeight?: number;
    maxWidth?: number;
    fps?: number;
  };

  merge?: boolean;

  subtitles?: SubtitleOptions;

  metadata?: MetadataOptions;

  thumbnail?: ThumbnailOptions;

  cookies?: CookieOptions;

  headers?: Record<string, string>;

  userAgent?: string;

  referer?: string;

  proxy?: string;

  playlist?: PlaylistOptions;

  network?: NetworkOptions;
}
```

Do not invent yt-dlp options that the underlying Android wrapper cannot support.

Only expose functionality that can actually be implemented.

---

# 14. Convenience format selection

Support raw yt-dlp format expressions:

```ts
format: "best"
format: "bestvideo+bestaudio"
format: "worst"
format: "bestaudio"
format: "best[height<=720]"
```

Also optionally support a higher-level selector:

```ts
format: {
  video: {
    quality: "best",
    maxHeight: 1080,
  },
  audio: {
    quality: "best",
  },
}
```

Internally translate this to yt-dlp format expressions.

Keep raw format expressions available for advanced users.

---

# 15. Audio-only convenience API

Provide:

```ts
downloadAudio(options)
```

Equivalent to:

```ts
download({
  ...options,
  audio: {
    only: true,
  },
});
```

Do not duplicate the native implementation.

---

# 16. Video-only convenience API

Provide:

```ts
downloadVideo(options)
```

Again, implement through the core download engine.

---

# 17. DownloadTask

Create a JS-friendly task object.

Example:

```ts
interface DownloadTask {
  id: string;

  cancel(): Promise<void>;

  pause?(): Promise<void>;

  resume?(): Promise<void>;

  getStatus(): Promise<DownloadStatus>;

  getProgress(): Promise<DownloadProgress>;

  addListener(
    event: "progress",
    listener: (progress: DownloadProgress) => void
  ): Subscription;

  addListener(
    event: "state",
    listener: (state: DownloadStateEvent) => void
  ): Subscription;
}
```

Do not expose unnecessary native implementation details.

---

# 18. Download states

Use:

```ts
type DownloadStatus =
  | "queued"
  | "extracting"
  | "downloading"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";
```

If the native library provides more precise states, map them to these public states.

---

# 19. Progress API

Expose:

```ts
interface DownloadProgress {
  taskId: string;

  status: DownloadStatus;

  percent?: number;

  downloadedBytes?: number;

  totalBytes?: number;

  speedBytesPerSecond?: number;

  etaSeconds?: number;

  filename?: string;

  phase:
    | "extracting"
    | "downloading"
    | "processing";
}
```

Do not assume that total size is always known.

Do not return `NaN`.

Use `undefined` for unavailable numeric values.

---

# 20. Native events

Use Expo Modules API events.

The Kotlin implementation should emit events such as:

```text
progress
state
completed
error
```

Prefer one unified event stream if it makes the public API cleaner.

For example:

```ts
YtDlp.addListener("downloadProgress", ...)
```

Events must contain the task ID.

This allows multiple downloads to run simultaneously.

---

# 21. Multiple concurrent downloads

The library should support:

```ts
const a = await YtDlp.download({...});
const b = await YtDlp.download({...});
const c = await YtDlp.download({...});
```

Each task must have a unique ID.

Never store a single global "current download".

Use a concurrent task registry on Android.

Example concept:

```text
ConcurrentHashMap<String, YtDlpTask>
```

Protect shared state.

---

# 22. Cancellation

Cancellation is mandatory.

Expose:

```ts
await task.cancel();
```

Also:

```ts
await YtDlp.cancel(taskId);
```

The second form is useful for persistence/recovery.

Cancellation must call the actual underlying native cancellation mechanism.

Do not simply stop emitting events while allowing the download to continue.

---

# 23. Error model

Create typed errors.

Example:

```ts
type YtDlpErrorCode =
  | "INVALID_URL"
  | "EXTRACTION_FAILED"
  | "DOWNLOAD_FAILED"
  | "CANCELLED"
  | "FORMAT_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "GEO_RESTRICTED"
  | "PRIVATE_CONTENT"
  | "AGE_RESTRICTED"
  | "PROCESSING_FAILED"
  | "STORAGE_ERROR"
  | "UNSUPPORTED_PLATFORM"
  | "UNKNOWN";
```

Expose:

```ts
class YtDlpError extends Error {
  code: YtDlpErrorCode;
  message: string;
  taskId?: string;
  cause?: unknown;
}
```

Never expose raw Java stack traces as the primary user-facing error.

Preserve the original native error internally for debugging.

---

# 24. Storage design

Android has modern scoped storage rules.

Do not blindly write arbitrary files into external storage.

Prefer:

- app-specific external storage
- MediaStore
- caller-provided content URIs where possible

Design the public API so users can choose an output strategy.

Example:

```ts
output: {
  directory: "Movies"
}
```

or:

```ts
output: {
  location: "mediaStore",
  collection: "movies"
}
```

If MediaStore support is implemented, expose it explicitly.

Do not claim that a string path always represents a public Downloads directory.

---

# 25. Filename handling

Never directly trust arbitrary yt-dlp-generated filenames.

Handle:

- illegal Android filename characters
- path traversal
- excessively long filenames
- empty filenames
- Unicode filenames
- duplicate filenames

Never allow a title such as:

```text
../../something
```

to escape the intended directory.

---

# 26. Security

Treat URLs, filenames, headers, cookies, proxy values, and metadata as untrusted input.

Never execute user-provided strings through a shell.

Never construct shell commands using naive string concatenation if the underlying API provides structured arguments.

Do not log:

- cookies
- authorization headers
- private URLs containing secrets
- proxy credentials

---

# 27. Cookies

If cookies are supported, expose them carefully.

Possible API:

```ts
cookies: {
  source: "file",
  path: "...",
}
```

or:

```ts
cookies: {
  content: "...",
}
```

Do not automatically extract cookies from other Android applications.

Do not access browser databases without explicit, supported mechanisms.

---

# 28. Headers

Support:

```ts
headers?: Record<string, string>
```

but validate input.

Never log authorization headers.

---

# 29. Network options

If supported by the underlying library:

```ts
network: {
  timeout?: number;
  retries?: number;
}
```

Only expose settings that can actually be enforced.

Do not pretend a setting is supported merely because yt-dlp has an equivalent CLI flag.

---

# 30. Metadata

Where supported:

```ts
metadata: {
  embed: true,
}
```

Potential metadata:

- title
- artist
- album
- uploader
- description
- date

The native dependency and FFmpeg capabilities determine what can actually be embedded.

---

# 31. Thumbnail

Where supported:

```ts
thumbnail: {
  embed: true,
}
```

Do not download thumbnails separately unless the underlying engine requires it.

---

# 32. Subtitles

Expose:

```ts
subtitles: {
  enabled: true,
  languages: ["en", "bn"],
  autoGenerated: true,
}
```

Potentially support:

```ts
writeToFile
embed
format
```

Only implement options that the native yt-dlp wrapper supports.

---

# 33. Playlist support

Playlist downloads must be explicitly controlled.

Example:

```ts
playlist: {
  enabled: true,
  start?: 1,
  end?: 10,
}
```

Do not accidentally download an entire playlist when a user intended a single video.

---

# 34. Extract-only operations

Provide a clean extraction API:

```ts
const info = await YtDlp.extractInfo(url);
```

This must NOT download the media.

Also:

```ts
const formats = await YtDlp.getFormats(url);
```

If possible, `getFormats()` should internally reuse extraction information instead of performing redundant extraction.

---

# 35. Version API

Expose:

```ts
const version = await YtDlp.getVersion();
```

Return:

```ts
interface YtDlpVersion {
  ytDlp: string;
  library?: string;
}
```

Do not assume the wrapper's version equals yt-dlp's version.

---

# 36. Updating yt-dlp

If the underlying Android library supports updating yt-dlp safely, expose:

```ts
await YtDlp.update();
```

Otherwise do not expose an update method.

Important:

The npm package update mechanism and yt-dlp runtime update mechanism are separate concerns.

Document this clearly.

---

# 37. Android lifecycle

Do not assume the React Native JS runtime remains alive for the entire download.

Long-running downloads should be designed with Android lifecycle limitations in mind.

Investigate whether the underlying library can safely run:

- when app is backgrounded
- after activity recreation
- during configuration changes
- when the JS bridge is temporarily unavailable

For a first version, document the supported lifecycle behavior honestly.

Do not claim background-service support unless implemented.

---

# 38. Foreground service

Do NOT automatically add a foreground service in version 1 unless necessary.

If background downloads become a requirement, implement a dedicated Android foreground service architecture rather than trying to keep a normal module method alive indefinitely.

Future architecture:

```text
JS
 │
 ▼
Expo Module
 │
 ▼
DownloadManager
 │
 ▼
ForegroundService
 │
 ▼
yt-dlp
```

This should be a separate feature.

---

# 39. Threading

Never perform long-running extraction/download work on the Android main thread.

Use appropriate background execution.

Do not block:

```text
UI thread
React Native thread
Expo module call thread
```

for the duration of a download.

---

# 40. JS API threading

Promises should resolve/reject only after the corresponding native operation completes.

Progress must arrive through events.

Do not send hundreds/thousands of progress events per second.

Throttle progress events to a reasonable interval.

Target approximately:

```text
100–250 ms
```

unless the underlying library makes a lower frequency necessary.

---

# 41. Input validation

Validate on TypeScript where practical.

Also validate in Kotlin.

Never rely exclusively on JS validation.

Example:

```ts
if (!url.trim()) {
  throw new YtDlpError("INVALID_URL", "URL is required");
}
```

Native code must still reject invalid input.

---

# 42. TypeScript quality

Use strict TypeScript.

Prefer:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Avoid:

```ts
any
```

unless absolutely unavoidable.

Use `unknown` at native boundaries and validate/normalize it.

Public types must be exported from a single stable entry point.

---

# 43. Public API exports

The package should allow:

```ts
import YtDlp from "ytdlp-react-native";
```

and optionally:

```ts
import {
  YtDlpError,
  type VideoInfo,
  type Format,
  type DownloadOptions,
  type DownloadProgress,
} from "ytdlp-react-native";
```

Keep the API discoverable.

---

# 44. API naming

Use camelCase for JavaScript.

Use Kotlin conventions internally.

Examples:

```ts
extractInfo
getFormats
downloadAudio
downloadVideo
getVersion
cancel
```

Avoid leaking Java method naming into TypeScript.

---

# 45. Native module naming

Recommended native module name:

```text
ExpoYtDlp
```

Public JS module name:

```text
ExpoYtDlp
```

npm package:

```text
ytdlp-react-native
```

Use explicit `Name("ExpoYtDlp")` in the Expo module definition.

---

# 46. Event names

Prefer namespaced semantic events:

```text
downloadProgress
downloadState
downloadComplete
downloadError
```

or a single:

```text
downloadEvent
```

Choose whichever produces the cleanest stable public API.

The event payload must always include:

```ts
taskId: string
```

for task-related events.

---

# 47. No native implementation leakage

Bad:

```ts
downloadNative({
  javaObjectId: 123,
});
```

Good:

```ts
const task = await YtDlp.download({
  url,
});
```

The npm consumer should not need to understand Kotlin, Java, Python, Chaquopy, AARs, or yt-dlp internals.

---

# 48. Example application

The example app is mandatory.

Build a useful test application containing:

## URL input

```text
URL
[____________________________]

[Extract Info]
[Get Formats]
[Download]
```

## Information screen

Display:

- title
- uploader
- thumbnail
- duration
- extractor
- webpage
- formats

## Download screen

Display:

```text
Downloading...

██████████████░░░░░░ 72%

Speed: 4.8 MB/s
Downloaded: 84 MB
ETA: 00:18

[Cancel]
```

## Error screen

Display normalized errors.

The example app is also the primary manual integration test.

---

# 49. Testing strategy

Implement tests at multiple levels.

## TypeScript tests

Test:

- input validation
- API normalization
- error normalization
- format mapping
- progress mapping

## Kotlin tests

Test:

- native mapping
- task registry
- cancellation
- invalid input
- concurrent tasks

## Integration tests

The example app must test real URLs.

Do NOT depend exclusively on mocks.

---

# 50. Real-world extraction tests

Maintain a small test matrix.

Examples:

```text
YouTube
TikTok
Facebook
Pinterest
Instagram
SoundCloud
generic direct media URL
```

Do not assume all services work forever.

yt-dlp site support changes frequently.

Tests should distinguish:

```text
supported by engine
tested by project
currently working
```

Do not advertise "all sites supported".

---

# 51. Legal/policy documentation

The README must clearly state that:

`ytdlp-react-native` is a technical wrapper around yt-dlp.

Users are responsible for complying with:

- website terms
- copyright law
- content licenses
- authentication rules
- platform policies

Do not market the library as a way to bypass DRM or access unauthorized/private content.

Do not implement DRM circumvention.

---

# 52. DRM

Explicitly do NOT implement DRM circumvention.

Do not attempt to defeat:

- Widevine
- FairPlay
- PlayReady
- encrypted media protections

If a source requires DRM, return an appropriate unsupported/error state.

---

# 53. Authentication

Do not attempt to bypass authentication.

Support only authentication mechanisms that yt-dlp itself and the Android wrapper legitimately expose.

---

# 54. Android permissions

Only request permissions that are genuinely required.

Prefer scoped storage / MediaStore where possible.

Do not request:

```text
MANAGE_EXTERNAL_STORAGE
```

unless there is an unavoidable and well-documented requirement.

Avoid unnecessary dangerous permissions.

---

# 55. Minimum Android version

Determine the actual minimum SDK supported by:

1. current Expo module template
2. current yt-dlp-android dependency
3. required Android APIs

Do not guess.

Document the resulting minimum SDK.

---

# 56. ABI support

Inspect the underlying AAR.

Determine supported ABIs.

Prefer modern devices, especially:

```text
arm64-v8a
```

if the dependency does not support other architectures.

Do not artificially claim universal ABI support.

Test the final package on a real arm64 Android device.

---

# 57. 16 KB page compatibility

Verify that the complete dependency chain is compatible with modern Android 16 KB memory page requirements.

Do not assume the application is compatible merely because the Expo module compiles.

Check the current maintained FFmpeg/yt-dlp Android dependency documentation and release notes.

---

# 58. Gradle dependency conflicts

Check for conflicts involving:

- Kotlin
- AndroidX
- Python/Chaquopy
- FFmpeg
- native libraries
- duplicate resources
- duplicate `.so` files

The Expo module must coexist with a normal Expo application.

Do not force global dependency versions unless necessary.

---

# 59. Dependency version policy

Every native dependency must be pinned.

Do not use:

```gradle
implementation("something:+")
```

Do not use dynamic versions.

Document the exact dependency version in:

```text
README.md
package.json
android/build.gradle
CHANGELOG.md
```

where relevant.

---

# 60. Build validation

Before every release run:

```bash
npm run lint
npm run typecheck
npm run build
```

and the appropriate Android/example build commands.

Also verify the npm package contents:

```bash
npm pack --dry-run
```

The package must contain:

- compiled JS
- declaration files
- Android native sources/build metadata required by Expo
- module config
- README
- LICENSE

Do not accidentally publish:

- `.git`
- caches
- build artifacts that are not needed
- local credentials
- example build outputs
- secrets

---

# 61. npm package design

The package must be a normal npm package.

Expected usage:

```bash
npm install ytdlp-react-native
```

or:

```bash
pnpm add ytdlp-react-native
```

or:

```bash
yarn add ytdlp-react-native
```

The consumer should then be able to run Expo prebuild/build normally.

---

# 62. Peer dependencies

Use appropriate peer dependencies for:

```text
expo
react
react-native
expo-modules-core
```

Do not unnecessarily bundle React or React Native.

Follow the generated Expo module template and current Expo package conventions.

---

# 63. Expo compatibility

Document the supported Expo SDK range.

Do not claim compatibility with every Expo version.

If possible, use the Expo module tooling to keep compatibility aligned with the supported SDK.

---

# 64. README

README must contain:

## Title

`ytdlp-react-native`

## Description

A native Android Expo module providing a TypeScript API around yt-dlp.

## Installation

```bash
npx expo install ytdlp-react-native
```

If `expo install` is not appropriate for the package, document the correct npm command.

## Requirements

Explain:

- Android
- Expo SDK compatibility
- native build required
- Expo Go limitations if applicable

IMPORTANT:

Do not claim that this package works inside standard Expo Go unless it is actually included in Expo Go.

Custom native modules normally require a development build/custom native app.

## Basic usage

Include extraction and download examples.

## API

Document every public method/type.

## Events

Document progress events.

## Errors

Document error codes.

## Storage

Document output behavior.

## Limitations

Document Android-only support and underlying yt-dlp limitations.

## Legal

Include responsible-use statement.

---

# 65. Expo Go

Explicitly explain that this is a custom native module.

Users should expect to use:

```bash
npx expo run:android
```

or an appropriate Expo development/production build.

Do not tell users that plain Expo Go can load arbitrary custom native modules.

---

# 66. Example installation

The README should demonstrate:

```bash
npx expo install ytdlp-react-native
```

Then:

```bash
npx expo prebuild
npx expo run:android
```

Use the current Expo documentation to adjust these commands if the recommended workflow changes.

---

# 67. Example API

README example:

```ts
import YtDlp from "ytdlp-react-native";

const info = await YtDlp.extractInfo(
  "https://www.youtube.com/watch?v=..."
);

console.log(info.title);
console.log(info.formats);
```

Download example:

```ts
const task = await YtDlp.download({
  url: "https://www.youtube.com/watch?v=...",
  format: "bestvideo+bestaudio",
  output: {
    directory: "Movies",
  },
});

task.addListener("progress", progress => {
  console.log(progress.percent);
});
```

Cancellation:

```ts
await task.cancel();
```

---

# 68. API stability

Treat the TypeScript API as the primary product.

Do not expose third-party Java classes/types directly.

Bad:

```ts
type NativeYtDlpResult = JavaObject;
```

Good:

```ts
interface VideoInfo {
  title?: string;
  formats: Format[];
}
```

The underlying native library may change without breaking the public JS API.

---

# 69. Internal mapping layer

Implement explicit mapper functions.

For example:

```text
YtDlpNativeInfo
        ↓
mapNativeInfo()
        ↓
VideoInfo
```

and:

```text
YtDlpNativeFormat
        ↓
mapNativeFormat()
        ↓
Format
```

Never manually map native objects throughout business logic.

---

# 70. Nullability

Kotlin nullability must be respected.

Never blindly cast:

```kotlin
value as String
```

Use safe conversions.

Java APIs may return null.

Map null to:

```ts
undefined
```

rather than:

```ts
null
```

unless `null` has an intentional semantic meaning in the public API.

---

# 71. Serialization

Only send JS-compatible values through Expo module APIs.

Use:

- strings
- numbers
- booleans
- arrays
- serializable objects

Do not expose arbitrary Java/Kotlin objects.

---

# 72. Large metadata

Do not send enormous native payloads through JS unnecessarily.

For example, playlist extraction can potentially produce a large object.

Consider:

```ts
extractInfo()
```

for one item and a separate playlist API for large collections.

Do not load an enormous playlist entirely into memory if streaming/iteration is possible.

---

# 73. Memory

Avoid:

```text
download entire media into RAM
```

Downloads should stream to disk.

Never convert downloaded video/audio into Base64.

Never keep media bytes in JS.

The JS layer should receive metadata/progress/path/URI, not the entire media file.

---

# 74. Result object

A successful download should return something like:

```ts
interface DownloadResult {
  taskId: string;
  path?: string;
  uri?: string;

  filename?: string;
  mimeType?: string;

  size?: number;

  duration?: number;
}
```

Prefer Android content URIs where MediaStore is involved.

---

# 75. Completion event

Completion event:

```ts
interface DownloadCompletedEvent {
  taskId: string;
  result: DownloadResult;
}
```

Failure:

```ts
interface DownloadFailedEvent {
  taskId: string;
  error: YtDlpError;
}
```

Cancellation:

```ts
interface DownloadCancelledEvent {
  taskId: string;
}
```

---

# 76. Task persistence

Version 1 does not need persistent download recovery unless required by the underlying native engine.

However, design task IDs so future persistent task management is possible.

Do not use random JS object references as native identifiers.

Use UUID-like task IDs.

---

# 77. Logging

Implement optional debug logging.

Example:

```ts
YtDlp.configure({
  debug: true,
});
```

Never log secrets.

In production:

```text
debug = false
```

by default.

---

# 78. Native logs

Avoid dumping complete yt-dlp output into Logcat.

If debug logging is enabled, truncate very large messages.

Redact:

- cookies
- authorization
- tokens
- passwords
- proxy credentials

---

# 79. Performance

Optimize for:

- low JS overhead
- minimal event traffic
- streaming downloads
- background native execution
- low memory usage
- concurrent task support

Do not poll native state every 10 ms from JavaScript.

Use native events.

---

# 80. API design principle

Prefer:

```ts
await YtDlp.download(...)
```

over:

```ts
YtDlp.startNativeProcess(...)
```

The public package is an SDK, not a raw wrapper.

---

# 81. Don't overbuild version 1

Version 1 must first deliver:

1. native module
2. yt-dlp dependency
3. extraction
4. format listing
5. download
6. progress
7. cancellation
8. normalized errors
9. example app
10. npm build
11. documentation

Only after this is stable implement:

- playlists
- subtitles
- metadata embedding
- thumbnails
- advanced cookies
- background service
- persistent tasks
- advanced format builder

---

# 82. Development phases

## Phase 1 — Scaffold

Create standalone Expo module.

Verify:

```bash
npm install
npm run build
```

Run example app.

---

## Phase 2 — Native dependency

Add:

```text
dev.ffmpegkit-maintained:yt-dlp-android
```

with exact version.

Verify the example Android application builds.

---

## Phase 3 — Native smoke test

Create the smallest Kotlin function possible:

```text
getVersion()
```

Call it from TypeScript.

Verify the Java/Kotlin API is correctly connected.

---

## Phase 4 — Extraction

Implement:

```ts
extractInfo(url)
```

Test with several public URLs.

---

## Phase 5 — Format extraction

Implement:

```ts
getFormats(url)
```

Normalize native format objects.

---

## Phase 6 — Download

Implement:

```ts
download(options)
```

First support the simplest possible download.

Do not implement every option yet.

---

## Phase 7 — Progress

Implement native event emission.

Add:

```ts
progress
```

events.

Throttle event frequency.

---

## Phase 8 — Cancellation

Implement task registry and cancellation.

Test:

```text
start
cancel immediately
cancel during download
cancel near completion
```

---

## Phase 9 — Errors

Create normalized error classes and codes.

Test:

```text
invalid URL
unsupported URL
network failure
format unavailable
cancelled task
processing failure
```

---

## Phase 10 — Storage

Implement safe Android file handling.

Test:

- app-specific storage
- MediaStore if supported
- duplicate names
- Unicode filenames
- long filenames
- invalid characters

---

## Phase 11 — Rich API

Add:

- audio-only
- video-only
- subtitles
- metadata
- thumbnail
- cookies
- headers
- playlist controls

Only where native support exists.

---

## Phase 12 — Example app

Build a polished demonstration app.

It should act as both:

- documentation
- manual integration test

---

## Phase 13 — Testing

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Then Android integration tests.

---

## Phase 14 — Packaging

Run:

```bash
npm pack --dry-run
```

Inspect package contents.

Then:

```bash
npm publish
```

only after all release checks pass.

---

# 83. Git workflow

Use conventional commits where practical:

```text
feat:
fix:
docs:
refactor:
test:
chore:
perf:
```

Examples:

```text
feat: add download task API
feat: add extraction support
fix: normalize missing filesize
fix: cancel native download correctly
docs: document Android setup
```

---

# 84. CHANGELOG

Maintain:

```text
CHANGELOG.md
```

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Examples:

```text
0.1.0
0.2.0
1.0.0
```

Breaking TypeScript API changes require a major version once stable.

---

# 85. Versioning native dependency

When upgrading yt-dlp-android:

1. inspect release notes
2. inspect API changes
3. inspect transitive dependencies
4. build example app
5. test extraction
6. test download
7. test FFmpeg processing
8. test cancellation
9. test ABI/device compatibility
10. update CHANGELOG

Never upgrade blindly.

---

# 86. Release checklist

Before publishing:

```text
[ ] TypeScript compiles
[ ] Native Android build succeeds
[ ] Example app launches
[ ] Extraction works
[ ] Formats work
[ ] Download works
[ ] Audio/video merging works if supported
[ ] Progress works
[ ] Cancellation works
[ ] Errors are normalized
[ ] Storage works
[ ] No secrets are included
[ ] npm package contents inspected
[ ] README updated
[ ] CHANGELOG updated
[ ] Version bumped
[ ] Git clean
[ ] npm package tested from a fresh project
```

---

# 87. Fresh-project validation

Before release, create a temporary clean Expo project.

Install the local/generated npm package.

Verify:

```text
Expo project
    ↓
npm install ytdlp-react-native
    ↓
expo prebuild
    ↓
Android build
    ↓
extract
    ↓
download
```

This catches packaging/autolinking errors that the example app may hide.

---

# 88. npm publishing

Use npm.

Package should eventually be installable with:

```bash
npm install ytdlp-react-native
```

The package name must be checked for availability before publishing.

Do not assume the package name is available.

If the name is unavailable, select an alternative package name before implementation is finalized.

---

# 89. Package metadata

Ensure `package.json` includes appropriate:

```json
{
  "name": "ytdlp-react-native",
  "version": "0.1.0",
  "description": "...",
  "main": "...",
  "types": "...",
  "keywords": [
    "expo",
    "react-native",
    "yt-dlp",
    "youtube-dl",
    "downloader",
    "android"
  ],
  "license": "MIT"
}
```

Do not copy this blindly.

Follow the latest generated Expo module package structure.

---

# 90. License

The wrapper's own license must be clearly stated.

Do not claim that the entire dependency chain is licensed identically to this package.

Document third-party licenses separately.

The current Maven artifact metadata identifies `yt-dlp-android` as MIT licensed, but dependency licensing must be checked again at release time.

---

# 91. Security policy

Eventually provide:

```text
SECURITY.md
```

Include:

- vulnerability reporting
- supported versions
- responsible disclosure

Do not request sensitive information in public GitHub issues.

---

# 92. GitHub repository

Recommended repository:

```text
ytdlp-react-native
```

Repository description:

```text
A feature-rich Expo native module for yt-dlp on Android.
```

Repository should contain:

```text
README.md
AGENTS.md
CHANGELOG.md
LICENSE
SECURITY.md
```

and the example application.

---

# 93. CI

Add GitHub Actions for:

```text
TypeScript
Lint
Build
Package
```

At minimum:

```text
Node setup
npm install
npm run lint
npm run typecheck
npm run build
npm pack --dry-run
```

Android CI can be added once the base module is stable.

---

# 94. Documentation philosophy

Documentation should answer:

1. What is this?
2. Why use it?
3. How do I install it?
4. What Expo version is supported?
5. Does it work with Expo Go?
6. How do I extract metadata?
7. How do I list formats?
8. How do I download?
9. How do I monitor progress?
10. How do I cancel?
11. How do I save files?
12. What platforms are supported?
13. What are the limitations?
14. What are the legal responsibilities?

---

# 95. Important implementation rule

Do not blindly follow examples from old Expo or React Native tutorials.

Expo Modules API changes over time.

Always prefer the current official Expo documentation:

https://docs.expo.dev/modules/

---

# 96. Important yt-dlp rule

Do not attempt to recreate:

```text
YouTube extractor
TikTok extractor
Facebook extractor
Pinterest extractor
```

inside TypeScript/Kotlin.

That is the job of yt-dlp.

The module should provide a native bridge around the yt-dlp engine.

---

# 97. Important FFmpeg rule

Do not independently download or bundle another FFmpeg implementation unless the underlying `yt-dlp-android` package requires it and its documentation explicitly says how.

First determine whether the selected yt-dlp-android artifact already provides the necessary post-processing capabilities.

Avoid duplicate FFmpeg binaries.

---

# 98. Important Android rule

Do not assume the following are equivalent:

```text
file path
content URI
MediaStore URI
SAF URI
```

Implement proper conversion/handling.

Use Android APIs rather than string manipulation.

---

# 99. Important Expo rule

This is a native module.

Therefore:

```text
Expo Go
```

is not the target runtime unless the module is actually bundled into that runtime.

The primary development target is a custom Android development build / native Android project.

---

# 100. Definition of done

The project is considered complete for version 1.0 only when:

```text
TypeScript API
        ↓
Expo Modules API
        ↓
Kotlin
        ↓
yt-dlp-android
```

works reliably on a real Android device.

A user must be able to:

```ts
import YtDlp from "ytdlp-react-native";

const info = await YtDlp.extractInfo(url);

const task = await YtDlp.download({
  url,
  format: "bestvideo+bestaudio",
});

task.addListener("progress", progress => {
  console.log(progress.percent);
});
```

without manually installing:

- Python
- yt-dlp
- Chaquopy
- FFmpeg
- Termux

The npm package must install cleanly, autolink correctly, build correctly, and provide a documented TypeScript API.

---

# 101. Agent operating rules

When working on this repository:

1. Read this `AGENTS.md` completely before making architectural changes.
2. Inspect existing files before creating replacements.
3. Never guess third-party APIs.
4. Inspect the exact `yt-dlp-android` version being used.
5. Prefer official Expo documentation over old tutorials.
6. Keep native dependency details behind an adapter.
7. Keep the TypeScript API stable and ergonomic.
8. Never expose secrets in logs.
9. Never block the main thread.
10. Never store media in JavaScript memory.
11. Never use Base64 for downloaded media.
12. Never implement DRM circumvention.
13. Never claim unsupported websites/features work.
14. Never publish without running the complete release checklist.
15. Test on a real Android arm64 device.
16. Test installation from a fresh Expo project.
17. Keep documentation synchronized with implementation.
18. Do not add a feature merely because yt-dlp CLI supports it; verify that the Android wrapper can actually provide it.
19. Do not break the public TypeScript API when updating the native dependency.
20. If the underlying library cannot safely provide a feature, document the limitation rather than creating a fake API.

---

# 102. First task for the AI agent

Do NOT immediately implement the complete library.

Start with repository reconnaissance:

```text
1. Inspect the generated Expo module.
2. Inspect package.json.
3. Inspect expo-module.config.json.
4. Inspect Android Gradle configuration.
5. Inspect the current yt-dlp-android Maven artifact.
6. Inspect its GitHub source/API.
7. Determine the exact native classes/methods available.
8. Determine how extraction works.
9. Determine how downloads work.
10. Determine how progress is reported.
11. Determine how cancellation works.
12. Determine FFmpeg/post-processing behavior.
13. Determine supported Android SDK/ABIs.
14. Produce an implementation plan.
```

Do not modify major files until this reconnaissance is complete.

Then implement incrementally:

```text
getVersion()
      ↓
extractInfo()
      ↓
getFormats()
      ↓
download()
      ↓
progress events
      ↓
cancel()
      ↓
errors
      ↓
storage
      ↓
advanced options
```

After every major stage:

```text
build
typecheck
lint
run example Android app
test on device
```

Only then proceed to the next stage.

---

# 103. Final architectural principle

The package should be thought of as:

```text
                 ytdlp-react-native
                      │
        ┌─────────────┴─────────────┐
        │                           │
   TypeScript API             Android Native
        │                           │
        │                       Kotlin
        │                           │
        └──────────────┬────────────┘
                       │
                yt-dlp-android
                       │
                 ┌─────┴─────┐
                 │           │
              Python       yt-dlp
                               │
                         site extractors
```

The goal is NOT:

> "Expose every yt-dlp CLI flag."

The goal is:

> "Build the best possible native Android yt-dlp SDK for Expo/React Native."

The public TypeScript API must remain clean even if the underlying implementation is complex.

Build the native foundation first, then progressively expose capabilities through stable, typed, documented APIs.