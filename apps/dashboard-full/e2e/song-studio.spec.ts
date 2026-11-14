import { expect, test } from '@playwright/test';

// The Música section against the embedded build: it opens as a window of its own (no side navigation of the dashboard) with the song
// studio of the shared library, in the dashboard's own theme, apart from the music of a project; the Engines button of its bar opens the panel; and a song made
// there is a project labelled with this dashboard's client (the machine has no GPU, no Docker and no Ollama: the server makes
// it with the stub ACE-Step binaries).

test.beforeEach(async ({ request }) => {
  // every test starts from no songs of this studio: the projects the library makes are the ones named ms-*
  const projects = (await (await request.get('/api/projects')).json()) as { id: string }[];
  for (const p of projects.filter((x) => x.id.startsWith('ms-'))) await request.delete(`/api/projects/${p.id}`);
});

test('Música: se abre como ventana propia con el estudio de la librería, y el botón de Motores abre su panel', async ({ page }) => {
  await page.goto('/music');

  await expect(page).toHaveURL(/\/music$/);
  // A window of its own: the slim header with the way back, and none of the dashboard's side navigation.
  await expect(page.getByTestId('section-header')).toBeVisible();
  await expect(page.getByTestId('section-home')).toHaveAttribute('href', '/projects');
  await expect(page.locator('mat-nav-list')).toHaveCount(0);
  await expect(page.locator('.studio.studio-kit')).toBeVisible();
  await expect(page.getByTestId('generate')).toBeVisible();
  await expect(page.getByTestId('songs-empty')).toBeVisible();
  // the studio says what it could not read beside the form: the dashboard's snackbar stays closed
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);

  await page.getByTestId('song-studio-bar').getByTestId('engines-open').click();
  await expect(page.locator('app-engines-dialog')).toBeVisible();
});

test('Música: una canción hecha en la sección es un proyecto del cliente dashboard-full y sale en Mis canciones', async ({ page, request }) => {
  await page.goto('/music');
  await page.getByTestId('title').fill('Night drive');
  await page.getByTestId('lyrics').fill('[verse]\nla la la');
  await page.getByTestId('style').fill('A slow lo-fi piano piece');
  await expect(page.getByTestId('generate')).toBeEnabled();
  await page.getByTestId('generate').click();

  const card = page.getByTestId('songs').locator('app-song-card').first();
  await expect(card.getByTestId('song-title')).toHaveText('Night drive');
  await expect(card.getByTestId('song-audio')).toBeAttached({ timeout: 45_000 });

  const projects = (await (await request.get('/api/projects')).json()) as { id: string }[];
  const mine = projects.find((p) => p.id.startsWith('ms-'))!;
  const config = (await (await request.get(`/api/projects/${mine.id}/config`)).json()) as { yaml: string };
  expect(config.yaml).toContain('client: dashboard-full');
  expect(config.yaml).not.toContain('client: music-studio');
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
});

test('Música: la música de un proyecto sigue en su sitio y el estudio cabe bajo su barra sin scroll de página', async ({ page }) => {
  await page.goto('/music');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lab-accent').trim());
  expect(accent).not.toBe('');
  await expect(page.locator('.studio .composer')).toBeVisible();
  const fits = await page.evaluate(() => {
    const rect = document.querySelector('.studio .composer')!.getBoundingClientRect();
    return rect.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 1;
  });
  expect(fits).toBe(true);
  // the section does not take over the address of a project's own music view
  await page.goto('/projects/inexistente/music');
  await expect(page).toHaveURL(/\/projects\/inexistente\/music$/);
  await expect(page.locator('.studio.studio-kit')).toHaveCount(0);
});
