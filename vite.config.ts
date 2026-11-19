/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerPlugin } from './pwa/swPlugin.ts'

/**
 * Какая сборка развёрнута (#15): версия из package.json и короткий хэш коммита.
 * В CI хэш берётся из GITHUB_SHA, локально — из git; без git — «dev».
 */
function buildInfo(): { version: string; commit: string } {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      commit = 'dev'
    }
  }
  return { version: pkg.version, commit }
}

const { version, commit } = buildInfo()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  test: {
    // .claude/ — служебные рабочие деревья агентов: в них свои копии тестов,
    // включая E2E, которые vitest пытался бы запустить.
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', '.claude/**'],
    // Покрытие (#15) считается по логике — звук и предметная область. Экраны
    // (.tsx) проверяют E2E, модульными тестами их не покрыть, и в общем счёте
    // они лишь размывали бы картину. Пороги — чуть ниже нынешних: цель не
    // «покрыть всё», а не дать покрытию тихо проседать.
    coverage: {
      provider: 'v8',
      include: ['src/audio/**', 'src/domain/**'],
      exclude: ['**/*.tsx'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 82, statements: 82, functions: 85, branches: 80 },
    },
  },
})
