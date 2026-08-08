import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const REAL_MIC_WAV = path.resolve('tests/e2e/audio/e2-open-string.wav');

const CHROMIUM_ARGS = ['--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:4173',
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
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
