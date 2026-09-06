/**
 * JS-side `DownloadTask` implementation.
 *
 * Keeps this module dependency-light: all per-task state lives in the native
 * task registry; the JS object only relays events and forwards commands
 * (AGENTS.md §17, §47).
 */
import type { DownloadStatusInfo, ExpoYtDlpNativeModule } from './ExpoYtDlpModule';
import { YtDlpError } from './errors';
import { attachTaskListeners } from './events';
import type {
  DownloadProgress,
  DownloadResult,
  DownloadStateEvent,
  DownloadStatus,
  DownloadTask,
  Subscription,
} from './types';

type Listener<T> = (value: T) => void;

interface TaskListenerSets {
  progress: Set<Listener<DownloadProgress>>;
  state: Set<Listener<DownloadStateEvent>>;
  completed: Set<Listener<DownloadResult>>;
  error: Set<Listener<YtDlpError>>;
}

export class YtDlpDownloadTask implements DownloadTask {
  readonly id: string;

  private readonly native: ExpoYtDlpNativeModule;
  private currentStatus: DownloadStatus = 'queued';
  private finalized = false;
  private readonly listeners: TaskListenerSets = {
    progress: new Set(),
    state: new Set(),
    completed: new Set(),
    error: new Set(),
  };
  private subscriptions: Subscription[] = [];

  constructor(native: ExpoYtDlpNativeModule, id: string) {
    this.native = native;
    this.id = id;
    this.subscriptions = attachTaskListeners(id, {
      progress: (progress) => {
        this.currentStatus = progress.status;
        this.listeners.progress.forEach((listener) => listener(progress));
      },
      state: (state) => {
        this.currentStatus = state.status;
        this.listeners.state.forEach((listener) => listener(state));
      },
      completed: (result) => {
        this.finalized = true;
        this.currentStatus = 'completed';
        this.teardown();
        this.listeners.completed.forEach((listener) => listener(result));
      },
      cancelled: () => {
        this.finalized = true;
        this.currentStatus = 'cancelled';
        this.teardown();
      },
      error: (error) => {
        this.finalized = true;
        this.currentStatus = 'failed';
        this.teardown();
        this.listeners.error.forEach((listener) => listener(error));
      },
    });
  }

  async cancel(): Promise<void> {
    await this.native.cancelDownload(this.id);
  }

  async pause(): Promise<boolean> {
    return this.native.pauseDownload(this.id);
  }

  async resume(): Promise<boolean> {
    return this.native.resumeDownload(this.id);
  }

  async getStatus(): Promise<DownloadStatus> {
    if (this.finalized) return this.currentStatus;
    const info = await this.native.getDownloadStatus(this.id);
    if (info?.status) this.currentStatus = info.status;
    return this.currentStatus;
  }

  async getProgress(): Promise<DownloadProgress | null> {
    const info = await this.native.getDownloadStatus(this.id);
    if (!info) return null;
    return mapStatusInfo(this.id, this.currentStatus, info);
  }

  addListener(event: 'progress', listener: Listener<DownloadProgress>): Subscription;
  addListener(event: 'state', listener: Listener<DownloadStateEvent>): Subscription;
  addListener(event: 'completed', listener: Listener<DownloadResult>): Subscription;
  addListener(event: 'error', listener: Listener<YtDlpError>): Subscription;
  addListener(
    event: 'progress' | 'state' | 'completed' | 'error',
    listener:
      | Listener<DownloadProgress>
      | Listener<DownloadStateEvent>
      | Listener<DownloadResult>
      | Listener<YtDlpError>
  ): Subscription {
    const set =
      event === 'progress'
        ? this.listeners.progress
        : event === 'state'
          ? this.listeners.state
          : event === 'completed'
            ? this.listeners.completed
            : this.listeners.error;
    set.add(listener as never);
    return {
      remove: () => {
        set.delete(listener as never);
      },
    };
  }

  private teardown() {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
  }
}

function mapStatusInfo(
  taskId: string,
  fallbackStatus: DownloadStatus,
  info: DownloadStatusInfo
): DownloadProgress {
  return {
    taskId,
    status: (info.status ?? fallbackStatus) as DownloadStatus,
    phase: phaseOf(info.status),
    percent: finiteOrUndefined(info.percent),
    downloadedBytes: finiteOrUndefined(info.downloadedBytes),
    totalBytes: finiteOrUndefined(info.totalBytes),
    speedBytesPerSecond: finiteOrUndefined(info.speedBytesPerSecond),
    etaSeconds: finiteOrUndefined(info.etaSeconds),
    filename: info.filename,
  };
}

function phaseOf(status: DownloadStatus): DownloadProgress['phase'] {
  switch (status) {
    case 'downloading':
    case 'paused':
      return 'downloading';
    case 'completed':
    case 'processing':
      return 'processing';
    default:
      return 'extracting';
  }
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Number.isFinite(value) ? value : undefined;
}
