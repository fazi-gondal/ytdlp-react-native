import { cancel, download, extractInfo, getFormats, getVersion, pause, resume } from './YtDlp';
import { YtDlpError } from './errors';

export type * from './types';

/** Main SDK facade. */
export const YtDlp = {
  getVersion,
  extractInfo,
  getFormats,
  download,
  cancel,
  pause,
  resume,
};

export { YtDlpError };

export default YtDlp;
