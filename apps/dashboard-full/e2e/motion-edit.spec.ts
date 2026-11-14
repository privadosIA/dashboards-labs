import { expect, test } from '@playwright/test';

// The Motion Edit tab of the Animation section against the embedded build: it opens from the section's bar with the editor of pieces of the shared library, in the dashboard's own theme;
// a piece of the server opens at /animation/motion-edit/pieces/<id> (also from the piece's own page in Animation, with Edit in Motion Edit), Back returns, and the Code tab opens; the simple version has no
// Motion Edit. Written here and run by `run-e2e.sh` on the machine that has the server (the server of the suite may have no piece: that part of the test is then skipped).

test('Motion Edit: se abre desde la pestaña de Animación con la lista de piezas de la librería y la versión simple no la tiene', async ({ page }) => {
  await page.goto('/animation');
  await page.getByTestId('animation-motion-edit').click();

  await expect(page).toHaveURL(/\/animation\/motion-edit\/pieces$/);
  await expect(page.getByTestId('animation-motion-edit')).toHaveClass(/sections__link--on/);
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.locator('app-pieces-page')).toBeVisible();
  // the editor says what it could not do beside the work: the dashboard's snackbar stays closed
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  // The simple version has no Motion Edit: its address leads to Create.
  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple'));
  await page.goto('/motion-edit/pieces');
  await expect(page).toHaveURL(/\/create$/);
  await page.evaluate(() => localStorage.removeItem('mo.simple'));
});

test('Motion Edit: una pieza del servidor se abre en el editor, el Código se abre y Volver deja la lista', async ({ page }) => {
  await page.goto('/animation/motion-edit/pieces');
  // the list arrives after the page: wait for a row or for the empty notice before deciding there is nothing to open
  await expect(page.locator('app-piece-row, [data-testid="empty"]').first()).toBeVisible();
  const open = page.locator('app-piece-row .open').first();
  test.skip((await open.count()) === 0, 'the server of the suite has no animated piece to open');

  await open.click();
  await expect(page).toHaveURL(/\/animation\/motion-edit\/pieces\/[^/]+$/);
  await expect(page.locator('h1')).not.toBeEmpty();
  await expect(page.locator('lab-motion-timeline')).toBeVisible();

  await page.getByTestId('view-code').click();
  await expect(page.getByTestId('code-host')).toBeVisible();
  await page.getByTestId('view-visual').click();
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  await page.locator('a.back').click();
  await expect(page).toHaveURL(/\/animation\/motion-edit\/pieces$/);
});

test('Motion Edit: desde la página de una pieza de Animación, Editar en Motion Edit abre esa pieza en el editor', async ({ page }) => {
  await page.goto('/animation/pieces');
  await expect(page.locator('app-piece-card, [data-testid="empty"]').first()).toBeVisible();
  const open = page.locator('app-piece-card [data-testid="open"]').first();
  test.skip((await open.count()) === 0, 'the server of the suite has no animated piece to open');

  await open.click();
  await expect(page).toHaveURL(/\/animation\/pieces\/[^/]+$/);
  const id = page.url().split('/').pop()!;
  await page.getByTestId('edit-in-motion-edit').click();
  await expect(page).toHaveURL(new RegExp(`/animation/motion-edit/pieces/${id}$`));
  await expect(page.locator('lab-motion-timeline')).toBeVisible();
});

test('Motion Edit: desde la lista de piezas, Flujo guiado abre la página del flujo dentro de la sección y la versión simple no la tiene', async ({ page }) => {
  await page.goto('/animation/motion-edit/pieces');
  await expect(page.locator('app-pieces-page')).toBeVisible();
  await page.getByTestId('guided-flow').click();

  await expect(page).toHaveURL(/\/animation\/motion-edit\/flow$/);
  await expect(page.locator('app-flow-page')).toBeVisible();
  // the flow needs the song port, which the dashboard provides at the start: the page opens, with the sentence box and the (empty or not) list of kept flows
  await expect(page.getByTestId('sentence')).toBeVisible();
  await expect(page.getByTestId('flow-list')).toBeVisible();
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple'));
  await page.goto('/animation/motion-edit/flow');
  await expect(page).toHaveURL(/\/create$/);
  await page.evaluate(() => localStorage.removeItem('mo.simple'));
});
