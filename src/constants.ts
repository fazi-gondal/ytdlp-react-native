/**
 * Package-level constants.
 */
export const LIBRARY_VERSION = '0.1.0';

export const SUPPORTED_PLATFORM = 'android';

export const SUPPORTED_PLATFORM_MESSAGE = `${'expo-ytdlp-native'} is currently supported on ${SUPPORTED_PLATFORM} only.`;

/** yt-dlp output template used when the caller does not provide a filename. */
export const DEFAULT_FILENAME_TEMPLATE = '%(title)s.%(ext)s';
