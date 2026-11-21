import { expect, test } from '@playwright/test';

// Motion graphics against the embedded build: a scene that is an animated page, with the page
// previewed in a sandboxed frame that a slider moves, and an overlay on a scene.
const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:#003}
#b{position:absolute;top:20px;left:0;width:40px;height:40px;background:#f00;animation:go 2s linear both}
@keyframes go{from{left:0}to{left:300px}}</style></head><body><div id="b"></div></body></html>`;

test('gráfico animado y rótulo: describirlo, ver la página en el marco y moverla con el control de tiempo', async ({ page, request }) => {
  const env = await (await request.get('/api/environment')).json();
  test.skip(!env.binaries.some((b: { name: string; present: boolean }) => b.name === 'chrome' && b.present), 'no Chrome or Chromium on this machine');

  expect((await request.post('/api/projects', { data: { id: 'e2e-motion' } })).status()).toBe(201);
  const yaml = [
    'project: e2e-motion',
    'output: {mode: video, file: out/e2e-motion.mp4}',
    'defaults: {model: models/model.safetensors, voice: voices/voz.onnx, resolution: 1280x720, sampler: euler, steps: 10, fps: 24}',
    'scenes:',
    '  - {id: gfx, motion_graphic: tres ideas sobre azul, silence_seconds: 2}',
    '  - {id: pic, prompt: un faro, silence_seconds: 2, seed: 1}',
    '',
  ].join('\n');
  expect((await request.put('/api/projects/e2e-motion/config', { data: { yaml } })).status()).toBe(200);
  expect((await request.put('/api/projects/e2e-motion/scenes/gfx/motion', { data: { html: PAGE } })).status()).toBe(200);

  await page.goto('/projects/e2e-motion/editor');
  const form = page.locator('app-scene-form');
  await expect(form.getByTestId('picture-mode-motion')).toBeVisible();
  await expect(form.getByTestId('motion-graphic')).toHaveValue('tres ideas sobre azul');
  // the stored page plays in a sandboxed frame
  const frameEl = form.getByTestId('motion-frame');
  await expect(frameEl).toBeVisible();
  await expect(frameEl).toHaveAttribute('sandbox', 'allow-scripts');
  const box = page.frameLocator('[data-testid=motion-frame]').locator('#b');
  await expect(box).toBeVisible();
  const left = () => box.evaluate((el) => el.getBoundingClientRect().left);
  expect(await left()).toBeLessThan(5);
  // the slider moves the page's clock, not the real one
  await form.getByTestId('motion-time').focus();
  await page.keyboard.press('End');
  await expect.poll(left).toBeGreaterThan(250);
  await page.keyboard.press('Home');
  await expect.poll(left).toBeLessThan(5);

  // an overlay on the other scene
  await page.locator('app-scene-reel').getByText('pic').first().click();
  await expect(form.getByTestId('overlay-add')).toBeVisible();
  await form.getByTestId('overlay-add').click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled(); // the text is required
  await form.getByTestId('overlay-text').fill('Capítulo 1');
  await form.getByTestId('overlay-text').blur();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  // the save is in flight while the button is disabled: wait for the file
  await expect
    .poll(async () => (await (await request.get('/api/projects/e2e-motion/config')).json()).yaml)
    .toContain('Capítulo 1');
  const saved = await (await request.get('/api/projects/e2e-motion/config')).json();
  expect(saved.yaml).toContain('motion_graphic: tres ideas sobre azul');

  expect((await request.delete('/api/projects/e2e-motion')).status()).toBe(204);
});
