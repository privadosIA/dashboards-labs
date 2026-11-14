import { expect, test } from '@playwright/test';

// Model manager against the embedded build. The server refuses loopback
// download targets (SSRF guard), so the success path of a transfer is
// covered by the Go and component tests; here the whole wire — form, POST,
// SSE stream, failed state — runs for real, plus catalog and deletion.
test.describe.configure({ mode: 'serial' });

test('Modelos: inventario, catálogo, descarga rechazada y borrado con confirmación', async ({
  page,
}) => {
  await page.goto('/models');
  await expect(page.getByRole('heading', { name: 'Instalado' })).toBeVisible();
  // The installed list and the catalog start folded (and the choice is remembered): open both.
  for (const id of ['installed', 'catalog']) {
    const section = page.getByTestId(`${id}-section`);
    await expect(section).not.toHaveAttribute('open', '');
    await section.locator('summary').click();
    await expect(section).toHaveAttribute('open', '');
  }

  // Inventory from the stub assets, and the LoRA caveat.
  await expect(page.locator('.item', { hasText: 'model.safetensors' }).first()).toBeVisible();
  await expect(page.getByTestId('note-image')).toContainText('modo vídeo y en modo imágenes');
  await expect(page.locator('[data-entry="sd-1-5"] [data-testid="vram"]')).toContainText('aprox.');

  // The guide explains each tab and what to install first.
  await expect(page.getByTestId('guide')).toContainText('Para empezar basta con un modelo de Imagen y una voz');
  await expect(page.locator('[data-entry="sd-1-5"] [data-testid="starter"]')).toContainText('Para empezar');

  // LoRA tab: its own tab, the not-applied notice and recommended entries.
  await expect(page.getByRole('tab')).toHaveText(['Imagen', 'Retoque', 'LoRA', 'Vídeo', 'Música', 'Voz']);
  await page.getByRole('tab', { name: 'LoRA' }).click();
  await expect(page.getByText('The pipeline does not apply LoRA yet')).toBeVisible();
  await expect(page.locator('[data-entry="lora-lcm-sd15"]')).toBeVisible();

  // Vídeo tab: Wan bundles with their three files and the animation-models notice.
  await page.getByRole('tab', { name: 'Vídeo' }).click();
  await expect(page.getByText('Animation models: Wan or the AnimateDiff motion module')).toBeVisible();
  const wan = page.locator('[data-entry="video-wan-2-2-ti2v-5b-q4"]');
  await expect(wan).toContainText('Wan 2.2 TI2V 5B');
  await expect(wan.getByTestId('bundle')).toContainText('3 archivos: modelo · codificador de texto · VAE');
  await expect(wan.getByTestId('vram')).toContainText('aprox. 6 GB');
  await page.getByRole('tab', { name: 'Imagen' }).click();

  // Voz tab: voices, the video-only note, and a different catalog.
  await page.getByRole('tab', { name: 'Voz' }).click();
  await expect(page.getByTitle('voz.onnx', { exact: true })).toBeVisible();
  await expect(page.getByTestId('note-voice')).toContainText('solo se usan en modo vídeo');
  await expect(page.locator('[data-entry="sd-1-5"]')).toHaveCount(0);
  await expect(page.locator('[data-entry="voice-en-us-amy-medium"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Imagen' }).click();

  // Built-in catalog with install actions (nothing in it is installed).
  const sd = page.locator('[data-entry="sd-1-5"]');
  await expect(sd).toContainText('Stable Diffusion 1.5');
  await expect(sd.getByRole('button', { name: 'Instalar' })).toBeVisible();

  // Hugging Face mode explains public vs gated repositories.
  await page.locator('mat-button-toggle', { hasText: 'Hugging Face' }).click();
  await expect(page.getByTestId('hf-hint')).toContainText('HF_TOKEN');
  await page.locator('mat-button-toggle', { hasText: 'URL directa' }).click();

  // Existing file: the server's 409 shows next to the form, input kept.
  await page.getByLabel('URL del archivo').fill('https://example.invalid/model.safetensors');
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('form-error')).toContainText('already exists');
  await expect(page.getByLabel('URL del archivo')).toHaveValue(
    'https://example.invalid/model.safetensors',
  );

  // Loopback target: accepted, then fails over SSE with the refusal reason.
  await page.getByLabel('URL del archivo').fill(`${new URL(page.url()).origin}/api/health`);
  await page.getByLabel('Nombre del archivo (opcional)').fill('loop.safetensors');
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  const failed = page.locator('[data-state="failed"]');
  await expect(failed).toBeVisible({ timeout: 15_000 });
  await expect(failed).toContainText('non-public');
  const files = await (await page.request.get('/api/assets')).json();
  expect(JSON.stringify(files)).not.toContain('loop.safetensors');

  // Deletion: declining keeps the file, confirming removes it everywhere.
  const row = page.locator('.item', { hasText: 'zz-disposable.safetensors' });
  await row.getByRole('button', { name: 'Borrar zz-disposable.safetensors' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Borrar zz-disposable.safetensors' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar archivo' }).click();
  await expect(row).toHaveCount(0);
  const env = await (await page.request.get('/api/environment')).json();
  expect(env.models.map((m: { name: string }) => m.name)).not.toContain('zz-disposable.safetensors');
});
