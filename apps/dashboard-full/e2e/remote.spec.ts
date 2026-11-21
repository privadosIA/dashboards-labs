import { expect, test } from '@playwright/test';

// The UI is served by server A (no token) and pointed at server B, a
// second `orchestrator serve` that requires a Bearer token and allows
// A's origin through CORS (e2e/run-e2e.sh starts both).
const REMOTE = process.env['E2E_REMOTE_URL'];
const TOKEN = process.env['E2E_REMOTE_TOKEN'];

test.skip(!REMOTE || !TOKEN, 'needs E2E_REMOTE_URL / E2E_REMOTE_TOKEN (run via e2e/run-e2e.sh)');

test('UI contra un servidor remoto con token: 401 → ajustes → run con stream y vídeo', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Conexión' }).click();
  let dialog = page.getByRole('dialog');

  // Wrong/missing token is told apart from "unreachable".
  await dialog.getByLabel('Dirección del servidor').fill(REMOTE!);
  await dialog.getByRole('button', { name: 'Probar conexión' }).click();
  await expect(dialog.getByText('token falta o es incorrecto')).toBeVisible();

  await dialog.getByLabel('Token de acceso').fill(TOKEN!);
  await dialog.getByRole('button', { name: 'Probar conexión' }).click();
  await expect(dialog.getByText('Conexión correcta.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar conexión' }).click();

  // The shell now shows the remote server and talks to it.
  await expect(page.locator('.rail__server')).toContainText(REMOTE!);
  await expect(page.getByText('Todavía no hay proyectos')).toBeVisible();

  // Everything below goes through Bearer (API) and tickets (SSE, media).
  await page.getByTestId('create-project').click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identificador del proyecto').fill('remote-demo');
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page).toHaveURL(/\/projects\/remote-demo\/editor$/);

  await page.goto('/runs?project=remote-demo');
  const artifact = page.waitForResponse(
    (r) => r.url().includes('/artifacts/out/remote-demo.mp4') && r.url().includes('ticket='),
    { timeout: 40_000 },
  );
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page.locator('.seg--done').first()).toBeVisible({ timeout: 30_000 }); // SSE via ticket
  await expect(page.getByText('succeeded')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('video')).toBeVisible();
  expect([200, 206]).toContain((await artifact).status()); // 206 = ranged media request

  // The long-lived token never travels in a URL.
  const leaked: string[] = [];
  page.on('request', (r) => r.url().includes(TOKEN!) && leaked.push(r.url()));
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(leaked).toEqual([]);
});
