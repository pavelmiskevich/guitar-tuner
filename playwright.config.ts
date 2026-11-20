import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const REAL_MIC_WAV = path.resolve(import.meta.dirname, 'tests/e2e/audio/e2-open-string.wav');

const CHROMIUM_ARGS = ['--autoplay-policy=no-user-gesture-required'];

/**
 * Порт сервера предпросмотра. Переопределяется через E2E_PORT, чтобы два прогона
 * из разных рабочих копий не делили один сервер: при reuseExistingServer второй
 * прогон молча тестировал бы чужую сборку.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

/**
 * Адрес IPv4, а не localhost: Node может слушать «localhost» на ::1, а Firefox
 * ходит на 127.0.0.1 и получал NS_ERROR_CONNECTION_REFUSED. Оба адреса —
 * безопасный контекст, так что микрофон и service worker работают одинаково.
 */
const HOST = '127.0.0.1';

/**
 * Спеки, которые проверяют интерфейс без звука с микрофона: их гоняем ещё и в
 * Firefox и WebKit (#15). Анализ звука — в Chromium: фейковый микрофон держится
 * на тонкостях Web Audio, а WebKit под Windows микрофона не даёт вовсе. Тесты
 * внутри этих спек, которым микрофон всё же нужен, помечены тегом @mic.
 *
 * Ещё два тега — ограничения тестовых браузеров на раннере, а не приложения:
 * - @audio-clock: тест ждёт, что доли метронома идут по часам AudioContext.
 *   Firefox на Linux-раннере без звуковой карты часы не двигает — доля не
 *   уходит дальше первой; на машине со звуком те же тесты проходят.
 * - @sw-offline: перезагрузка в офлайне через service worker. WebKit
 *   Playwright падает на ней с «WebKit encountered an internal error».
 */
const NO_MIC_SPECS = /(smoke|navigation|fretboard|metronome|theme|settings|pwa|resilience|a11y)\.spec\.ts/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    // Приложение при первом запуске берёт тему из системы (#10). По умолчанию
    // Playwright эмулирует светлую систему; тёмная — основная тема приложения,
    // и с ней проверка «выбранная дневная тема переживает перезагрузку»
    // остаётся содержательной. Светлую систему тест темы задаёт сам.
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      testIgnore: /smoke-realmic\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: CHROMIUM_ARGS },
      },
    },
    {
      name: 'chromium-mobile',
      testIgnore: /smoke-realmic\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: CHROMIUM_ARGS },
      },
    },
    {
      name: 'firefox-desktop',
      testMatch: NO_MIC_SPECS,
      grepInvert: /@mic|@audio-clock/,
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'webkit-mobile',
      testMatch: NO_MIC_SPECS,
      grepInvert: /@mic|@sw-offline/,
      use: {
        ...devices['iPhone 15'],
      },
    },
    {
      name: 'chromium-realmic',
      testMatch: /smoke-realmic\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            ...CHROMIUM_ARGS,
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${REAL_MIC_WAV}`,
          ],
        },
      },
    },
  ],
  webServer: {
    // Через npm-скрипт, а не `cmd /c ...`: на Linux-раннере CI команды `cmd` нет,
    // и E2E падали с `cmd: not found` ещё до запуска браузера. Внутри npm-скрипта
    // `&&` одинаково работает и в sh, и в cmd.
    // Аргументы после `--` npm дописывает в конец скрипта, то есть к vite preview.
    command: `npm run preview:e2e -- --host ${HOST} --port ${PORT}`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
