import { expect, test } from '@playwright/test';

// The Dataset section against the embedded build: the button of Projects opens it, it shows the studio of the shared library in a window of its own (the section's header and a slim bar with the
// Studio and Presets links), the kinds and the engines of the server are there, the brief counts, the presets page lists the library, and the simple version has none of it.
// It writes nothing and calls no assistant (that needs Ollama): generating and creating are the library's specs, with the in-memory adapters.
// Written here and run by `run-e2e.sh` on the machine that has the server.

test('Dataset: el botón de Proyectos lleva a la sección con el estudio de la librería, sus tipos, sus motores y el contador', async ({ page }) => {
  await page.goto('/projects');
  const button = page.getByTestId('open-dataset');
  await expect(button).toHaveAttribute('href', '/dataset');
  await expect(button).toHaveAttribute('target', '_blank');

  await page.goto('/dataset');
  await expect(page).toHaveURL(/\/dataset\/studio$/);
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.getByTestId('dataset-bar')).toBeVisible();
  await expect(page.getByTestId('dataset-studio')).toBeVisible();
  await expect(page.getByTestId('nav-studio')).toHaveClass(/active/);

  // the five kinds, each explained; the engines panel reads the server
  await expect(page.locator('[data-testid^="kind-"][role="radio"]')).toHaveCount(5);
  await expect(page.getByTestId('kind-detail')).toContainText('escenas');
  await expect(page.getByTestId('engines-panel')).toBeVisible();
  await page.getByTestId('kind-songs').click();
  await expect(page.getByTestId('engine-ace-step')).toBeVisible();

  // the brief counts against the limit and Generate says why it is off
  await expect(page.getByTestId('generate')).toBeDisabled();
  const brief = page.locator('lab-brief textarea').first();
  await brief.click();
  await brief.pressSequentially('un tema de verano con guitarra y palmas');
  await expect(page.getByTestId('brief-counter')).toContainText('/ 2000');
  await expect(page.getByTestId('generate')).toBeEnabled();
  // the studio says what it could not do beside the work: the dashboard's snackbar stays closed
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
});

test('Dataset: la página de presets lista la biblioteca, se busca y se fija un ejemplo', async ({ page }) => {
  await page.goto('/dataset/studio');
  await page.getByTestId('nav-presets').click();
  await expect(page).toHaveURL(/\/dataset\/presets$/);
  await expect(page.getByTestId('nav-presets')).toHaveClass(/active/);
  await expect(page.getByTestId('presets-page')).toBeVisible();
  await expect(page.locator('li.card').first()).toBeVisible();
  // each preset says where it comes from and under which licence
  await expect(page.locator('[data-testid^="source-"]').first()).toContainText('·');
  await page.getByTestId('kind-music').click();
  await expect(page.locator('li.card').first()).toBeVisible();
  await page.locator('[data-testid^="pin-"]').first().click();
  await expect(page.getByTestId('pinned')).toBeVisible();
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
});

test('Dataset: la versión simple no tiene la sección ni su botón: su dirección lleva a Crear', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple')).catch(() => undefined);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple'));
  await page.goto('/dataset');
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByTestId('open-dataset')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('mo.simple'));
});
