import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashBuild, renderServiceWorker, selectPrecache } from '../pwa/swPlugin';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('Список файлов для кэша service worker', () => {
  it('берёт файлы сборки и public, но не сам воркер, карты и служебные файлы', () => {
    const files = [
      'sw.js',
      'index.html',
      'assets/index-abc.js',
      'assets/index-abc.js.map',
      '.vite/manifest.json',
      'fonts/manrope-latin.woff2',
      'manifest.json'
    ];
    expect(selectPrecache(files)).toEqual([
      'assets/index-abc.js',
      'fonts/manrope-latin.woff2',
      'index.html',
      'manifest.json'
    ]);
  });
});

describe('Хэш сборки', () => {
  const build = [
    { path: 'index.html', content: bytes('<html>') },
    { path: 'assets/a.js', content: bytes('console.log(1)') }
  ];

  it('одинаков для одинаковой сборки', () => {
    expect(hashBuild(build)).toBe(hashBuild(build.map(e => ({ ...e }))));
    expect(hashBuild(build)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('меняется, если изменилось содержимое любого файла', () => {
    const changed = [build[0], { path: 'assets/a.js', content: bytes('console.log(2)') }];
    expect(hashBuild(changed)).not.toBe(hashBuild(build));
  });

  it('меняется, если файл переименован', () => {
    const renamed = [build[0], { path: 'assets/b.js', content: build[1].content }];
    expect(hashBuild(renamed)).not.toBe(hashBuild(build));
  });
});

describe('Шаблон service worker', () => {
  const template = readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8');

  it('получает список файлов и хэш в имени кэша', () => {
    const sw = renderServiceWorker(template, ['index.html', 'assets/a.js'], 'abc123def456');
    expect(sw).toContain("const BUILD_HASH = 'abc123def456';");
    expect(sw).toContain('"assets/a.js"');
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).not.toContain('__BUILD_HASH__');
  });

  it('падает на шаблоне без меток, а не собирает пустой воркер', () => {
    expect(() => renderServiceWorker('self.addEventListener("fetch", () => {})', [], 'x')).toThrow(/меток/);
  });
});
