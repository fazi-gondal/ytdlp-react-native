import { cancel, download, extractInfo, getFormats, getVersion } from './YtDlp';
import { YtDlpError } from './errors';

export type * from './types';

/** Main SDK facade. */
export const YtDlp = {
  getVersion,
  extractInfo,
  getFormats,
  download,
  cancel,
};

export { YtDlpError };

export default YtDlp;
