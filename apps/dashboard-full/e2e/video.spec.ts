import { expect, test } from '@playwright/test';

// The Vídeo section against the embedded build: it opens as a window of its own (no side navigation of the dashboard) with the studio
// of the shared library, in the dashboard's own theme, and reads the models and the edit tools of the server it is served by (a card with a model, or the
// reason it could not read them) without opening the dashboard's own error notice.
test('Vídeo: se abre como ventana propia con el estudio de la librería', async ({ page }) => {
  await page.goto('/video');

  await expect(page).toHaveURL(/\/video$/);
  // A window of its own: the slim header with the way back, and none of the dashboard's side navigation.
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.getByTestId('section-home')).toHaveAttribute('href', '/projects');
  await expect(page.locator('mat-nav-list')).toHaveCount(0);
  await expect(page.locator('.studio.studio-kit')).toBeVisible();
  await expect(page.getByTestId('generate')).toBeVisible();
  await expect(page.locator('app-history')).toBeVisible();
  // The studio says what it could not read beside the form: the dashboard's snackbar stays closed.
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  // The Edit tab of the same page, with the tools the server lists (or why it could not).
  await page.getByRole('tab', { name: /Editar vídeo|Edit video/ }).click();
  await expect(page.getByTestId('tool-scale').or(page.getByTestId('tools-error'))).toBeVisible();
});

test('Vídeo: lleva el tema de la aplicación y cabe bajo su cabecera sin scroll de página', async ({ page }) => {
  await page.goto('/video');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lab-accent').trim());
  expect(accent).not.toBe('');
  const frame = page.locator('.studio .frame').first();
  await expect(frame).toBeVisible();
  const fits = await page.evaluate(() => {
    const rect = document.querySelector('.studio .frame')!.getBoundingClientRect();
    return rect.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 1;
  });
  expect(fits).toBe(true);
});

// The Motion library of the Edit tab, against the embedded build and a server whose vision service is a stub: it opens from
// its row with the limits said first, reads the library (empty at the start) and a video sent to it comes back either as a
// motion being prepared or with the server's reason; the dashboard's own error notice stays closed either way.
test('Vídeo: la biblioteca de movimientos se abre desde Editar y explica lo que el servidor contesta', async ({ page }) => {
  await page.goto('/video');
  await page.getByRole('tab', { name: /Editar vídeo|Edit video/ }).click();
  await page.getByTestId('tool-motion-library').click();

  const dialog = page.locator('app-motion-library-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('motion-limits')).toBeVisible();
  await expect(dialog.getByTestId('motions-empty').or(dialog.locator('li[data-testid^=motion-]').first()).or(dialog.getByTestId('motions-error'))).toBeVisible();

  await dialog.getByTestId('motion-file').setInputFiles({ name: 'walk.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video') });
  await dialog.getByTestId('add-motion').click();
  await expect(dialog.getByTestId('motion-error').or(dialog.locator('li[data-testid^=motion-]').first())).toBeVisible();
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
});
