import { expect, test } from './fixtures/test-base';
import { centsOff, noteFrequency } from './fixtures/notes';

async function startMic(page: import('@playwright/test').Page) {
  await page.getByTestId('mic-toggle').click();
  await expect(page.getByTestId('mic-status')).toBeVisible();
}

test.describe('тюнер', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('до включения микрофона просит сыграть струну', async ({ page }) => {
    await expect(page.getByTestId('mic-toggle')).toContainText('Включить микрофон');
    await expect(page.getByTestId('tuner-action')).toContainText('Сыграйте струну');
  });

  test('распознаёт точную ноту и сообщает «В СТРОЕ»', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    await expect(async () => {
      await expect(page.getByTestId('tuner-note')).toHaveText('E');
      await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ');
      await expect(page.getByTestId('tuner-target')).toContainText('82.4 Гц');

      const measured = await page.getByTestId('tuner-measured').innerText();
      const value = Number(measured.replace(/[^\d.]/g, ''));
      expect(Math.abs(value - 82.41)).toBeLessThanOrEqual(0.3);
    }).toPass({ timeout: 8_000 });

    await expect(page.getByTestId('string-chip-6')).toHaveAttribute('data-state', 'done');
  });

  test('на заниженной струне требует подтянуть', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), centsOff('E2', -20));

    // Пока анализатор высоты тона «домотает» окно анализа до новой частоты, показания
    // цента колеблются (наблюдалось от -26 до +5, включая кратковременное «ОСЛАБИТЬ»).
    // Оба чтения текста и числовое сравнение должны выполняться за один снимок DOM
    // внутри toPass — иначе toPass может зафиксировать успех на переходном значении,
    // а последующее отдельное чтение подхватит уже другое число и упадёт без вины теста.
    await expect(async () => {
      const action = await page.getByTestId('tuner-action').innerText();
      expect(action).toContain('ПОДТЯНУТЬ');
      expect(action).toContain('¢');

      const cents = Number(/\(([-+]?\d+)¢\)/.exec(action)?.[1]);
      expect(Math.abs(cents + 20)).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 8_000 });
  });

  test('на завышенной струне требует ослабить и даёт совет мастера', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), centsOff('E2', 20));

    await expect(page.getByTestId('tuner-action')).toContainText('ОСЛАБИТЬ', { timeout: 8_000 });
    // Подсказка показывается при отклонении больше 15 центов.
    await expect(page.getByTestId('master-tip')).toBeVisible();
  });

  test('возвращается в исходное состояние после тишины', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ', { timeout: 8_000 });

    await page.evaluate(() => window.__fakeMic.silence());
    // Затухание в коде — 1200 мс; берём запас.
    await expect(page.getByTestId('tuner-action')).toContainText('Сыграйте струну', { timeout: 5_000 });
  });

  test('сам определяет струну без ручного выбора', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('G3'));

    await expect(page.getByTestId('tuner-note')).toHaveText('G', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('196.0 Гц');
  });

  test('удерживает выбранную струну при отклонении в пределах порога', async ({ page }) => {
    await startMic(page);

    // G3 (196.0 Гц) и B3 (246.9 Гц) разделены 400 центами; частота на +220¢ от G3 (≈222.6 Гц)
    // лежит ближе по герцам к B3 (24.4 Гц разницы), чем к G3 (26.6 Гц разницы).
    const freq = centsOff('G3', 220);

    // Без ручного выбора струны автоопределение берёт ближайшую по герцам — B3.
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), freq);
    await expect(page.getByTestId('tuner-note')).toHaveText('B', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('246.9 Гц');

    // После ручного выбора G3 то же самое отклонение (220¢) укладывается в порог удержания 250¢,
    // поэтому тюнер остаётся на G3, а не переключается на более близкую по герцам B3.
    await page.getByTestId('string-chip-3').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), freq);
    await expect(page.getByTestId('tuner-note')).toHaveText('G', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-target')).toContainText('196.0 Гц');
  });

  test('в режиме Мастера сам переходит на следующую струну', async ({ page }) => {
    await startMic(page);
    await page.getByTestId('master-mode').check();
    await page.getByTestId('string-chip-6').click();
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));

    // Автопереход срабатывает после 1200 мс удержания строя.
    await expect(page.getByTestId('string-chip-5')).toHaveAttribute('data-state', 'active', {
      timeout: 10_000,
    });
  });

  test('учитывает эталон A4 = 432 Гц', async ({ page }) => {
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-a4-432').click();
    await page.getByTestId('settings-close').click();

    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2', 432));

    await expect(page.getByTestId('tuner-target')).toContainText('80.9 Гц', { timeout: 8_000 });
    await expect(page.getByTestId('tuner-action')).toContainText('В СТРОЕ');
  });

  test('спектр показывает основной тон и гармоники на тихом входе', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    // Гитара через микрофон телефона — это примерно -60 dBFS, а не -26, на которых
    // тест проходил раньше при фактически неработающей спектрограмме.
    await page.evaluate(() => window.__fakeMic.setLevel(-60));
    await page.getByTestId('spectrum-toggle').click();

    // Шкала логарифмическая: 32 полосы на диапазон 40–4000 Гц, то есть
    // множитель 1.1548 на полосу. Основной тон E2 (82.41 Гц) попадает в 5-ю.
    const bars = page.getByTestId('spectrum-toggle').locator('xpath=../div').locator('div[data-level]');

    await expect(async () => {
      const levels = await bars.evaluateAll((els) =>
        els.map((e) => Number((e as HTMLElement).dataset.level))
      );
      expect(levels).toHaveLength(32);

      // До исправления каждая полоса читала шумовой пол между пиками и все
      // уровни были нулевыми — этой проверки хватает, чтобы поймать регресс.
      const loud = levels.filter((v) => v >= 40).length;
      expect(loud, `полос с заметным уровнем: ${loud}`).toBeGreaterThanOrEqual(3);

      // Основной тон громче своих гармоник, поэтому пик должен лежать в 5-й полосе.
      const peakIndex = levels.indexOf(Math.max(...levels));
      expect(Math.abs(peakIndex - 5), `пик в полосе ${peakIndex}`).toBeLessThanOrEqual(1);
    }).toPass({ timeout: 8_000 });
  });

  test('при отказе в доступе объясняет, как его вернуть', async ({ page }) => {
    await page.evaluate(() => window.__fakeMic.denyAccess());
    await page.getByTestId('mic-toggle').click();

    const banner = page.getByTestId('mic-error');
    await expect(banner).toBeVisible();

    // Одного «разрешите в настройках браузера» мало: пользователь не смог найти,
    // где именно. Баннер обязан давать конкретный путь.
    await expect(page.getByTestId('mic-help-quick')).toContainText('адресной строк');

    // Chromium в тестах — значит должен показываться адрес настроек Chrome.
    await expect(page.getByTestId('mic-settings-url')).toHaveText('chrome://settings/content/microphone');
    await expect(banner).toContainText('по ссылке браузер такие адреса не открывает');
  });

  test('адрес настроек микрофона копируется в буфер', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => window.__fakeMic.denyAccess());
    await page.getByTestId('mic-toggle').click();

    await page.getByTestId('mic-copy-settings').click();
    await expect(page.getByTestId('mic-copy-settings')).toContainText('Скопировано');

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('chrome://settings/content/microphone');
  });

  test('не анализирует собственный эталонный звук', async ({ page }) => {
    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('E2'));
    await expect(page.getByTestId('tuner-note')).toHaveText('E', { timeout: 8_000 });

    // Нажатие на ноту играет эталон через динамик. На телефоне микрофон слышит
    // его же, и до исправления тюнер «проверял строй» собственного звука.
    await page.getByTestId('tuner-note').click();

    // Подменяем вход на другую СТРУНУ: 440 Гц не годится — тюнер отнёс бы её
    // к ближайшей E4, и нота осталась бы «E» независимо от подавления.
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('D3'));
    await page.waitForTimeout(1_200);
    await expect(page.getByTestId('tuner-note')).toHaveText('E');

    // Эталон длится 2.8 с плюс запас на отзвук — после этого анализ возвращается.
    await expect(page.getByTestId('tuner-note')).toHaveText('D', { timeout: 8_000 });
  });

  test('переключение на Drop D меняет шестую струну на D2', async ({ page }) => {
    await page.getByTestId('tuning-select').selectOption('drop-d');
    await expect(page.getByTestId('string-chip-6')).toContainText('D2');

    await startMic(page);
    await page.evaluate((f) => window.__fakeMic.setFrequency(f), noteFrequency('D2'));

    await expect(page.getByTestId('tuner-target')).toContainText('73.4 Гц', { timeout: 8_000 });
  });
});
