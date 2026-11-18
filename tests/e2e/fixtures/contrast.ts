import type { Page } from '@playwright/test';

export interface ContrastIssue {
  text: string;
  ratio: number;
  required: number;
  color: string;
  background: string;
  where: string;
}

/**
 * Проверка контраста видимого текста по WCAG 2.1 (AA): 4.5 для обычного текста,
 * 3 для крупного (от 24 px или от 18.66 px жирного).
 *
 * Фон ищется вверх по предкам с наложением полупрозрачных слоёв. Если на пути
 * попадается градиент или картинка, цвет фона под текстом не определить —
 * такой текст пропускается (и попадает в счётчик skipped), а не считается
 * ошибкой. Текст внутри SVG проверяется отдельно, по `fill`, на фоне, который
 * передаёт вызывающий (накладка грифа рисуется не CSS-фоном).
 */
export async function findLowContrastText(page: Page): Promise<{ issues: ContrastIssue[]; checked: number; skipped: number }> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];

    const ctx = document.createElement('canvas').getContext('2d')!;
    /** Любой CSS-цвет (rgb(), color(srgb …), color-mix уже вычислен браузером) → RGBA 0..255. */
    const parse = (css: string): RGBA | null => {
      if (!css || css === 'transparent') return [0, 0, 0, 0];
      const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(css);
      if (srgb) {
        return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
      }
      const rgb = /^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:[,/] ?([\d.]+))?\)$/.exec(css);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
      // Прочие форматы — через canvas.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };

    /** Слой top поверх непрозрачного bottom. */
    const over = (top: RGBA, bottom: RGBA): RGBA => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
      1
    ];

    const luminance = ([r, g, b]: RGBA) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (c: RGBA) => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

    /** Непрозрачный цвет фона под элементом или null, если под ним градиент/картинка. */
    const backgroundOf = (el: Element): RGBA | null => {
      const layers: RGBA[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') return null;
        const bg = parse(style.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let result: RGBA = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result);
      return result;
    };

    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        // Полупрозрачное — обычно неактивное: WCAG такие элементы не требует.
        if (Number(style.opacity) < 1) return false;
      }
      return true;
    };

    const issues: ContrastIssue[] = [];
    let checked = 0;
    let skipped = 0;

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.closest('svg')) continue;
      const ownText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent ?? '')
        .join('')
        .trim();
      if (!ownText || !isVisible(el)) continue;
      if ((el as HTMLElement).closest('[disabled], [aria-disabled="true"]')) continue;

      const bg = backgroundOf(el);
      if (!bg) {
        skipped++;
        continue;
      }
      const style = getComputedStyle(el);
      const fg = over(parse(style.color) ?? [0, 0, 0, 1], bg);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(fg, bg);
      checked++;
      if (r + 0.01 < required) {
        const id = (el as HTMLElement).dataset.testid ?? el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        issues.push({
          text: ownText.slice(0, 40),
          ratio: Math.round(r * 100) / 100,
          required,
          color: hex(fg),
          background: hex(bg),
          where: `${el.tagName.toLowerCase()}${id ? `[${id}]` : ''}`
        });
      }
    }
    return { issues, checked, skipped };
  });
}
