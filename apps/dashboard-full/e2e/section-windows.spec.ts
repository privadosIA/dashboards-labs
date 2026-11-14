import { expect, test } from '@playwright/test';

// Animation, Video and Music as windows of their own: three buttons of the Projects page open them in a new tab, drawn with a slim header and
// without the dashboard's side navigation; the Music projects entry of the navigation lists the music projects without touching the modes the
// person chose; the simple version has none of it. It needs no data of the server.

for (const section of ['animation', 'video', 'music'] as const) {
  test(`Proyectos abre ${section} en una pestaña nueva, sin el menú del panel, y la de origen no cambia`, async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('mat-nav-list')).toBeVisible();

    const [window] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId(`open-${section}`).click()]);
    await window.waitForLoadState();

    await expect(window).toHaveURL(new RegExp(`/${section}(/|$)`));
    await expect(window.getByTestId('section-header')).toBeVisible();
    await expect(window.getByTestId('section-home')).toHaveAttribute('href', '/projects');
    await expect(window.locator('mat-nav-list')).toHaveCount(0);
    // the tab it came from stays where it was, with its menu
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator('mat-nav-list')).toBeVisible();
    await window.close();
  });
}

test('la cabecera de una ventana lleva de vuelta a Proyectos, con el menú', async ({ page }) => {
  await page.goto('/video');
  await page.getByTestId('section-home').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('mat-nav-list')).toBeVisible();
  await expect(page.getByTestId('section-header')).toHaveCount(0);
});

test('el menú no lista las secciones ni una entrada de música de proyectos, y la lista puede mostrar un solo modo por su dirección sin cambiar los que el usuario eligió', async ({ page }) => {
  await page.goto('/projects');
  const nav = page.locator('mat-nav-list');
  for (const gone of ['/animation', '/video', '/music', '/projects?mode=music']) await expect(nav.locator(`a[href="${gone}"]`)).toHaveCount(0);
  await expect(nav.locator('a[href="/projects"]')).toHaveAttribute('aria-current', 'page');

  // a mode can still be asked for by the address: only that mode, and the choice of the person is untouched
  await page.goto('/projects?mode=music');
  await expect(page.getByTestId('projects-only')).toBeVisible();
  await expect(nav.locator('a[href="/projects"]')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => localStorage.getItem('mo.modes'))).toBeNull();

  // and the line takes them back to the modes they chose
  await page.getByTestId('projects-only-clear').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId('projects-only')).toHaveCount(0);
});

test('la cabecera de Proyectos pone sus acciones compactas en una línea a un ancho de escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/projects');
  const tops = await page.evaluate(() =>
    ['create-project', 'create-music-project', 'import-package', 'import-project', 'open-animation', 'open-video', 'open-music'].map((id) => Math.round(document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
});

test('la versión simple no tiene las secciones: sus direcciones llevan a Crear', async ({ page }) => {
  await page.goto('/projects');
  await page.evaluate(() => localStorage.setItem('mo.simple', 'simple'));
  for (const address of ['/animation', '/video', '/music']) {
    await page.goto(address);
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByTestId('section-header')).toHaveCount(0);
  }
  await page.evaluate(() => localStorage.removeItem('mo.simple'));
});
