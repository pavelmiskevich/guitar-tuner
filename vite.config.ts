/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerPlugin } from './pwa/swPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  test: {
    // .claude/ — служебные рабочие деревья агентов: в них свои копии тестов,
    // включая E2E, которые vitest пытался бы запустить.
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', '.claude/**'],
  },
})
