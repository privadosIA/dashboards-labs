import { expect, test } from '@playwright/test';

// The Animación section against the embedded build: it opens as a window of its own (no side navigation of the dashboard) with the
// screens of the shared library, in the dashboard's own theme, whatever the server has to show (songs, an empty library or a reason it
// could not read them).
test('Animación: se abre como ventana propia y recorre las pantallas de la librería', async ({ page }) => {
  await page.goto('/animation');

  await expect(page).toHaveURL(/\/animation\/songs$/);
  // A window of its own: the slim header with the way back, and none of the dashboard's side navigation.
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.getByTestId('section-home')).toHaveAttribute('href', '/projects');
  await expect(page.locator('mat-nav-list')).toHaveCount(0);
  const sections = page.getByTestId('animation-sections');
  await expect(sections).toBeVisible();
  await expect(page.getByTestId('animation-songs')).toHaveClass(/sections__link--on/);
  await expect(page.locator('app-songs-page h1')).toBeVisible();

  // Another screen of the library, under the section, without leaving it.
  await page.getByTestId('animation-pieces').click();
  await expect(page).toHaveURL(/\/animation\/pieces$/);
  await expect(page.getByTestId('animation-pieces')).toHaveClass(/sections__link--on/);
  await expect(page.locator('app-pieces-page h1')).toBeVisible();

  // A piece that does not exist says so, and the section stays.
  await page.goto('/animation/pieces/does-not-exist');
  await expect(page.getByTestId('missing').or(page.getByTestId('reason'))).toBeVisible();
  await expect(sections).toBeVisible();
});

test('Animación: lleva el tema de la aplicación, no uno propio', async ({ page }) => {
  await page.goto('/animation/songs');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lab-accent').trim());
  const link = page.getByTestId('animation-songs');
  const color = await link.evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(accent).not.toBe('');
  expect(color).not.toBe('rgba(0, 0, 0, 0)');
});
