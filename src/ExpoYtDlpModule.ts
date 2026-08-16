import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoYtDlpModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoYtDlpModule>('ExpoYtDlp');
