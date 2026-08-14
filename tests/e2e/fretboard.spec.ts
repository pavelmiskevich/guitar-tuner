import { expect, test } from './fixtures/test-base';

test.describe('гриф', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-fretboard`).click();
    await expect(page.getByTestId('fretboard-svg')).toBeVisible();
  });

  test('переключает режимы отображения', async ({ page }) => {
    await page.getByTestId('fb-mode-scales').click();
    await expect(page.getByTestId('fb-root')).toBeVisible();
    await expect(page.getByTestId('fb-scale')).toBeVisible();

    await page.getByTestId('fb-mode-chords').click();
    await expect(page.getByTestId('fb-voicing')).toBeVisible();

    await page.getByTestId('fb-mode-explore').click();
    await expect(page.getByTestId('fb-detected-chord')).toContainText('Нажмите лады');
  });

  test('гамма подсвечивает ноты на грифе', async ({ page }) => {
    await page.getByTestId('fb-mode-scales').click();
    await page.getByTestId('fb-root').selectOption('A');
    await page.getByTestId('fb-scale').selectOption('pentatonic-minor');

    // Минорная пентатоника — 5 ступеней; на 6 струнах и 16 ладах их заведомо больше 20.
    const highlighted = page.getByTestId('fretboard-svg').locator('[data-highlighted="true"]');
    await expect(highlighted.first()).toBeVisible();
    expect(await highlighted.count()).toBeGreaterThan(20);
  });

  test('диапазон ладов меняет объём грифа', async ({ page }) => {
    await page.getByTestId('fb-mode-scales').click();
    const highlighted = page.getByTestId('fretboard-svg').locator('[data-highlighted="true"]');

    await page.getByTestId('fb-range').selectOption('0-12');
    await expect(highlighted.first()).toBeVisible();
    const narrow = await highlighted.count();

    await page.getByTestId('fb-range').selectOption('0-24');
    // Вдвое больше ладов — строго больше подсвеченных ступеней гаммы.
    await expect(async () => {
      expect(await highlighted.count()).toBeGreaterThan(narrow);
    }).toPass();
  });

  test('каподастр меняет подсветку', async ({ page }) => {
    await page.getByTestId('fb-mode-scales').click();
    const before = await page
      .getByTestId('fretboard-svg')
      .locator('[data-highlighted="true"]')
      .count();

    await page.getByTestId('fb-capo').selectOption('3');

    await expect(async () => {
      const after = await page
        .getByTestId('fretboard-svg')
        .locator('[data-highlighted="true"]')
        .count();
      expect(after).not.toBe(before);
    }).toPass();
  });

  test('леворукий режим зеркалит гриф', async ({ page }) => {
    const svg = page.getByTestId('fretboard-svg');
    const before = await svg.innerHTML();

    await page.getByTestId('fb-lefty').check();

    await expect(async () => {
      expect(await svg.innerHTML()).not.toBe(before);
    }).toPass();
  });

  test('кнопка «Поделиться» кладёт в буфер ссылку с параметрами схемы', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByTestId('fb-mode-scales').click();
    await page.getByTestId('fb-root').selectOption('D');
    await page.getByTestId('fb-scale').selectOption('blues');
    await page.getByTestId('fb-share').click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('mode=scales');
    expect(copied).toContain('root=D');
    expect(copied).toContain('scale=blues');
  });

  test('открытие ссылки с хэшем восстанавливает состояние', async ({ page }, testInfo) => {
    // Состояние из хэша читается при монтировании экрана грифа, поэтому
    // грузим страницу с хэшем заново и снова открываем гриф.
    // Навигация только на хэш не создаёт новый документ (проверено эмпирически:
    // маркер, выставленный в window до перехода, переживает такой goto), а экран
    // грифа из beforeEach уже смонтирован с пустым хэшем — поэтому здесь нужна
    // явная перезагрузка страницы, а не просто goto на URL с другим хэшем.
    await page.goto('/#mode=scales&root=D&scale=blues&capo=3');
    await page.reload();
    const prefix = testInfo.project.name === 'chromium-mobile' ? 'nav-mobile' : 'nav-desktop';
    await page.getByTestId(`${prefix}-fretboard`).click();

    await expect(page.getByTestId('fb-root')).toHaveValue('D');
    await expect(page.getByTestId('fb-scale')).toHaveValue('blues');
    await expect(page.getByTestId('fb-capo')).toHaveValue('3');
  });

  test('ссылка открывает сразу вкладку «Гриф» без ручного переключения', async ({ page }) => {
    await page.goto('/#tab=fretboard&mode=scales&root=D&scale=blues');
    await page.reload();

    await expect(page.getByTestId('fretboard-svg')).toBeVisible();
    await expect(page.getByTestId('fb-root')).toHaveValue('D');
  });

  test('ссылка несёт строй, капо, диапазон, ориентацию и режим подписей', async ({ page }) => {
    await page.goto('/#tab=fretboard&mode=scales&root=A&scale=blues&tuning=drop-c&capo=2&range=5-12&left=1&labels=degree');
    await page.reload();

    await expect(page.getByTestId('fb-capo')).toHaveValue('2');
    await expect(page.getByTestId('fb-range')).toHaveValue('5-12');
    await expect(page.getByTestId('fb-lefty')).toBeChecked();
    // Строй из ссылки применяется глобально — его видно в подзаголовке шапки.
    await expect(page.getByTestId('header-subtitle')).toContainText('Drop C');
  });

  test('ссылка восстанавливает аппликатуру аккорда', async ({ page }) => {
    await page.goto('/#tab=fretboard&mode=chords&root=C&voicing=c-open');
    await page.reload();

    await expect(page.getByTestId('fb-voicing')).toHaveValue('c-open');
  });

  test('ссылка восстанавливает ноты, расставленные вручную', async ({ page }) => {
    await page.goto('/#tab=fretboard&mode=explore&root=A&frets=x.3.2.0.1.0');
    await page.reload();

    await expect(page.getByTestId('fb-detected-chord')).toContainText('Распознан');
    const highlighted = page.getByTestId('fretboard-svg').locator('[data-highlighted="true"]');
    await expect(highlighted).toHaveCount(5);
  });

  test('ссылка различается для разных наборов нот на грифе', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByTestId('fb-mode-explore').click();
    await page.getByTestId('fb-cell-1-3').click();
    await page.getByTestId('fb-share').click();
    const first = await page.evaluate(() => navigator.clipboard.readText());

    await page.getByTestId('fb-cell-2-2').click();
    await page.getByTestId('fb-share').click();
    const second = await page.evaluate(() => navigator.clipboard.readText());

    expect(first).toContain('frets=');
    expect(second).toContain('frets=');
    expect(second).not.toBe(first);
  });

  test('адрес в браузере обновляется вслед за схемой', async ({ page }) => {
    await page.getByTestId('fb-mode-scales').click();
    await page.getByTestId('fb-root').selectOption('G');
    await page.getByTestId('fb-scale').selectOption('dorian');

    await expect(async () => {
      const hash = page.url().split('#')[1] ?? '';
      expect(hash).toContain('tab=fretboard');
      expect(hash).toContain('root=G');
      expect(hash).toContain('scale=dorian');
    }).toPass();
  });

  test('раздел объясняет, что делает кнопка «Поделиться»', async ({ page }) => {
    const hint = page.getByTestId('fb-share-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('ссылк');
  });

  test('экспорт скачивает схему грифа, а не иконку', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('fb-export').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^fretboard-.*\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const svg = Buffer.concat(chunks).toString('utf8');

    // У иконки lucide viewBox "0 0 24 24" и десяток символов разметки.
    // У схемы грифа — сотни элементов и подписи ладов.
    expect(svg.length).toBeGreaterThan(2000);
    expect(svg).not.toContain('viewBox="0 0 24 24"');
  });
});
