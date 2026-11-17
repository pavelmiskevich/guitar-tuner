/**
 * Генерация service worker при сборке (#9).
 *
 * После `vite build` плагин обходит каталог сборки, составляет список файлов
 * для предварительного кэширования и подставляет его вместе с хэшем
 * содержимого в шаблон pwa/sw.js. Хэш входит в имя кэша, поэтому каждая
 * выкладка с изменёнными файлами получает свой кэш, а старый удаляется сам —
 * раньше имя кэша было константой и его забывали поднимать.
 *
 * Работает в closeBundle: к этому моменту Vite уже скопировал public/ и в
 * каталоге лежит ровно то, что уедет на сервер (включая QR-код из CI).
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';

const TEMPLATE_PATH = fileURLToPath(new URL('./sw.js', import.meta.url));
const SW_FILE = 'sw.js';
const HASH_PLACEHOLDER = '__BUILD_HASH__';
const PRECACHE_PLACEHOLDER = '/* __PRECACHE__ */ []';

/**
 * Какие файлы сборки кэшировать заранее: всё, кроме самого воркера,
 * карт исходников и служебных файлов. Порядок стабильный — от него зависит хэш.
 */
export function selectPrecache(files: readonly string[]): string[] {
  return files
    .filter((file) => file !== SW_FILE)
    .filter((file) => !file.endsWith('.map'))
    .filter((file) => !file.split('/').some((part) => part.startsWith('.')))
    .sort();
}

/** Хэш сборки по путям и содержимому файлов: меняется, только если изменился хоть один файл. */
export function hashBuild(entries: readonly { path: string; content: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const { path: file, content } of entries) {
    hash.update(file);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Подставляет список файлов и хэш в шаблон воркера. */
export function renderServiceWorker(template: string, precache: readonly string[], buildHash: string): string {
  if (!template.includes(HASH_PLACEHOLDER) || !template.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error('pwa/sw.js: в шаблоне нет меток __BUILD_HASH__ или /* __PRECACHE__ */ []');
  }
  return template
    .replace(HASH_PLACEHOLDER, buildHash)
    .replace(PRECACHE_PLACEHOLDER, JSON.stringify(precache, null, 2));
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listFiles(path.join(dir, entry.name), relative);
      return entry.isFile() ? [relative] : [];
    })
  );
  return nested.flat();
}

export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'gt-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const precache = selectPrecache(await listFiles(outDir));
      const entries = await Promise.all(
        precache.map(async (file) => ({ path: file, content: await readFile(path.join(outDir, file)) }))
      );
      const buildHash = hashBuild(entries);
      const template = await readFile(TEMPLATE_PATH, 'utf8');

      await writeFile(path.join(outDir, SW_FILE), renderServiceWorker(template, precache, buildHash));
      config.logger.info(`service worker: ${precache.length} файлов в кэше, сборка ${buildHash}`);
    }
  };
}
