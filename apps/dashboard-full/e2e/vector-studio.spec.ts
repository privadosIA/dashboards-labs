import { expect, test } from '@playwright/test';

// The Vector tab of the Animation section against the embedded build: it opens from the section's bar with the vector studio of the shared library, in the dashboard's own theme,
// with a bar over it that holds the Editor and Catalog links; the example loads; the catalog page lists the vector parts; and a part sent from the section is
// in the catalog of the server (and so in the library of the Animation section). Written here and run by `run-e2e.sh` on the machine that has the server.

test('Vector: se abre desde la pestaña de Animación con el estudio de la librería, carga el ejemplo y recorre el catálogo', async ({ page }) => {
  await page.goto('/animation');
  await page.getByTestId('animation-vector').click();

  await expect(page).toHaveURL(/\/animation\/vector\/editor$/);
  await expect(page.getByTestId('animation-vector')).toHaveClass(/sections__link--on/);
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.getByTestId('vector-bar')).toBeVisible();
  await expect(page.getByTestId('editor-page')).toBeVisible();
  await expect(page.getByTestId('nav-editor')).toHaveClass(/active/);

  await page.getByTestId('example').first().click();
  await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible();
  // the studio says what it could not do beside the work: the dashboard's snackbar stays closed
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  // The example is unsaved work: leaving the editor asks first (the browser's own question).
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('nav-catalog').click();
  await expect(page).toHaveURL(/\/animation\/vector\/catalog$/);
  await expect(page.getByTestId('catalog-page')).toBeVisible();
  await expect(page.getByTestId('nav-catalog')).toHaveClass(/active/);
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  // The simple version has no Vector: its address (the old one too) leads to Create.
  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple'));
  await page.goto('/vector/editor');
  await expect(page).toHaveURL(/\/create$/);
  await page.evaluate(() => localStorage.removeItem('mo.simple'));
});

test('Vector: una parte enviada desde la sección sale en su catálogo y en el del servidor, y se abre otra vez en el editor', async ({ page, request }) => {
  const name = `e2e-vector-${Date.now().toString(36)}`;
  try {
    await page.goto('/animation/vector/editor');
    await page.getByTestId('example').first().click();
    await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible();

    await page.getByTestId('toolbar').getByTestId('send').click();
    await page.locator('dialog[data-testid="send"] input').first().fill(name);
    await page.getByTestId('send-confirm').click();
    const outcome = await Promise.race([
      page.getByTestId('send-review').waitFor({ timeout: 60_000 }).then(() => 'review'),
      page.getByTestId('send-problems').waitFor({ timeout: 60_000 }).then(() => 'problems'),
    ]);
    // The server of the suite draws the pictures of a draft with a Chrome; a machine with none cannot check a part, and that is not this section's to test.
    test.skip(outcome === 'problems', `the server could not check the part: ${outcome === 'problems' ? await page.getByTestId('send-problems').innerText() : ''}`);
    await page.getByTestId('send-approve').click();
    await expect(page.getByTestId('send-done')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('send-finish').click();

    // It is a part of the server's catalog, so the Animation section's library has it too.
    const parts = (await (await request.get('/api/music-motion/catalog')).json()) as { parts: { name: string }[] };
    expect(parts.parts.map((p) => p.name)).toContain(name);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('nav-catalog').click();
    await expect(page).toHaveURL(/\/animation\/vector\/catalog$/);
    await expect(page.getByTestId(`part-${name}`)).toBeVisible();
    await page.getByTestId(`part-${name}`).getByTestId('open-part').click();
    await expect(page).toHaveURL(/\/animation\/vector\/editor$/);
    await expect(page.getByTestId('doc-name')).not.toHaveValue('');
    await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

    // From Parts, the same part leads to the Vector editor: Open in Vector names it in the address and the editor opens it.
    await page.goto(`/animation/parts/mine/${name}`);
    await page.getByTestId('open-in-vector').click();
    await expect(page).toHaveURL(/\/animation\/vector\/editor$/);
    await expect(page.getByTestId('notice')).toContainText(name);
    await expect(page.getByTestId('doc-name')).not.toHaveValue('');
  } finally {
    await request.delete(`/api/music-motion/parts/${name}?force=true`).catch(() => undefined);
  }
});
