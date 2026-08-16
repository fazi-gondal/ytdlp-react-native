import { NativeModule, registerWebModule } from 'expo';

import { SUPPORTED_PLATFORM_MESSAGE } from './constants';

/**
 * Web placeholder. The package is Android-only (see AGENTS.md §3); every
 * method throws a meaningful error instead of a silent no-op.
 */
class ExpoYtDlpModule extends NativeModule {
  getVersion(): Promise<string> {
    throw new Error(SUPPORTED_PLATFORM_MESSAGE);
  }
}

export default registerWebModule(ExpoYtDlpModule, 'ExpoYtDlp');
