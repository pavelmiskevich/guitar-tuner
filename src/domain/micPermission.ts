/**
 * Подсказки по восстановлению доступа к микрофону.
 *
 * Открыть настройки браузера ссылкой со страницы нельзя: переходы на
 * `chrome://`, `edge://` и `about:` из веб-содержимого заблокированы самим
 * браузером. Поэтому адрес настроек даётся для копирования — его нужно
 * вставить в адресную строку новой вкладки вручную.
 */

export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';

export interface MicPermissionHelp {
  browser: BrowserKind;
  /** Самый быстрый путь — значок в адресной строке. */
  quickStep: string;
  /** Полный путь через настройки. */
  settingsPath: string;
  /** Адрес страницы настроек: копируется, а не открывается ссылкой. */
  settingsUrl: string | null;
}

export function detectBrowser(userAgent: string = navigator.userAgent): BrowserKind {
  const ua = userAgent.toLowerCase();
  // Порядок важен: Edge и Chrome содержат в строке чужие названия.
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('chrome/') || ua.includes('crios/')) return 'chrome';
  if (ua.includes('safari/')) return 'safari';
  return 'other';
}

export function getMicPermissionHelp(browser: BrowserKind = detectBrowser()): MicPermissionHelp {
  switch (browser) {
    case 'chrome':
      return {
        browser,
        quickStep: 'Нажмите значок настроек сайта слева в адресной строке и включите «Микрофон».',
        settingsPath: 'Настройки → Конфиденциальность и безопасность → Настройки сайтов → Микрофон',
        settingsUrl: 'chrome://settings/content/microphone'
      };
    case 'edge':
      return {
        browser,
        quickStep: 'Нажмите значок замка слева в адресной строке и включите «Микрофон».',
        settingsPath: 'Параметры → Файлы cookie и разрешения сайтов → Микрофон',
        settingsUrl: 'edge://settings/content/microphone'
      };
    case 'firefox':
      return {
        browser,
        quickStep: 'Нажмите значок микрофона слева в адресной строке и снимите блокировку.',
        settingsPath: 'Настройки → Приватность и защита → Разрешения → Микрофон',
        settingsUrl: 'about:preferences#privacy'
      };
    case 'safari':
      return {
        browser,
        quickStep: 'Меню Safari → «Настройки для этого веб-сайта» → Микрофон → «Разрешить».',
        settingsPath: 'Safari → Настройки → Веб-сайты → Микрофон',
        settingsUrl: null
      };
    default:
      return {
        browser,
        quickStep: 'Откройте настройки разрешений сайта в адресной строке и включите микрофон.',
        settingsPath: 'Настройки браузера → Разрешения сайтов → Микрофон',
        settingsUrl: null
      };
  }
}

/**
 * Состояние разрешения, если браузер умеет о нём рассказывать.
 * Safari до недавнего времени не поддерживает запрос 'microphone'.
 */
export async function queryMicPermission(): Promise<PermissionState | 'unsupported'> {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName
    });
    return status.state;
  } catch {
    return 'unsupported';
  }
}
