import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/test-base';
import { noteFrequency } from './fixtures/notes';

/**
 * Переходит к следующему вопросу.
 *
 * Приложение переключает вопрос само через 3 секунды после ответа, поэтому
 * кнопка «Следующий вопрос» может исчезнуть прямо под курсором. Жмём её, только
 * если успели, и в любом случае дожидаемся, когда карточка ответа пропадёт.
 */
async function goToNextQuestion(page: Page) {
  const next = page.getByTestId('et-next');
  if (await next.isVisible().catch(() => false)) {
    await next.click({ timeout: 1500 }).catch(() => {});
  }
  await expect(page.getByTestId('et-feedback')).toHaveCount(0, { timeout: 6_000 });
}

/**
 * Кликает варианты, пока не попадёт в правильный. Возвращает индекс верного ответа.
 *
 * Каждый вопрос допускает только одну попытку (кнопки блокируются после клика,
 * а следующий вопрос приходит с новым случайным правильным индексом), поэтому это
 * не перебор вариантов ОДНОГО вопроса, а серия независимых угадываний на РАЗНЫХ
 * вопросах. При четырёх вариантах вероятность не угадать за 40 попыток — около 1e-5.
 */
async function answerCorrectly(page: Page): Promise<number> {
  const optionCount = await page.locator('[data-testid^="et-answer-"]').count();
  const MAX_ATTEMPTS = 40;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const guessIndex = i % optionCount;
    await page.getByTestId(`et-answer-${guessIndex}`).click();
    const feedback = await page.getByTestId('et-feedback').innerText();
    if (feedback.includes('Правильно')) return guessIndex;
    await goToNextQuestion(page);
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

    // Внутри хелпера уже проверено, что обратная связь сказала «Правильно».
    // Дальше опираемся на счётчики: они переживают автопереход, а баннер — нет.
    await answerCorrectly(page);

    await expect(page.getByTestId('et-streak')).toContainText('1');
    await expect(page.getByTestId('et-score')).toContainText('1 /');
  });

  test('неверный ответ обнуляет серию', async ({ page }) => {
    // Сначала набираем серию, затем намеренно отвечаем неверно.
    const correctIndex = await answerCorrectly(page);
    await expect(page.getByTestId('et-streak')).toContainText('1');
    await goToNextQuestion(page);

    const optionCount = await page.locator('[data-testid^="et-answer-"]').count();
    let answered = false;
    for (let attempt = 0; attempt < 6 && !answered; attempt++) {
      const wrongCandidate = (correctIndex + 1) % optionCount;
      await page.getByTestId(`et-answer-${wrongCandidate}`).click();
      const feedback = await page.getByTestId('et-feedback').innerText();
      if (feedback.includes('Не совсем точно')) {
        answered = true;
      } else {
        await goToNextQuestion(page);
      }
    }
    expect(answered, 'не удалось получить неверный ответ за 6 попыток').toBe(true);
    await expect(page.getByTestId('et-streak')).toContainText('0');
  });

  test('рекорд серии сохраняется между сессиями', async ({ page }, testInfo) => {
    await answerCorrectly(page);
    // et-best рендерится как «{bestStreak} ({accuracy}%)», а accuracy равна 100 и при
    // totalAttempts === 0. Проверяем позицию значения — «1 (» в начале строки, — а не
    // просто наличие «1»: иначе совпадение дало бы «100%», а не сам рекорд.
    await expect(page.getByTestId('et-best')).toHaveText(/^1 \(/);

    const stored = await page.evaluate(() => localStorage.getItem('nr_ear_best_streak'));
    expect(stored).toBe('1');

    await page.reload();
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-ear-training`).click();
    await expect(page.getByTestId('et-best')).toHaveText(/^1 \(/);
  });

  test('сам переходит к следующему вопросу через 3 секунды', async ({ page }) => {
    await page.getByTestId('et-answer-0').click();
    await expect(page.getByTestId('et-feedback')).toBeVisible();

    // Ничего не нажимаем: карточка ответа обязана исчезнуть сама.
    // Верхняя граница с запасом на планировщик, нижняя — чтобы тест ловил
    // случай «переключилось мгновенно», который сбивал бы чтение разбора.
    const started = Date.now();
    await expect(page.getByTestId('et-feedback')).toHaveCount(0, { timeout: 6_000 });
    const elapsed = Date.now() - started;

    expect(elapsed, `автопереход занял ${elapsed} мс`).toBeGreaterThan(1_500);
    await expect(page.getByTestId('et-answer-0')).toBeEnabled();
  });

  test('кнопка следующего вопроса помещается на экран', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'проверка про мобильный экран');

    // 390x480 — заведомо меньше любого реального телефона. Подгонка высот
    // дважды оказывалась оптимистичнее реальности: доступная высота Safari
    // меняется на ходу, а env(safe-area-inset-bottom) в эмуляции равен нулю.
    // Блок с кнопкой прижат к низу экрана, поэтому высота вообще не важна —
    // именно это свойство здесь и проверяется.
    await page.setViewportSize({ width: 390, height: 480 });

    await page.getByTestId('et-answer-0').click();
    await expect(page.getByTestId('et-next')).toBeVisible();

    const fits = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="et-next"]')!.getBoundingClientRect();
      return { overflow: Math.round(n.bottom - window.innerHeight), top: Math.round(n.top) };
    });
    // До исправления кнопка уходила под сгиб на 19–89px, а документ не скроллился.
    expect(fits.overflow, `кнопка ниже экрана на ${fits.overflow}px`).toBeLessThanOrEqual(0);
    expect(fits.top, `кнопка выше экрана на ${-fits.top}px`).toBeGreaterThanOrEqual(0);
  });

  test('переключатель способа ответа скрыт в режиме «Мажор/минор»', async ({ page }) => {
    await expect(page.getByTestId('et-input-guitar')).toBeVisible();

    await page.getByTestId('et-mode-string').click();
    await expect(page.getByTestId('et-input-guitar')).toBeVisible();

    // Характер аккорда одной струной не сыграть — переключателя тут быть не должно.
    await page.getByTestId('et-mode-quality').click();
    await expect(page.getByTestId('et-input-guitar')).toHaveCount(0);
  });

  test('ответ засчитывается игрой на струне', async ({ page }) => {
    await page.getByTestId('et-mode-string').click();
    await page.getByTestId('et-input-guitar').click();
    await expect(page.getByTestId('et-guitar-hint')).toBeVisible();

    // Играем открытую шестую струну. Какой вариант окажется верным — дело случая,
    // проверяем сам факт: сыгранная нота регистрируется как ответ без нажатий.
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    // Опираемся на счётчик попыток, а не на баннер обратной связи: баннер живёт
    // всего три секунды до автоперехода, и под параллельной нагрузкой проверка
    // успевала прийти уже после его исчезновения.
    await expect(page.getByTestId('et-score')).toContainText('/ 1', { timeout: 12_000 });
  });

  test('непрерывно звучащая струна не отвечает дважды', async ({ page }) => {
    await page.getByTestId('et-mode-string').click();
    await page.getByTestId('et-input-guitar').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('et-score')).toContainText('/ 1', { timeout: 12_000 });

    // Звук не прерываем и ждём дольше автоперехода (3 с). Без требования нового
    // щипка тот же тон засчитался бы за ответ на следующий вопрос, и счётчик
    // попыток пополз бы сам собой.
    await page.waitForTimeout(5_000);
    await expect(page.getByTestId('et-score')).toContainText('/ 1');

    // А после паузы новый щипок снова принимается.
    await page.evaluate(() => window.__fakeMic.silence());
    // Анализатору нужно накопить окно тишины, чтобы снять блокировку: при 8192
    // отсчётах и 48 кГц это около 170 мс плюс кадры отрисовки. Берём с запасом,
    // иначе звук возвращается раньше, чем приложение увидело паузу.
    await page.waitForTimeout(1_500);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('et-score')).toContainText('/ 2', { timeout: 12_000 });
  });
});
