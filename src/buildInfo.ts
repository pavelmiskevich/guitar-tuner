/** Подставляются Vite при сборке (vite.config.ts, define). */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __HAS_DONATE_QR__: boolean;

/** Версия приложения из package.json, например «0.1.8». */
export const APP_VERSION: string = __APP_VERSION__;

/** Короткий хэш коммита, из которого собрана сборка. */
export const APP_COMMIT: string = __APP_COMMIT__;

/** Положен ли в сборку QR-код доната (public/qrCode.png, приходит из секрета CI). */
export const HAS_DONATE_QR: boolean = __HAS_DONATE_QR__;
