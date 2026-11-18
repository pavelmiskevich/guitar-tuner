import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Каждая ссылка var(--имя) в коде должна вести на определённое свойство.
 *
 * Свойство с неопределённой переменной недействительно целиком, и браузер
 * молча берёт значение по умолчанию: так подписи ладов на грифе были чёрными
 * на тёмной накладке, а сильные доли секвенсора не отличались от слабых —
 * в коде стояли --ink-400 и --ink-600, которых не было в tokens.css (#10).
 */

const ROOT = path.resolve(import.meta.dirname, '..');

function filesUnder(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full, exts);
    return exts.includes(path.extname(name)) ? [full] : [];
  });
}

const sources = [...filesUnder(path.join(ROOT, 'src'), ['.ts', '.tsx', '.css']), path.join(ROOT, 'index.html')];
const texts = sources.map((file) => ({ file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') }));

const defined = new Set<string>();
for (const { text } of texts) {
  for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
}

describe('Дизайн-токены', () => {
  it('все var(--…) ссылаются на определённые свойства', () => {
    const missing: string[] = [];
    for (const { file, text } of texts) {
      // С запасным значением var(--x, …) ссылка безопасна — пропускаем.
      for (const match of text.matchAll(/var\((--[\w-]+)\s*\)/g)) {
        if (!defined.has(match[1])) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('обе темы задают одну и ту же шкалу --ink-*', () => {
    const tokens = readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
    const day = tokens.slice(tokens.indexOf('[data-theme="day"]'));
    const night = tokens.slice(0, tokens.indexOf('[data-theme="day"]'));
    const inks = (css: string) => [...css.matchAll(/(--ink-\d+)\s*:/g)].map((m) => m[1]).sort();
    expect(inks(day)).toEqual(inks(night));
  });
});
