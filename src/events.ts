/**
 * Shared helpers for reacting to native `downloadEvent` emissions.
 */
import { NativeExpoYtDlp } from './ExpoYtDlpModule';
import { fromNativeCode, type YtDlpError } from './errors';
import type {
  DownloadEvent,
  DownloadProgress,
  DownloadResult,
  DownloadStateEvent,
  Subscription,
} from './types';

const EVENT_NAME = 'downloadEvent';

/**
 * Returns a per-task subscription backed by the native event stream.
 * `taskId` is used to filter events that belong to another task.
 */
export function subscribeToTask(
  taskId: string,
  handler: (event: DownloadEvent) => void
): Subscription {
  return subscribeToDownloadEvents((event) => {
    if (event.taskId === taskId) {
      handler(event);
    }
  });
}

export function subscribeToDownloadEvents(handler: (event: DownloadEvent) => void): Subscription {
  if (!NativeExpoYtDlp) {
    return { remove: () => {} };
  }
  // The native module is itself an EventEmitter (Expo SDK 52+); the old
  // `new NativeEventEmitter(module)` path requires `addListener`/`removeListeners`
  // that Expo modules do not expose.
  const subscription = NativeExpoYtDlp.addListener(EVENT_NAME, (event: DownloadEvent) => {
    try {
      handler(normalizeEvent(event));
    } catch {
      // Never let a listener crash the JS runtime.
    }
  });
  return { remove: () => subscription.remove() };
}

/**
 * Adds task-level listeners to a [DownloadTask] from a raw subscription
 * factory. Keeps the event filtering in one place.
 */
export function attachTaskListeners(
  taskId: string,
  listeners: {
    progress?: (progress: DownloadProgress) => void;
    state?: (state: DownloadStateEvent) => void;
    completed?: (result: DownloadResult) => void;
    cancelled?: () => void;
    error?: (error: YtDlpError) => void;
  }
): Subscription[] {
  const subs: Subscription[] = [];

  subs.push(
    subscribeToTask(taskId, (event) => {
      switch (event.type) {
        case 'progress':
          if (event.progress && listeners.progress) listeners.progress(event.progress);
          break;
        case 'state':
          if (listeners.state) listeners.state({ taskId: event.taskId, status: event.status });
          break;
        case 'completed':
          if (event.result && listeners.completed) listeners.completed(event.result);
          break;
        case 'cancelled':
          if (listeners.cancelled) listeners.cancelled();
          if (listeners.state) listeners.state({ taskId: event.taskId, status: 'cancelled' });
          break;
        case 'error':
          if (event.error) {
            const error = fromNativeCode(event.error.code, event.error.message);
            if (listeners.error) listeners.error(error);
          }
          break;
      }
    })
  );

  return subs;
}

function normalizeEvent(event: DownloadEvent): DownloadEvent {
  if (event.type === 'progress' && event.progress) {
    return {
      ...event,
      progress: {
        taskId: event.taskId,
        status: event.status,
        phase: event.progress.phase,
        percent: finiteOrUndefined(event.progress.percent),
        downloadedBytes: finiteOrUndefined(event.progress.downloadedBytes),
        totalBytes: finiteOrUndefined(event.progress.totalBytes),
        speedBytesPerSecond: finiteOrUndefined(event.progress.speedBytesPerSecond),
        etaSeconds: finiteOrUndefined(event.progress.etaSeconds),
        filename: event.progress.filename,
      },
    };
  }
  return event;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Number.isFinite(value) ? value : undefined;
}
