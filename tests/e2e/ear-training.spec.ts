import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test-base';

/**
 * Кликает варианты, пока не попадёт в правильный. Возвращает индекс верного ответа.
 *
 * Каждый вопрос допускает только одну попытку (кнопки блокируются после клика,
 * а «Следующий вопрос» перегенерирует вопрос с новым случайным правильным индексом),
 * поэтому это не перебор вариантов ОДНОГО вопроса, а серия независимых угадываний
 * на РАЗНЫХ вопросах. Чтобы вероятность "не угадать ни разу" была пренебрежимо мала
 * (а не ~30%, как при MAX_ATTEMPTS = optionCount), даём щедрый запас попыток.
 */
async function answerCorrectly(page: Page): Promise<number> {
  const optionCount = await page.locator('[data-testid^="et-answer-"]').count();
  const MAX_ATTEMPTS = 40;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const guessIndex = i % optionCount;
    await page.getByTestId(`et-answer-${guessIndex}`).click();
    const feedback = await page.getByTestId('et-feedback').innerText();
    if (feedback.includes('Правильно')) return guessIndex;
    await page.getByTestId('et-next').click();
  }
  throw new Error('Ни один вариант не оказался правильным');
}

test.describe('тренажёр слуха', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-ear-training`).click();
  });

  test('переключает три режима игры', async ({ page }) => {
    await page.getByTestId('et-mode-string').click();
    await expect(page.locator('main')).toContainText('Какая струна прозвучала?');

    await page.getByTestId('et-mode-quality').click();
    await expect(page.locator('main')).toContainText('Какой характер у аккорда?');
    await expect(page.getByTestId('et-answer-0')).toContainText('Мажор');

    await page.getByTestId('et-mode-note').click();
    await expect(page.locator('main')).toContainText('Какая нота звучит?');
  });

  test('верный ответ увеличивает счёт и серию', async ({ page }) => {
    await expect(page.getByTestId('et-streak')).toContainText('0');

    await answerCorrectly(page);

    await expect(page.getByTestId('et-feedback')).toContainText('Правильно');
    await expect(page.getByTestId('et-streak')).toContainText('1');
    await expect(page.getByTestId('et-score')).toContainText('1 /');
  });

  test('неверный ответ обнуляет серию', async ({ page }) => {
    // Сначала набираем серию, затем намеренно отвечаем неверно.
    const correctIndex = await answerCorrectly(page);
    await expect(page.getByTestId('et-streak')).toContainText('1');
    await page.getByTestId('et-next').click();

    const optionCount = await page.locator('[data-testid^="et-answer-"]').count();
    let answered = false;
    for (let attempt = 0; attempt < 6 && !answered; attempt++) {
      const wrongCandidate = (correctIndex + 1) % optionCount;
      await page.getByTestId(`et-answer-${wrongCandidate}`).click();
      const feedback = await page.getByTestId('et-feedback').innerText();
      if (feedback.includes('Не совсем точно')) {
        answered = true;
      } else {
        await page.getByTestId('et-next').click();
      }
    }
    expect(answered, 'не удалось получить неверный ответ за 6 попыток').toBe(true);
    await expect(page.getByTestId('et-streak')).toContainText('0');
  });

  test('рекорд серии сохраняется между сессиями', async ({ page }, testInfo) => {
    await answerCorrectly(page);
    // et-best рендерится как «{bestStreak} ({accuracy}%)», а accuracy равна 100 и при
    // totalAttempts === 0 (см. EarTrainingScreen.tsx). Проверяем позицию значения —
    // «1 (» в начале строки, — а не просто наличие «1» где-то в тексте: иначе совпадение
    // могло бы случайно произойти из-за «100%», а не из-за bestStreak.
    await expect(page.getByTestId('et-best')).toHaveText(/^1 \(/);

    const stored = await page.evaluate(() => localStorage.getItem('nr_ear_best_streak'));
    expect(stored).toBe('1');

    // Проверяем, что рекорд переживает перезагрузку страницы (новую "сессию"),
    // а не просто читает значение, только что записанное на этой же странице.
    await page.reload();
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-ear-training`).click();
    await expect(page.getByTestId('et-best')).toHaveText(/^1 \(/);
  });
});
