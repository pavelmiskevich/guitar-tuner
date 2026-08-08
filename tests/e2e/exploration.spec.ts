import { test } from './fixtures/test-base';

const SCREENS = ['Тюнер', 'Гриф', 'Аккорд', 'Ритм', 'Тренажер'] as const;

test('@exploration обход всех экранов со сбором наблюдений', async ({ page }, testInfo) => {
  const notes: string[] = [];

  page.on('response', (res) => {
    if (res.status() >= 400) notes.push(`HTTP ${res.status()} — ${res.url()}`);
  });

  await page.goto('/');

  for (const screen of SCREENS) {
    // Десктопная навигация видима только на широком вьюпорте; на мобильном
    // берём нижний таб-бар. Пока нет testid — отбираем по видимости.
    const candidates = page.getByRole('button', { name: new RegExp(screen) });
    const count = await candidates.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const item = candidates.nth(i);
      if (await item.isVisible()) {
        await item.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      notes.push(`Не удалось найти видимую кнопку навигации: ${screen}`);
      continue;
    }

    await page.waitForTimeout(400); // разведка, а не утверждение: даём экрану отрисоваться

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      notes.push(
        `Горизонтальный скролл на экране «${screen}»: ${overflow.scrollWidth} > ${overflow.clientWidth}`
      );
    }

    await page.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-${screen}.png`),
      fullPage: true,
    });
  }

  // Отдельно: тюнер с включённым микрофоном и поданной нотой.
  const tunerNav = page.getByRole('button', { name: /Тюнер/ }).filter({ visible: true }).first();
  await tunerNav.click();
  await page.getByRole('button', { name: /Включить микрофон/ }).click();
  await page.evaluate(() => window.__fakeMic.setFrequency(82.41));
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-tuner-active.png`),
    fullPage: true,
  });

  const tunerText = await page.locator('main').innerText();
  notes.push(`Показания тюнера при 82.41 Гц:\n${tunerText}`);

  await testInfo.attach('exploration-notes', {
    body: notes.join('\n'),
    contentType: 'text/plain',
  });
  console.log('=== НАБЛЮДЕНИЯ РАЗВЕДКИ ===\n' + notes.join('\n'));
});

