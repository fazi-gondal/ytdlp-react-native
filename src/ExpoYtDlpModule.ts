/**
 * Thin typed binding to the native `ExpoYtDlp` module.
 *
 * On unsupported platforms (web/iOS) the native module is absent; we detect
 * this here and surface it at call time as `UNSUPPORTED_PLATFORM`, so a plain
 * import never crashes.
 */
import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { DownloadEvent, DownloadStatus } from './types';

export interface DownloadTaskInfo {
  taskId: string;
  directory: string;
}

export interface DownloadStatusInfo {
  taskId: string;
  status: DownloadStatus;
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  filename?: string;
}

export interface ExpoYtDlpNativeModule extends NativeModule<{
  downloadEvent: (event: DownloadEvent) => void;
}> {
  getVersion(): Promise<string>;
  extractInfo(url: string, options: Record<string, unknown>): Promise<string>;
  startDownload(options: Record<string, unknown>): Promise<DownloadTaskInfo>;
  cancelDownload(taskId: string): Promise<boolean>;
  getDownloadStatus(taskId: string): Promise<DownloadStatusInfo | null>;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

export const NativeExpoYtDlp: ExpoYtDlpNativeModule | null =
  requireOptionalNativeModule<ExpoYtDlpNativeModule>('ExpoYtDlp');
