import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/test-base';

/**
 * Доступность (#11): автоматическая проверка axe по каждой вкладке и сценарии,
 * которые axe не ловит, — клавиатура, фокус, озвучивание.
 */

const TABS = ['tuner', 'fretboard', 'chord-check', 'metronome', 'ear-training'] as const;

const navPrefix = (testInfo: TestInfo) => (testInfo.project.use.isMobile ? 'nav-mobile' : 'nav-desktop');

/** Правила WCAG 2.2 уровней A и AA. */
async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map(n => n.target.join(' '))
  }));
}

test.describe('доступность', () => {
  for (const tab of TABS) {
    test(`axe: вкладка ${tab} без нарушений WCAG A/AA`, async ({ page }, testInfo) => {
      await page.goto('/');
      await page.getByTestId(`${navPrefix(testInfo)}-${tab}`).click();
      await expect(page.getByTestId('header-subtitle')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('axe: окно настроек без нарушений WCAG A/AA', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await page.getByTestId('custom-tuning-create').click();
    await expect(page.getByTestId('custom-tuning-name')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('вкладка навигации помечена как текущая', async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = navPrefix(testInfo);
    await expect(page.getByTestId(`${prefix}-tuner`)).toHaveAttribute('aria-current', 'page');
    await page.getByTestId(`${prefix}-metronome`).click();
    await expect(page.getByTestId(`${prefix}-metronome`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId(`${prefix}-tuner`)).not.toHaveAttribute('aria-current', /.*/);
  });

  test('окно настроек: модальное, Escape закрывает и возвращает фокус на шестерёнку', async ({ page }) => {
    await page.goto('/');
    const opener = page.getByTestId('settings-open');
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Настройки приложения' });
    await expect(dialog).toBeVisible();
    // Фокус внутри окна, а не на странице под подложкой.
    await expect.poll(() => dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);

    // Tab по кругу не выходит за пределы окна.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body);
      expect(inside, `Tab №${i + 1} увёл фокус из окна`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('окно настроек: крестик подписан и закрывает окно, щелчок по подложке тоже', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await page.getByRole('button', { name: 'Закрыть настройки' }).click();
    await expect(page.getByTestId('settings-modal')).toBeHidden();

    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
    // Левый верхний угол вьюпорта — заведомо подложка, окно по центру.
    await page.mouse.click(4, 4);
    await expect(page.getByTestId('settings-modal')).toBeHidden();
  });

  test('переключатели сообщают выбранный пункт через aria-pressed', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-threshold-3').click();
    await expect(page.getByTestId('settings-threshold-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('settings-threshold-5')).toHaveAttribute('aria-pressed', 'false');
  });

  test('тюнер: эталон струны — отдельная кнопка, не вложенная в чип', async ({ page }) => {
    await page.goto('/');
    const ref = page.getByTestId('string-ref-6');
    await expect(ref).toBeVisible();
    expect(await ref.evaluate(el => el.closest('[data-testid^="string-chip-"]'))).toBeNull();

    // Зона нажатия не меньше 24×24 (WCAG 2.5.8). Округление: Firefox считает
    // раскладку в 1/60 px и отдаёт 23.99997 для ровных 24 px.
    const box = await ref.boundingBox();
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(24);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(24);

    // Чип выбирается с клавиатуры и сообщает выбор.
    const chip = page.getByTestId('string-chip-6');
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  test('тюнер: крупная нота — кнопка', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /прослушать эталон/ })).toBeVisible();
  });

  test('гриф: одна точка входа по Tab, стрелки и Enter', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByTestId(`${navPrefix(testInfo)}-fretboard`).click();
    await page.getByTestId('fb-mode-explore').click();

    const svg = page.getByTestId('fretboard-svg');
    await expect(svg.locator('[tabindex="0"]')).toHaveCount(1);

    const start = page.getByTestId('fb-cell-0-0');
    await start.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    const target = page.getByTestId('fb-cell-1-2');
    await expect(target).toBeFocused();
    await expect(target).toHaveAttribute('tabindex', '0');
    await expect(svg.locator('[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('fb-last-note')).toContainText('Лад 2');
    await expect(target).toHaveAccessibleName(/2-й лад/);
  });

  test('гриф у левши: зона нажатия ячейки — над её ладом', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByTestId(`${navPrefix(testInfo)}-fretboard`).click();
    await page.getByTestId('fb-mode-explore').click();
    await page.getByTestId('fb-lefty').check();

    // Отмеченная нота рисует кружок по центру своего лада.
    const cell = page.getByTestId('fb-cell-0-3');
    await cell.focus();
    await page.keyboard.press('Enter');
    const circle = cell.locator('circle').last();
    await expect(circle).toBeVisible();

    const hit = await cell.locator('.fb-cell-hit').boundingBox();
    const dot = await circle.boundingBox();
    const dotCenter = dot!.x + dot!.width / 2;
    expect(dotCenter).toBeGreaterThan(hit!.x);
    expect(dotCenter).toBeLessThan(hit!.x + hit!.width);
  });

  test('схема аккорда описана текстом', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('firefox') || testInfo.project.name.startsWith('webkit'), 'вкладка аккордов — в Chromium');
    await page.goto('/');
    await page.getByTestId(`${navPrefix(testInfo)}-chord-check`).click();
    await page.getByTestId('cc-voicing-c-open').click();
    await expect(page.getByRole('img', { name: /Аппликатура C.*6-я глушится.*5-я 3-й лад/ })).toBeVisible();
  });

  test('при prefers-reduced-motion инлайновые переходы не анимируются', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const duration = await page
      .getByTestId('tuner-action')
      .evaluate(el => getComputedStyle(el).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });
});
