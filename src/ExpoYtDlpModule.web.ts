import { registerWebModule, NativeModule } from 'expo';

// ExpoYtDlpModule is not available on the web platform.
class ExpoYtDlpModule extends NativeModule<{}> {}

export default registerWebModule(ExpoYtDlpModule, 'ExpoYtDlpModule');
