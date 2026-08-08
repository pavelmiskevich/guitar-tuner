import { describe, it, expect } from 'vitest';
import { detectBrowser, getMicPermissionHelp } from '../src/domain/micPermission';

describe('Подсказки по доступу к микрофону', () => {
  const agents: Record<string, string> = {
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  };

  it('различает браузеры, включая маскирующиеся под Chrome', () => {
    // Edge и Chrome оба содержат "Chrome/", Safari — внутри строки Chrome тоже.
    // Порядок проверок в detectBrowser поэтому существенен.
    expect(detectBrowser(agents.chrome)).toBe('chrome');
    expect(detectBrowser(agents.edge)).toBe('edge');
    expect(detectBrowser(agents.firefox)).toBe('firefox');
    expect(detectBrowser(agents.safari)).toBe('safari');
  });

  it('даёт адрес настроек там, где он существует', () => {
    expect(getMicPermissionHelp('chrome').settingsUrl).toBe('chrome://settings/content/microphone');
    expect(getMicPermissionHelp('edge').settingsUrl).toBe('edge://settings/content/microphone');
    expect(getMicPermissionHelp('firefox').settingsUrl).toBe('about:preferences#privacy');
    // У Safari страницы настроек по адресу нет — обещать её нельзя.
    expect(getMicPermissionHelp('safari').settingsUrl).toBeNull();
  });

  it('всегда предлагает быстрый путь через адресную строку', () => {
    for (const kind of ['chrome', 'edge', 'firefox', 'safari', 'other'] as const) {
      const help = getMicPermissionHelp(kind);
      expect(help.quickStep.length, kind).toBeGreaterThan(20);
      expect(help.settingsPath.length, kind).toBeGreaterThan(10);
    }
  });
});
