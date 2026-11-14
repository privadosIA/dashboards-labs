import { expect, test } from '@playwright/test';

import { choose } from './helpers';

// The dashboard as an installed app on a phone (openspec change add-mobile-pwa).

test('the shell says the server cannot be reached and recovers on a retry', async ({ page }) => {
  let down = true;
  await page.route('**/api/health', (route) => (down ? route.abort('connectionrefused') : route.continue()));
  await page.goto('/create');
  const banner = page.getByTestId('server-down');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('No se puede conectar con el servidor');
  down = false;
  await page.getByTestId('server-retry').click();
  await expect(banner).toBeHidden();
});

test('the manifest makes it installable and the start address opens Create', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  expect(res.headers()['cache-control']).toBe('no-cache');
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  await page.goto(manifest.start_url);
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.locator('link[rel=manifest]')).toHaveCount(1);
});

test.describe('the phone shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models/availability', (route) => route.fulfill({ json: { tasks: {} } }));
  });

  test('a phone in the simple version has a bar of tabs at the bottom, no hamburger, and nothing overflows', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the tab bar is for a narrow screen');
    await page.goto('/create');
    const bar = page.getByTestId('tab-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.tabs__label')).toHaveText(['Crear', 'Galería', 'Más']);
    await expect(page.getByRole('button', { name: 'Abrir navegación' })).toHaveCount(0);
    const box = await bar.boundingBox();
    const vh = page.viewportSize()?.height ?? 0;
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(vh);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // The tabs are a thumb tall.
    for (const t of await bar.locator('.tabs__tab').all()) expect((await t.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  });

  test('the tabs move between Create and Gallery and More opens the sheet with the connection', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the tab bar is for a narrow screen');
    await page.goto('/create');
    await page.getByTestId('tab-bar').getByText('Galería').click();
    await expect(page).toHaveURL(/\/gallery$/);
    await expect(page.getByTestId('tab-bar').locator('.tabs__tab--active')).toContainText('Galería');
    await page.getByTestId('tab-more').click();
    await expect(page.getByTestId('sheet-action').filter({ hasText: 'Conexión' })).toBeVisible();
    await expect(page.getByTestId('sheet-action').filter({ hasText: 'Versión avanzada' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sheet-action')).toHaveCount(0);
  });

  test('the advanced version brings the drawer back', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the tab bar is for a narrow screen');
    await page.goto('/create');
    await page.getByTestId('tab-more').click();
    await page.getByTestId('sheet-action').filter({ hasText: 'Versión avanzada' }).click();
    await expect(page.getByTestId('tab-bar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible();
  });

  test('the bar steps aside while the request is typed', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the tab bar is for a narrow screen');
    await page.goto('/create');
    await page.getByTestId('pick-auto').click();
    await page.getByTestId('create-text').focus();
    await expect(page.getByTestId('tab-bar')).toBeHidden();
    await page.getByTestId('create-text').blur();
    await expect(page.getByTestId('tab-bar')).toBeVisible();
  });
});

/** Picks the first images project of the list (the gallery does not choose one by itself). */
async function pickImagesProject(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Proyecto' }).tap();
  await page.getByRole('option').filter({ hasText: 'images' }).first().tap();
}

