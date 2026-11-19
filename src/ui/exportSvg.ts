/**
 * Экспорт SVG со страницы в самостоятельный файл (#13).
 *
 * Заливки и шрифты схем заданы CSS-переменными темы (`fill="var(--brand)"`,
 * `font-family="var(--font-ui)"`). В отдельном файле этих переменных нет:
 * такие значения недействительны, и элементы рисуются чёрным по умолчанию —
 * подписи на точках не читаются. Поэтому перед сохранением каждое значение с
 * `var(…)` заменяется вычисленным браузером, а фон, который на странице
 * задаётся стилем элемента `<svg>`, рисуется прямоугольником внутри файла.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Атрибуты оформления, в которых встречаются переменные темы. */
const PRESENTATION_ATTRIBUTES = ['fill', 'stroke', 'stop-color', 'flood-color', 'color', 'font-family'];

/** Высота полосы заголовка над схемой, в единицах viewBox. */
const TITLE_BAND = 34;

export interface StandaloneSvgOptions {
  /** Заголовок: и `<title>` файла, и видимая подпись над схемой. */
  title: string;
  /** Цвета фона сверху и снизу (CSS-переменные или готовые значения). */
  background?: { top: string; bottom: string };
  /** Цвет подписи заголовка. */
  titleColor?: string;
}

function resolveVariables(source: Element, target: Element): void {
  const computed = getComputedStyle(source);

  for (const attr of PRESENTATION_ATTRIBUTES) {
    const value = target.getAttribute(attr);
    if (value && value.includes('var(')) {
      const resolved = computed.getPropertyValue(attr).trim();
      if (resolved) target.setAttribute(attr, resolved);
    }
  }

  // Встроенные стили (React style={{…}}) тоже могут ссылаться на переменные.
  const inline = (target as SVGElement).style;
  if (inline && inline.length > 0 && (target.getAttribute('style') ?? '').includes('var(')) {
    for (let i = inline.length - 1; i >= 0; i--) {
      const prop = inline[i];
      if (!inline.getPropertyValue(prop).includes('var(')) continue;
      const resolved = computed.getPropertyValue(prop).trim();
      if (resolved) inline.setProperty(prop, resolved);
      else inline.removeProperty(prop);
    }
  }
}

/** Значение CSS-переменной в контексте элемента; готовый цвет возвращается как есть. */
function resolveColor(element: Element, value: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match) return value;
  return getComputedStyle(element).getPropertyValue(match[1]).trim() || '#000000';
}

/** Самостоятельная разметка SVG: без ссылок на переменные страницы, с фоном и заголовком. */
export function buildStandaloneSvg(svg: SVGSVGElement, options: StandaloneSvgOptions): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  const sources = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const targets = [clone, ...Array.from(clone.querySelectorAll('*'))];
  sources.forEach((el, i) => resolveVariables(el, targets[i]));

  // Стиль корня описывает вёрстку страницы (ширина, тень, рамка) — в файле
  // он не нужен, а фон из него переносится внутрь рисунка.
  clone.removeAttribute('style');
  clone.removeAttribute('data-testid');
  clone.setAttribute('xmlns', SVG_NS);

  const [x, y, width, height] = (svg.getAttribute('viewBox') ?? `0 0 ${svg.clientWidth} ${svg.clientHeight}`)
    .split(/[\s,]+/)
    .map(Number);
  const top = y - TITLE_BAND;
  const fullHeight = height + TITLE_BAND;
  clone.setAttribute('viewBox', `${x} ${top} ${width} ${fullHeight}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(fullHeight));

  const doc = clone.ownerDocument;
  const make = (tag: string, attrs: Record<string, string>) => {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  const title = make('title', {});
  title.textContent = options.title;

  const bgTop = resolveColor(svg, options.background?.top ?? 'var(--ink-950)');
  const bgBottom = resolveColor(svg, options.background?.bottom ?? bgTop);
  const gradient = make('linearGradient', { id: 'export-background', x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.append(
    make('stop', { offset: '0%', 'stop-color': bgTop }),
    make('stop', { offset: '100%', 'stop-color': bgBottom })
  );
  const defs = make('defs', {});
  defs.append(gradient);

  const background = make('rect', {
    x: String(x),
    y: String(top),
    width: String(width),
    height: String(fullHeight),
    fill: 'url(#export-background)'
  });

  const caption = make('text', {
    x: String(x + 16),
    y: String(top + TITLE_BAND - 11),
    fill: resolveColor(svg, options.titleColor ?? 'var(--ink-050)'),
    'font-family': getComputedStyle(svg).getPropertyValue('font-family').trim() || 'sans-serif',
    'font-size': '16',
    'font-weight': '700'
  });
  caption.textContent = options.title;

  clone.prepend(title, defs, background, caption);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Имя файла без символов, недопустимых в Windows и macOS. */
export function safeFileName(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/#/g, 'sharp')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Скачивание текста файлом; blob-URL освобождается после того, как скачивание началось. */
export function downloadText(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Сразу после click() некоторые браузеры ещё не начали читать blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