test('@exploration гипотеза 1 — пользовательский строй в селекторе тюнера', async ({ page }, testInfo) => {
  const notes: string[] = [];

  await page.goto('/');

  // Открываем настройки и создаём пользовательский строй.
  await page.getByTitle('Настройки').click();
  await page.getByRole('button', { name: /Создать строй/ }).click();
  await page.getByPlaceholder(/Название строя/).fill('Мой тестовый строй QA');
  await page.getByRole('button', { name: /Сохранить строй/ }).click();
  await page.getByRole('button', { name: /Сохранить и закрыть/ }).click();

  // Инспектируем селектор строёв на экране тюнера (первый select на странице).
  const select = page.locator('select').first();
  const optionTexts = await select.locator('option').allTextContents();
  const optionValues = await select.locator('option').evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value)
  );
  const selectedValue = await select.inputValue();
  const headingText = await page.locator('h2').first().innerText();

  notes.push(`Заголовок тюнера (h2) после создания строя: "${headingText}"`);
  notes.push(`Текущее значение <select> (value): "${selectedValue}"`);
  notes.push(`Опции <select> (${optionTexts.length}):\n` + optionTexts.map((t, i) => `  [${i}] value="${optionValues[i]}" text="${t}"`).join('\n'));
  notes.push(`Строй "Мой тестовый строй QA" присутствует в списке опций: ${optionTexts.includes('Мой тестовый строй QA')}`);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-hypothesis1-after-custom-tuning.png`),
    fullPage: true,
  });

  await testInfo.attach('hypothesis-1-notes', {
    body: notes.join('\n'),
    contentType: 'text/plain',
  });
  console.log('=== ГИПОТЕЗА 1 ===\n' + notes.join('\n'));
});

test('@exploration гипотеза 2 — содержимое экспортированного SVG с экрана «Гриф»', async ({ page }, testInfo) => {
  const notes: string[] = [];

  await page.goto('/');

  // Переходим на экран «Гриф» тем же способом отбора по видимости, что и в основном проходе.
  const candidates = page.getByRole('button', { name: /Гриф/ });
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const item = candidates.nth(i);
    if (await item.isVisible()) {
      await item.click();
      break;
    }
  }

  const svgCountBeforeExport = await page.locator('svg').count();
  notes.push(`Количество <svg> элементов на странице «Гриф»: ${svgCountBeforeExport}`);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Экспортировать SVG').click();
  const download = await downloadPromise;

  const filePath = await download.path();
  notes.push(`Скачанный файл: suggestedFilename="${download.suggestedFilename()}"`);

  if (filePath) {
    const fs = await import('fs');
    const buf = fs.readFileSync(filePath);
    notes.push(`Размер файла: ${buf.length} байт`);
    notes.push(`Первые 200 символов содержимого:\n${buf.toString('utf-8').slice(0, 200)}`);
  } else {
    notes.push('download.path() вернул null — файл недоступен для чтения в этом окружении');
  }

  await testInfo.attach('hypothesis-2-notes', {
    body: notes.join('\n'),
    contentType: 'text/plain',
  });
  console.log('=== ГИПОТЕЗА 2 ===\n' + notes.join('\n'));
});

test('@exploration прощупывание интерактивных элементов сверх базового обхода', async ({ page }, testInfo) => {
  const notes: string[] = [];
  await page.goto('/');

  const clickVisible = async (name: RegExp) => {
    const candidates = page.getByRole('button', { name });
    const c = await candidates.count();
    for (let i = 0; i < c; i++) {
      const item = candidates.nth(i);
      if (await item.isVisible()) {
        await item.click();
        return true;
      }
    }
    return false;
  };

  // Метроном: старт/стоп, драм-машина, tap tempo.
  await clickVisible(/^Ритм$/);
  await page.waitForTimeout(200);
  await clickVisible(/Старт/);
  await page.waitForTimeout(600);
  await clickVisible(/Стоп/);
  await clickVisible(/Драм-машина/);
  await page.waitForTimeout(200);
  await clickVisible(/Старт/);
  await page.waitForTimeout(600);
  await clickVisible(/Стоп/);
  await page.getByTitle('Нажимайте в такт музыке для определения BPM').click();
  await page.getByTitle('Нажимайте в такт музыке для определения BPM').click();
  await page.getByTitle('Увеличить темп на 5 BPM').click();
  notes.push('Метроном/драм-машина: старт-стоп, tap-tempo, +5 BPM — без явных сбоев UI.');

  // Тренажёр слуха: ответить на вопрос, сменить режим.
  const earTrainingNavFound = (await clickVisible(/^Тренажер$/)) || (await clickVisible(/^Слух$/));
  await page.waitForTimeout(300);
  const questionPanel = page.locator('div').filter({ hasText: 'Какая' }).first();
  notes.push(`Навигация на «Тренажер слуха» удалась: ${earTrainingNavFound}; панель вопроса найдена: ${(await questionPanel.count()) > 0}`);

  // Проверка аккорда: переключение режимов и быстрый выбор аккорда.
  await clickVisible(/^Аккорд$/);
  await page.waitForTimeout(200);
  await clickVisible(/Режим B: Удар/);
  await page.waitForTimeout(200);
  await clickVisible(/Режим A: Перебор/);
  notes.push('Экран «Аккорд»: переключение режимов Перебор/Удар — без явных сбоев UI.');

  // Гриф: гаммы и аккорды, смена диапазона ладов и капо.
  await clickVisible(/^Гриф$/);
  await page.waitForTimeout(200);
  await clickVisible(/Гаммы/);
  await page.waitForTimeout(200);
  await clickVisible(/Аккорды/);
  await page.waitForTimeout(200);
  await clickVisible(/Исследование/);
  notes.push('Экран «Гриф»: переключение режимов Исследование/Гаммы/Аккорды — без явных сбоев UI.');

  // Настройки: тема, нотация, порог, закрытие по фону.
  await page.getByTitle('Настройки').click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /День \(Светлая\)/ }).click();
  await page.getByRole('button', { name: /Ночь \(Индиго\)/ }).click();
  await page.getByRole('radio').nth(1).check();
  await page.getByRole('button', { name: /Строгий/ }).click();
  await page.getByRole('button', { name: /Сохранить и закрыть/ }).click();
  notes.push('Настройки: смена темы/нотации/порога — без явных сбоев UI.');

  await testInfo.attach('poke-around-notes', {
    body: notes.join('\n'),
    contentType: 'text/plain',
  });
  console.log('=== ПРОЩУПЫВАНИЕ ===\n' + notes.join('\n'));
});