test.describe('the gallery on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models/availability', (route) =>
      route.fulfill({ json: { tasks: { assistant: { available: false, reason: 'unreachable', provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
    );
  });

  test('an image opens full screen, has a sheet of actions and closes with a swipe down', async ({ page }) => {
    test.setTimeout(120_000);
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the phone gallery is for a narrow screen');
    // Something to look at: an image made on the phone (the stub sd writes the picture).
    await page.goto('/create');
    await page.getByTestId('pick-auto').click();
    await page.getByTestId('create-text').fill('un faro en la niebla');
    await page.getByTestId('create-send').tap();
    await choose(page, 'create-kinds', 'kind-image');
    await page.getByTestId('create-confirm').tap();
    await expect(page.getByTestId('create-result').last()).toBeVisible({ timeout: 90_000 });

    await page.getByTestId('tab-bar').getByText('Galería').tap();
    await pickImagesProject(page);
    const frame = page.getByTestId('gallery-image').first();
    await expect(frame).toBeVisible({ timeout: 30_000 });

    // The ⋮ button: a bottom sheet, with targets a thumb tall.
    await page.getByTestId('gallery-image-actions').first().tap();
    const rows = page.getByTestId('sheet-action');
    await expect(rows.first()).toBeVisible();
    for (const r of await rows.all()) expect((await r.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    await page.keyboard.press('Escape');
    await expect(rows).toHaveCount(0);

    // The image: the whole screen.
    await frame.tap();
    const viewer = page.getByTestId('viewer');
    await expect(viewer).toBeVisible();
    const box = await viewer.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(page.viewportSize()?.width);
    expect(Math.round(box?.height ?? 0)).toBe(page.viewportSize()?.height);
    await expect(page.getByTestId('viewer-pos')).toHaveText('1 / 1');

    // Swipe down closes it (a touch drag, as a finger makes it).
    await viewer.evaluate((el) => {
      const send = (type: string, y: number, t: number) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, { pointerId: 7, clientX: 195, clientY: y, pointerType: 'touch' });
        Object.defineProperty(e, 'timeStamp', { value: t });
        el.dispatchEvent(e);
      };
      send('pointerdown', 200, 0);
      send('pointermove', 320, 40);
      send('pointerup', 420, 90);
    });
    await expect(viewer).toHaveCount(0);
    await expect(frame).toBeVisible();
  });

  test('the viewer closes with its button and with the back gesture', async ({ page }) => {
    test.setTimeout(120_000);
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the phone gallery is for a narrow screen');
    await page.goto('/gallery');
    await pickImagesProject(page);
    const frame = page.getByTestId('gallery-image').first();
    await expect(frame).toBeVisible({ timeout: 30_000 });
    await frame.tap();
    await expect(page.getByTestId('viewer')).toBeVisible();
    await page.getByTestId('viewer-close').tap();
    await expect(page.getByTestId('viewer')).toHaveCount(0);
    await frame.tap();
    await expect(page.getByTestId('viewer')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('viewer')).toHaveCount(0);
    await expect(page).toHaveURL(/\/gallery/);
  });
});

test.describe('Create on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models/availability', (route) =>
      route.fulfill({ json: { tasks: { assistant: { available: false, reason: 'unreachable', provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
    );
  });

  async function askForAVideo(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/create');
    await page.getByTestId('pick-auto').click();
    await page.getByTestId('create-text').fill('un gato en una azotea');
    await page.getByTestId('create-send').tap();
    await expect(page.getByTestId('create-review')).toBeVisible();
  }

  test('the options of the card are single lines that open a sheet', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the sheets are for a narrow screen');
    await askForAVideo(page);
    await expect(page.getByTestId('create-levels')).toHaveJSProperty('tagName', 'BUTTON');
    await expect(page.getByTestId('create-kinds')).toContainText('Vídeo');
    expect((await page.getByTestId('create-levels').boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await choose(page, 'create-levels', 'level-draft');
    await expect(page.getByTestId('create-levels')).toContainText('Borrador');
    await choose(page, 'create-kinds', 'kind-music');
    await expect(page.getByTestId('create-kinds')).toContainText('Música');
    await expect(page.getByTestId('create-lengths')).toBeVisible();
    await choose(page, 'create-lengths', 'length-long');
    await expect(page.getByTestId('create-lengths')).toContainText('Larga');
  });

  test('the confirm action and the field being typed in stay visible when the keyboard takes half the screen', async ({ page }) => {
    const phone = (page.viewportSize()?.width ?? 0) < 600;
    test.skip(!phone, 'the sheets are for a narrow screen');
    await askForAVideo(page);
    // The on-screen keyboard leaves about half of the page: the same as a short window.
    await page.setViewportSize({ width: 390, height: 420 });
    const field = page.getByTestId('create-title');
    await field.focus();
    const vh = 420;
    const confirm = await page.getByTestId('create-confirm').boundingBox();
    const box = await field.boundingBox();
    expect(confirm && confirm.y >= 0 && confirm.y + confirm.height <= vh).toBe(true);
    expect(box && box.y >= 0 && box.y + box.height <= vh).toBe(true);
    // The action does not cover the field.
    expect(box!.y + box!.height <= confirm!.y || box!.y >= confirm!.y + confirm!.height).toBe(true);
    // And the bar of tabs is out of the way.
    await expect(page.getByTestId('tab-bar')).toBeHidden();
  });
});
