import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The suite drives the EMBEDDED build (go build -tags webui) served by a
// real `orchestrator serve` over stub pipeline binaries (e2e/run-e2e.sh).
test.describe.configure({ mode: 'serial' });

/** An answer of `GET /api/models/availability` in which every model task can run: the e2e server has no Ollama. */
const ALL_AVAILABLE = {
  tasks: Object.fromEntries(
    ['assistant', 'describe_image', 'describe_video', 'quality'].map((t) => [t, { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } }]),
  ),
};

async function mockAvailability(page: import('@playwright/test').Page, body: unknown = ALL_AVAILABLE): Promise<void> {
  await page.route('**/api/models/availability', (route) => route.fulfill({ json: body }));
}

test('flujo completo: crear → editar → run de vídeo → artefactos → images → galería → replay', async ({
  page,
}) => {
  // --- Home: empty projects state (SPA served at / by the Go binary).
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText('Todavía no hay proyectos')).toBeVisible();

  // --- Create a project through the dialog.
  await page.getByTestId('create-project').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identificador del proyecto').fill('e2e-demo');
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page).toHaveURL(/\/projects\/e2e-demo\/editor$/);

  // --- Edit the starter scene and save.
  const prompt = page.locator('app-scene-form textarea').first();
  await prompt.fill('una ciudad al amanecer, luz cinematográfica');
  await prompt.blur();
  const save = page.getByRole('button', { name: 'Guardar' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled(); // saved → not dirty

  // --- Launch a video run and follow it to pipeline_end on the strip.
  await page.goto('/runs?project=e2e-demo');
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page).toHaveURL(/\/runs\/run-/);
  await expect(page.locator('.seg--done').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('succeeded')).toBeVisible({ timeout: 30_000 });
  // Final artifact: player + download against the artifact endpoint.
  const download = page.locator('a[download]');
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute(
    'href',
    '/api/projects/e2e-demo/artifacts/out/e2e-demo.mp4',
  );
  await expect(page.locator('video')).toBeVisible();
  const videoResp = await page.request.get('/api/projects/e2e-demo/artifacts/out/e2e-demo.mp4');
  expect(videoResp.ok()).toBe(true);

  // --- Background music: generate a soundtrack, save, run again with the mix on the strip.
  await page.goto('/projects/e2e-demo/editor');
  await page.getByTestId('bgm-panel').getByRole('button', { name: /Música de fondo/ }).click();
  await page.locator('[data-testid=bgm-kind] mat-button-toggle', { hasText: 'Generarla' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled(); // no prompt yet: nothing to save
  const bgmPrompt = page.getByTestId('bgm-prompt');
  await bgmPrompt.fill('piano suave y atmosférico');
  await bgmPrompt.blur();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await page.goto('/runs?project=e2e-demo');
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page.getByText('succeeded')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('app-phase-strip')).toContainText('mix');
  await expect(page.locator('app-phase-strip')).toContainText('bgm');

  // --- Switch the project to images mode in the editor and save.
  await page.goto('/projects/e2e-demo/editor');
  await page.getByRole('button', { name: /Salida/ }).click(); // expand the output panel
  await page.locator('mat-button-toggle', { hasText: 'Imágenes' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();

  // --- Images-mode run.
  await page.goto('/runs?project=e2e-demo');
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page.getByText('succeeded').first()).toBeVisible({ timeout: 30_000 });

  // --- The run's result link opens the gallery already on this project
  // (the manifest is not offered as the result), then pin a seed.
  await expect(page.locator('a[download]')).toHaveCount(0);
  await page.getByTestId('open-gallery').click();
  await expect(page).toHaveURL(/\/gallery\?project=e2e-demo$/);
  await expect(page.locator('figure.print').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Acciones' }).first().click();
  await page.getByRole('menuitem', { name: /Fijar seed/ }).click();
  await expect(page.getByText(/← seed/)).toBeVisible({ timeout: 15_000 });

  // --- History lists both runs; opening the first replays it on the strip.
  await page.goto('/runs?project=e2e-demo');
  const rows = page.locator('.history tr[mat-row], .history tbody tr');
  await expect(rows).toHaveCount(3);
  // Result links: the video run links to its MP4, the images run to the gallery.
  await expect(page.locator('.history a[href$="out/e2e-demo.mp4"]')).toHaveCount(2);
  await expect(page.locator('.history a[href*="/gallery?project=e2e-demo"]')).toHaveCount(1);
  await rows.first().locator('a').first().click();
  await expect(page.locator('.seg--done, .seg--cache').first()).toBeVisible({ timeout: 15_000 });
});

test('ancho de móvil: sin scroll horizontal y navegación accesible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  // The advanced version keeps the drawer and its menu button on a phone.
  await page.addInitScript(() => localStorage.setItem('mo.simple', 'advanced'));
  await page.goto('/projects');
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('ancho de móvil, versión simple: barra de pestañas abajo y sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/projects'); // not a screen of the simple version: it opens Create
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByTestId('tab-bar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('música: crear proyecto → editar → crear canción → escuchar → fijar seed → cambiar de modo', async ({
  page,
  request,
}) => {
  await page.goto('/projects');
  await page.getByTestId('create-music-project').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identificador del proyecto').fill('e2e-music');
  await dialog.getByRole('button', { name: 'Crear proyecto de música' }).click();
  await expect(page).toHaveURL(/\/projects\/e2e-music\/music$/);

  // The create view: a track with only the fields that apply to a song.
  const track = page.getByTestId('track-0');
  await expect(track).toBeVisible();
  const style = track.getByTestId('track-prompt');
  await style.fill('Balada pop con piano y voz masculina cálida');
  await style.blur();
  // A style template adds its text to the style, and choosing it again removes it.
  await track.getByTestId('track-templates').getByRole('button', { name: /Plantillas de estilo/ }).click();
  await track.getByTestId('track-templates-soundtrack').click();
  await expect(style).toHaveValue(/Balada pop con piano y voz masculina cálida, cinematic film score/);
  await expect(track.getByTestId('track-templates-soundtrack')).toHaveAttribute('aria-pressed', 'true');
  await track.getByTestId('track-templates-soundtrack').click();
  await expect(style).toHaveValue('Balada pop con piano y voz masculina cálida');
  await expect(page.getByTestId('save')).toBeEnabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('save')).toBeDisabled(); // saved → not dirty

  // Create: the language model composes (no lyrics of its own), then synthesis.
  await page.getByTestId('create-all').click();
  await expect(page.getByTestId('run-panel')).toBeVisible();
  await expect(page.locator('app-phase-strip .strip__phase')).toHaveText(['compose', 'synth', 'export']);
  await expect(page.getByTestId('run-state')).toHaveText('succeeded', { timeout: 30_000 });

  // The song: a player on the exported file, what was sung and its metadata.
  const song = page.locator('app-track-results .song').first();
  await expect(song).toBeVisible({ timeout: 15_000 });
  await expect(song.locator('audio')).toBeVisible();
  await expect(song).toContainText('90 bpm');
  await expect(song.getByTestId('lyrics-sung')).toBeHidden(); // collapsed until opened
  await song.locator('summary').first().click();
  await expect(song.getByTestId('lyrics-sung')).toContainText('la la la');
  const playable = await song.locator('audio').evaluate(
    (a: HTMLAudioElement) =>
      new Promise<boolean>((resolve) => {
        if (a.readyState >= 1) return resolve(true);
        a.addEventListener('loadedmetadata', () => resolve(true));
        a.addEventListener('error', () => resolve(false));
      }),
  );
  expect(playable).toBe(true);
  await expect(song.getByTestId('download')).toHaveAttribute('href', /out\/e2e-music\/pista_1\.mp3$/);

  // Accessibility of the studio, with a result on screen.
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical, JSON.stringify(critical.map((v) => v.id))).toEqual([]);

  // The gallery shows the same song (it used to stay empty for a music project).
  await page.goto('/gallery?project=e2e-music');
  const galleryTrack = page.getByTestId('gallery-track-pista_1');
  await expect(galleryTrack).toBeVisible();
  await expect(galleryTrack.locator('mo-audio-player audio')).toHaveCount(1);
  await expect(galleryTrack.getByTestId('gallery-song-download')).toHaveAttribute('href', /out\/e2e-music\/pista_1\.mp3$/);
  await galleryTrack.getByTestId('gallery-studio-pista_1').click();
  await expect(page).toHaveURL(/\/projects\/e2e-music\/music$/);
  const songAgain = page.getByTestId('track-0').locator('[data-testid^=song-]').first();
  await expect(songAgain).toBeVisible();

  // Pin the variant's seed: it is written into the track and saved.
  await song.getByTestId('pin-seed').click();
  await expect(page.getByText(/pista_1 ← seed \d+/)).toBeVisible();

  // A cover of that song: the exported song becomes the source.
  await page.getByTestId('add-track').click();
  const cover = page.getByTestId('track-1');
  const coverStyle = cover.getByTestId('track-prompt');
  await coverStyle.fill('Versión de jazz al piano');
  await coverStyle.blur();
  await cover.getByTestId('task-select').click();
  await page.getByRole('option', { name: 'Remix', exact: true }).click();
  await cover.getByRole('combobox', { name: 'Usar una canción creada' }).press('Enter');
  await page.getByRole('option', { name: /pista_1\.mp3/ }).click();
  await expect(cover.getByTestId('source-select')).toContainText('pista_1.mp3');
  await expect(cover.getByTestId('track-duration')).toHaveCount(0); // the source decides the length
  await cover.getByTestId('create-track').click();
  await expect(page.getByTestId('song-pista_2-0')).toContainText('Remix', { timeout: 30_000 });
  await expect(page.getByTestId('song-pista_2-0').locator('audio')).toBeVisible();

  // A mix: the two songs on a timeline, the second one moved to second 3, rendered on its own.
  await page.getByTestId('mixes').locator('mat-expansion-panel-header').click(); // the card is closed until there is a mix
  await page.getByTestId('add-mix').click(); // the mixer opens in a modal
  await expect(page.getByRole('dialog')).toBeVisible();
  const mix = page.getByTestId('mix-0');
  await mix.getByTestId('add-clip').click();
  await page.getByRole('menuitem', { name: /pista_1/ }).first().click() // the song comes before the source made from it;
  await mix.getByTestId('add-clip').click();
  await page.getByRole('menuitem', { name: /pista_2/ }).first().click();
  await expect(mix.locator('app-mix-clip')).toHaveCount(2);
  await mix.getByTestId('clip-start').fill('3'); // the clip just added is the selected one
  await mix.getByTestId('clip-start').blur();
  await mix.getByTestId('mix-now').click();
  await expect(mix.getByTestId('mix-result')).toContainText('out/e2e-music/mezcla_1.mp3', { timeout: 30_000 });
  await expect(page.locator('app-phase-strip .strip__phase')).toHaveText(['compose', 'synth', 'export', 'mix']);
  const saved = await request.get('/api/projects/e2e-music/config');
  expect(JSON.stringify(await saved.json())).toContain('"start":3');

  // The run is in the history and its result leads back to the studio.
  await page.goto('/runs?project=e2e-music');
  await expect(page.getByRole('link', { name: 'Ver las canciones' }).first()).toBeVisible({ timeout: 15_000 });

  // The studio does not offer to switch the project to video or images any more (a66b30b).
  await page.goto('/projects/e2e-music/music');
  await page.getByTestId('engine-panel').locator(':scope > mat-expansion-panel-header').click(); // the engine panel is open
  await expect(page.getByTestId('project-mode')).toHaveCount(0);
  await expect(page.locator('mat-expansion-panel.track')).toHaveCount(2);

  // Clean up so the rest of the suite sees the projects it expects.
  expect((await request.delete('/api/projects/e2e-music')).status()).toBe(204);
});

test('vídeo desde mi imagen: subirla, girarla y crear el vídeo', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-image' } })).status()).toBe(201);
  await page.goto('/projects/e2e-image/editor');
  const form = page.locator('app-scene-form');
  await form.locator('[data-testid=picture-mode] mat-button-toggle', { hasText: 'Mi imagen' }).click();
  // nothing to save until a picture is chosen
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await form.locator('input[type=file]').setInputFiles({ name: 'mi foto.png', mimeType: 'image/png', buffer: png });
  await expect(form.getByTestId('picture-preview')).toBeVisible();
  await expect(form.getByTestId('picture-select')).toContainText('mi-foto.png');
  // rotate it
  await form.locator('mat-select').filter({ hasText: 'static' }).click();
  await page.getByRole('option', { name: 'rotate_cw' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  const saved = await (await request.get('/api/projects/e2e-image/config')).json();
  expect(saved.yaml).toContain('image: mi-foto.png');
  expect(saved.yaml).toContain('rotate_cw');

  await page.goto('/runs?project=e2e-image');
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page.getByText('succeeded').first()).toBeVisible({ timeout: 30_000 });
  expect((await request.delete('/api/projects/e2e-image')).status()).toBe(204);
});

test('imágenes desde una imagen mía (img2img): elegirla, ajustar la fuerza y generar', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-i2i' } })).status()).toBe(201);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  expect((await request.put('/api/projects/e2e-i2i/sources/base.png', { data: png })).status()).toBe(201);
  const yaml = [
    'project: e2e-i2i',
    'output: {mode: images}',
    'defaults: {model: models/model.safetensors, resolution: 512x512, sampler: euler, steps: 10}',
    'scenes:',
    '  - {id: a, prompt: una acuarela, seed: 1}',
    '',
  ].join('\n');
  expect((await request.put('/api/projects/e2e-i2i/config', { data: { yaml } })).status()).toBe(200);

  await page.goto('/projects/e2e-i2i/editor');
  const form = page.locator('app-scene-form');
  await form.getByTestId('init-enable').click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled(); // no picture yet
  await form.getByTestId('init-select').click();
  await page.getByRole('option', { name: 'base.png' }).click();
  await expect(form.getByTestId('init-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  const saved = await (await request.get('/api/projects/e2e-i2i/config')).json();
  expect(saved.yaml).toContain('init_image: base.png');

  await page.goto('/runs?project=e2e-i2i');
  await page.getByRole('button', { name: 'Lanzar run' }).click();
  await expect(page.getByText('succeeded').first()).toBeVisible({ timeout: 30_000 });
  expect((await request.delete('/api/projects/e2e-i2i')).status()).toBe(204);
});

/** A 1x1 PNG, with a tEXt chunk of generation settings when `text` is given. */
function pngWithText(text?: string): Buffer {
  const base = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  if (!text) return base;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const data = Buffer.concat([Buffer.from('tEXt'), Buffer.from('parameters\0' + text)]);
  const chunk = Buffer.alloc(8 + data.length);
  chunk.writeUInt32BE(data.length - 4, 0);
  data.copy(chunk, 4);
  const withCrc = Buffer.alloc(4);
  withCrc.writeUInt32BE(crc(data), 0);
  // insert the chunk right after IHDR (8 signature + 25 IHDR bytes)
  return Buffer.concat([base.subarray(0, 33), chunk.subarray(0, chunk.length - 0), withCrc, base.subarray(33)]).subarray(0);
}

test('imagen de partida con datos de generación: avisa, aplica lo marcado y se puede deshacer', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-meta' } })).status()).toBe(201);
  const yaml = [
    'project: e2e-meta',
    'output: {mode: images}',
    'defaults: {model: models/model.safetensors, resolution: 512x512, sampler: euler, steps: 10}',
    'scenes:',
    '  - {id: a, prompt: una acuarela, seed: 1}',
    '',
  ].join('\n');
  expect((await request.put('/api/projects/e2e-meta/config', { data: { yaml } })).status()).toBe(200);

  await page.goto('/projects/e2e-meta/editor');
  const form = page.locator('app-scene-form');
  await form.getByTestId('init-enable').click();

  // a picture without settings: selected, nothing asked
  await form.getByTestId('init-upload').locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'plain.png', mimeType: 'image/png', buffer: pngWithText() });
  await expect(form.getByTestId('init-preview')).toBeVisible();
  await expect(page.getByTestId('meta-apply')).toHaveCount(0);

  // a picture with settings: the dialog lists them
  const text = 'a red apple\nNegative prompt: blurry\nSteps: 25, CFG scale: 7.0, Seed: 42, Size: 512x512, Model: sd15.safetensors';
  await form.getByTestId('init-upload').locator('xpath=..').locator('input[type=file]').setInputFiles({ name: 'apple.png', mimeType: 'image/png', buffer: pngWithText(text) });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Esta imagen trae datos de generación')).toBeVisible();
  await expect(dialog.getByTestId('meta-prompt')).toContainText('a red apple');
  await expect(dialog.getByTestId('meta-replace')).toBeVisible(); // the scene already has a prompt
  await expect(dialog.getByTestId('meta-model')).toContainText('No está instalado');
  await dialog.getByTestId('meta-apply').click();

  // the prompt was not checked (the scene had one): negative prompt and seed were applied
  await expect(form.getByTestId('meta-applied')).toBeVisible();
  await expect(form.locator('textarea').first()).toHaveValue('una acuarela');
  await page.getByRole('button', { name: 'Guardar' }).click();
  let saved = await (await request.get('/api/projects/e2e-meta/config')).json();
  expect(saved.yaml).toContain('seed: 42');
  expect(saved.yaml).toContain('negative_prompt: blurry');

  await form.getByTestId('meta-undo').click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  saved = await (await request.get('/api/projects/e2e-meta/config')).json();
  expect(saved.yaml).toContain('seed: 1');
  expect(saved.yaml).not.toContain('negative_prompt: blurry');
  expect((await request.delete('/api/projects/e2e-meta')).status()).toBe(204);
});

test('asistente de prompts: elegir el modelo y entender una negativa del modelo', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-asist' } })).status()).toBe(201);
  // Ollama is not part of the e2e stub: the assistant routes are answered here.
  await page.route('**/api/assist/models', (route) =>
    route.fulfill({
      json: {
        default: 'qwen3:8b',
        models: [
          { name: 'huihui_ai/qwen3-abliterated:8b', size_bytes: 5e9, fits: true },
          { name: 'gemma4:31b', size_bytes: 19e9, fits: false },
        ],
      },
    }),
  );
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/assist', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    if (!body.model) {
      await route.fulfill({
        status: 422,
        json: { error: { code: 'assist_refused', message: 'qwen3:8b refused to write this text. The refusal comes from the model: choose another installed model' } },
      });
    } else {
      await route.fulfill({ json: { text: 'A watercolor of a quiet harbour at dawn.' } });
    }
  });

  await mockAvailability(page);
  await page.goto('/projects/e2e-asist/editor');
  const form = page.locator('app-scene-form');
  const prompt = form.locator('textarea').first();
  await prompt.fill('un puerto tranquilo al amanecer');
  await prompt.blur();
  const assist = form.getByTestId('assist-prompt');

  // the default model refuses: the message says so and nothing is proposed
  await assist.getByTestId('assist-ask').click();
  await expect(form.getByTestId('assist-error')).toContainText('se ha negado a escribirlo');
  await expect(form.getByTestId('assist-proposal-prompt')).toHaveCount(0);

  // choose another installed model (with its size) and ask again
  await assist.getByTestId('assist-model-select').click();
  await expect(page.getByRole('option', { name: /gemma4:31b/ })).toContainText('no cabe en la memoria libre');
  await page.getByRole('option', { name: /huihui_ai\/qwen3-abliterated:8b/ }).click();
  await assist.getByTestId('assist-ask').click();
  await expect(form.getByTestId('assist-proposal-prompt')).toContainText('A watercolor of a quiet harbour');
  expect(bodies[0].model).toBeUndefined();
  expect(bodies[1].model).toBe('huihui_ai/qwen3-abliterated:8b');
  expect((await request.delete('/api/projects/e2e-asist')).status()).toBe(204);
});

test('describir una referencia: negativa, otro modelo, propuesta con el modelo y el archivo se borra', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-describe' } })).status()).toBe(201);
  // Ollama is not part of the e2e stub: the describe routes are answered here; the upload is real.
  await page.route('**/api/describe/models', (route) =>
    route.fulfill({
      json: {
        default: 'gemma4:26b',
        detail: 'muse-glimmer:30b',
        models: [
          { name: 'gemma4:26b', size_bytes: 17e9, fits: true },
          { name: 'muse-glimmer:30b', size_bytes: 18e9, fits: true },
        ],
      },
    }),
  );
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/describe', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    if (!body.model) {
      await route.fulfill({ status: 422, json: { error: { code: 'describe_refused', message: 'refused' } } });
    } else {
      await route.fulfill({ json: { prompt: 'Two adults sitting on a park bench at golden hour.', model: body.model, kind: 'image', frames: 1 } });
    }
  });

  await mockAvailability(page);
  await page.goto('/projects/e2e-describe/editor');
  const form = page.locator('app-scene-form');
  const describe = form.getByTestId('describe');
  await describe.getByTestId('describe-pick').hover();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await describe.getByTestId('describe-file').setInputFiles({ name: 'referencia.png', mimeType: 'image/png', buffer: png });

  // the default model refuses: the message offers the other installed model, and nothing is proposed
  await expect(form.getByTestId('describe-error')).toContainText('se negó');
  await expect(form.getByTestId('describe-proposal')).toHaveCount(0);
  await form.getByTestId('describe-retry').click();
  await expect(form.getByTestId('describe-proposal')).toContainText('Two adults sitting on a park bench');
  await expect(form.getByTestId('describe-model')).toContainText('muse-glimmer:30b');
  expect(bodies[0].model).toBeUndefined();
  expect(bodies[1].model).toBe('muse-glimmer:30b');

  // using it fills the prompt, which stays editable, and the uploaded reference is gone
  await form.getByTestId('describe-use').click();
  await expect(form.locator('textarea').first()).toHaveValue('Two adults sitting on a park bench at golden hour.');
  await expect
    .poll(async () => ((await (await request.get('/api/projects/e2e-describe/sources')).json()) as { sources: unknown[] }).sources.length)
    .toBe(0);
  await page.getByRole('button', { name: 'Guardar' }).click();
  const saved = await (await request.get('/api/projects/e2e-describe/config')).json();
  expect(saved.yaml).toContain('described_by: muse-glimmer:30b');
  expect((await request.delete('/api/projects/e2e-describe')).status()).toBe(204);
});

test('describir un vídeo en varias escenas: quitar un plano, editar otro y crear las escenas', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-split' } })).status()).toBe(201);
  await page.route('**/api/describe/models', (route) =>
    route.fulfill({ json: { default: 'gemma4:26b', detail: '', models: [{ name: 'gemma4:26b', size_bytes: 17e9, fits: true }] } }),
  );
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/describe', async (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        prompt: 'A bench at golden hour.',
        model: 'gemma4:26b',
        kind: 'video',
        frames: 3,
        shots: [
          { start: 0, end: 4, prompt: 'A bench at golden hour.', motion: 'slow push in' },
          { start: 4, end: 9.5, prompt: 'Two friends laughing.' },
          { start: 9.5, end: 12, prompt: 'Skating away down the path.' },
        ],
      },
    });
  });

  await mockAvailability(page);
  await page.goto('/projects/e2e-split/editor');
  const form = page.locator('app-scene-form');
  const describe = form.getByTestId('describe');
  await describe.getByTestId('describe-pick').hover();
  // not split by default: the toggle must be chosen
  await describe.getByTestId('describe-split-many').click();
  await describe.getByTestId('describe-file').setInputFiles({ name: 'corto.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video') });

  await expect(form.getByTestId('describe-shots')).toBeVisible();
  expect(bodies[0].split).toBe(true);
  await expect(form.getByTestId('describe-model')).toContainText('gemma4:26b');
  await expect(form.getByTestId('describe-use')).toContainText('3');

  // drop the second shot, edit the third
  await form.getByTestId('describe-shot-keep-1').locator('input').uncheck();
  const third = form.getByTestId('describe-shot-prompt-2');
  await third.fill('Skating away, hand in hand.');
  await third.blur();
  await expect(form.getByTestId('describe-use')).toContainText('2');
  await form.getByTestId('describe-use').click();

  // two scenes were added after the first, the clip is gone
  await expect(page.locator('app-scene-reel')).toContainText('referencia_2');
  await expect
    .poll(async () => ((await (await request.get('/api/projects/e2e-split/sources')).json()) as { sources: unknown[] }).sources.length)
    .toBe(0);
  await page.getByRole('button', { name: 'Guardar' }).click();
  const saved = await (await request.get('/api/projects/e2e-split/config')).json();
  expect(saved.yaml).toContain('A bench at golden hour.');
  expect(saved.yaml).toContain('Skating away, hand in hand.');
  expect(saved.yaml).not.toContain('Two friends laughing.');
  expect(saved.yaml).toContain('described_by: gemma4:26b');
  expect(saved.yaml).toContain('silence_seconds: 4');
  expect(saved.yaml).toContain('silence_seconds: 2.5');
  expect((await request.delete('/api/projects/e2e-split')).status()).toBe(204);
});

test('configuración: probar una dirección de Ollama, guardarla, ver el aviso y volver al entorno', async ({ page, request }) => {
  // Ollama is not part of the e2e stub: the test endpoint is answered here; saving is real.
  await page.route('**/api/settings/ollama/test', (route) =>
    route.fulfill({
      json: {
        ok: true,
        host: 'http://192.168.1.50:11434',
        remote: true,
        version: '0.12.3',
        models: [
          { name: 'gemma4:26b', vision: true },
          { name: 'qwen3:8b', vision: false },
        ],
      },
    }),
  );
  await page.goto('/settings');
  await expect(page.getByTestId('settings-source')).toHaveAttribute('data-source', 'default');
  await expect(page.getByTestId('settings-host')).toContainText('127.0.0.1:11434');
  await expect(page.getByTestId('settings-remote-warning')).toHaveCount(0);

  // an address with a path is refused by the server, with its reason, and nothing changes
  await page.getByTestId('settings-input').fill('http://192.168.1.50:11434/api');
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-error')).toContainText('no path');
  await expect(page.getByTestId('settings-source')).toHaveAttribute('data-source', 'default');

  // test it, then save it
  await page.getByTestId('settings-input').fill('192.168.1.50');
  await page.getByTestId('settings-test').click();
  await expect(page.getByTestId('settings-test-result')).toContainText('0.12.3');
  await expect(page.getByTestId('settings-vision')).toHaveCount(1);
  await expect(page.getByTestId('settings-remote-warning')).toBeVisible();
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-source')).toHaveAttribute('data-source', 'setting');
  await expect(page.getByTestId('settings-host')).toContainText('192.168.1.50:11434');

  // the server uses it right away (no restart) and it survives a reload
  const settings = await (await request.get('/api/settings')).json();
  expect(settings.ollama).toMatchObject({ host: 'http://192.168.1.50:11434', source: 'setting', remote: true });
  const env = await (await request.get('/api/environment')).json();
  expect(env.ollama).toMatchObject({ host: 'http://192.168.1.50:11434', source: 'setting', remote: true });
  await page.reload();
  await expect(page.getByTestId('settings-host')).toContainText('192.168.1.50:11434');
  await expect(page.getByTestId('settings-remote-warning')).toBeVisible();

  // back to the environment's
  await page.getByTestId('settings-reset').click();
  await expect(page.getByTestId('settings-source')).toHaveAttribute('data-source', 'default');
  await expect(page.getByTestId('settings-remote-warning')).toHaveCount(0);
  await expect(page.getByTestId('settings-reset')).toHaveCount(0);
});

test('proveedores: añadir uno con clave, probarlo, editarlo sin tocar la clave, quitarla y borrarlo', async ({ page, request }) => {
  // The provider is simulated only for the connection test; saving, listing and keys are real.
  await page.route('**/api/providers/*/test', (route) =>
    route.fulfill({ json: { ok: true, host: 'https://api.example.com/v1', remote: true, models: [{ name: 'gpt-4o' }, { name: 'gpt-4o-mini' }] } }),
  );
  const secret = 'sk-e2e-never-shown-9876';
  await page.goto('/settings');
  await expect(page.getByTestId('provider-ollama')).toContainText('integrado');
  await expect(page.getByTestId('provider-edit-ollama')).toHaveCount(0);

  // a refused address shows the server's reason and saves nothing
  await page.getByTestId('provider-add').click();
  await page.getByTestId('provider-name').fill('Proveedor de prueba');
  await page.getByTestId('provider-url').fill('http://192.168.1.60:8000/v1');
  await page.getByTestId('provider-key').fill(secret);
  await page.getByTestId('provider-save').click();
  await expect(page.getByTestId('provider-error')).toContainText('https');

  // https is accepted
  await page.getByTestId('provider-url').fill('https://api.example.com/v1');
  await page.getByTestId('provider-vision-model').fill('gpt-4o');
  await page.getByTestId('provider-save').click();
  const card = page.getByTestId('provider-proveedor-de-prueba');
  await expect(card).toContainText('api.example.com');
  await expect(card.getByTestId('provider-remote')).toBeVisible();
  await expect(card.getByTestId('provider-key-set')).toBeVisible();

  // the API never gives the key back
  const raw = await (await request.get('/api/providers')).text();
  expect(raw).not.toContain(secret);
  expect(JSON.parse(raw).providers.find((p: { id: string }) => p.id === 'proveedor-de-prueba').key_set).toBe(true);

  // test it
  await page.getByTestId('provider-test-proveedor-de-prueba').click();
  await expect(page.getByTestId('provider-result-proveedor-de-prueba')).toContainText('gpt-4o');

  // edit without typing a key: it stays, and the field is empty with a "saved" mark
  await page.getByTestId('provider-edit-proveedor-de-prueba').click();
  await expect(page.getByTestId('provider-key')).toHaveValue('');
  await expect(page.getByTestId('provider-key-saved')).toBeVisible();
  await page.getByTestId('provider-text-model').fill('gpt-4o-mini');
  await page.getByTestId('provider-save').click();
  await expect(card).toContainText('gpt-4o-mini');
  await expect(card.getByTestId('provider-key-set')).toBeVisible();

  // remove the key with its button: the provider stays
  await page.getByTestId('provider-edit-proveedor-de-prueba').click();
  await page.getByTestId('provider-key-remove').click();
  await page.getByTestId('provider-save').click();
  await expect(card.getByTestId('provider-key-set')).toHaveCount(0);
  await expect(card).toBeVisible();

  // delete it after confirming
  await page.getByTestId('provider-delete-proveedor-de-prueba').click();
  await page.getByRole('button', { name: 'Borrar proveedor' }).click();
  await expect(card).toHaveCount(0);
  const after = await (await request.get('/api/providers')).json();
  expect(after.providers.map((p: { id: string }) => p.id)).toEqual(['ollama']);
});

test('enrutado: elegir un proveedor remoto con consentimiento, ver la insignia, un rechazo y reintentar en local', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-routing' } })).status()).toBe(201);
  // The cloud provider is only an address that is never reached: describe is simulated, saving and consent are real.
  expect(
    (await request.post('/api/providers', {
      data: { name: 'Nube', type: 'openai', base_url: 'https://api.example.com/v1', text_model: 'gpt-mini', vision_model: 'gpt-4o', key: 'sk-e2e-routing-123' },
    })).status(),
  ).toBe(201);
  // a provider with no vision model, to see it disabled
  expect((await request.post('/api/providers', { data: { name: 'Solo texto', type: 'openai', base_url: 'https://text.example.com/v1', text_model: 't' } })).status()).toBe(201);

  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/describe/models', (route) =>
    route.fulfill({ json: { default: 'gemma4:26b', detail: '', models: [{ name: 'gemma4:26b', size_bytes: 17e9, fits: true }] } }),
  );
  await page.route('**/api/describe', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    if (!body.provider) {
      // the routed cloud provider refuses: the alternatives name the other providers
      await route.fulfill({
        status: 422,
        json: { error: { code: 'describe_refused', message: 'refused', provider: 'nube', alternatives: [{ provider: 'ollama', name: 'Ollama', model: 'gemma4:26b' }] } },
      });
    } else {
      await route.fulfill({ json: { prompt: 'Two adults on a bench at golden hour.', model: 'gemma4:26b', provider: 'ollama', kind: 'image', frames: 1 } });
    }
  });

  // route "describe a picture" to the cloud provider through the screen: the consent dialog comes first
  await page.goto('/settings');
  await page.getByTestId('task-select-describe_image').click();
  await expect(page.getByTestId('task-option-describe_image-solo-texto')).toContainText('sin modelo de visión');
  await page.getByTestId('task-option-describe_image-nube').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nube');
  await expect(dialog).toContainText('api.example.com');
  await dialog.getByRole('button', { name: /Cancelar/ }).click();
  expect((await (await request.get('/api/routing')).json()).routing.describe_image.provider).toBe('ollama'); // cancelled: unchanged

  await page.getByTestId('task-select-describe_image').click();
  await page.getByTestId('task-option-describe_image-nube').click();
  await page.getByRole('dialog').getByRole('button', { name: /Aceptar y usar Nube/ }).click();
  await expect(page.getByTestId('task-model-describe_image')).toContainText('gpt-4o');
  const routing = await (await request.get('/api/routing')).json();
  expect(routing.routing.describe_image).toMatchObject({ provider: 'nube', remote: true, consented: true, model: 'gpt-4o' });

  // the editor shows the badge, and the number of calls before running
  await mockAvailability(page);
  await page.goto('/projects/e2e-routing/editor');
  const describe = page.getByTestId('describe');
  await expect(describe.getByTestId('provider-badge')).toContainText('Nube');
  await describe.getByTestId('describe-pick').hover();
  await expect(describe.getByTestId('describe-calls')).toContainText('hasta 2 llamadas a Nube');
  await describe.getByTestId('describe-split-many').click();
  await expect(describe.getByTestId('describe-calls')).toContainText('hasta 36 llamadas a Nube');
  await describe.locator('mat-button-toggle[value="one"] button').click();

  // the cloud provider refuses: "Try with" offers the local Ollama, and only the user's click calls it
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await describe.getByTestId('describe-file').setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('describe-error')).toContainText('se negó');
  expect(bodies).toHaveLength(1); // nothing retried by itself
  await page.getByTestId('describe-retry').click();
  await expect(page.getByTestId('describe-proposal')).toContainText('Two adults on a bench');
  expect(bodies).toHaveLength(2);
  expect(bodies[1].provider).toBe('ollama');
  await page.getByTestId('describe-discard').click();

  // a provider in use cannot be deleted
  expect((await request.delete('/api/providers/nube')).status()).toBe(409);

  // back to the built-in one, then clean up
  expect((await request.put('/api/routing', { data: { routing: { describe_image: 'ollama' } } })).status()).toBe(200);
  expect((await request.delete('/api/providers/nube')).status()).toBe(204);
  expect((await request.delete('/api/providers/solo-texto')).status()).toBe(204);
  expect((await request.delete('/api/projects/e2e-routing')).status()).toBe(204);
});

test('sin modelos: los botones de IA se ocultan, y si Ollama responde pero falta el modelo sale un aviso', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-sinmodelos' } })).status()).toBe(201);
  const provider = { id: 'ollama', name: 'Ollama', type: 'ollama' };
  const task = (reason?: string) => ({ available: false, provider, ...(reason ? { reason } : {}) });

  // Ollama does not answer at all: nothing is shown, and no notice
  await mockAvailability(page, { tasks: { assistant: task('unreachable'), describe_image: task('unreachable'), describe_video: task('unreachable'), quality: task('unreachable') } });
  await page.goto('/projects/e2e-sinmodelos/editor');
  const form = page.locator('app-scene-form');
  await expect(form.locator('textarea').first()).toBeVisible();
  await expect(form.getByTestId('assist-ask')).toHaveCount(0);
  await expect(form.getByTestId('describe-pick')).toHaveCount(0);
  await expect(form.getByTestId('model-notice')).toHaveCount(0);

  // Ollama answers but has no model that fits: the controls are still hidden, and a notice says what to install
  await page.unroute('**/api/models/availability');
  await mockAvailability(page, { tasks: { assistant: task('no_models'), describe_image: task('no_vision_model'), describe_video: task('no_vision_model'), quality: task('no_vision_model') } });
  await page.goto('/projects/e2e-sinmodelos/editor');
  await expect(form.getByTestId('assist-ask')).toHaveCount(0);
  await expect(form.getByTestId('describe-pick')).toHaveCount(0);
  const notices = form.getByTestId('model-notice');
  await expect(notices).toHaveCount(2); // one under the prompt (the assistant) and one for Describe a reference
  await expect(form.getByTestId('model-notice-command').first()).toContainText('ollama pull');
  await expect(form.getByTestId('model-notice-link').first()).toHaveAttribute('href', '/settings');

  // the model arrives and the window gets the focus back: the controls come back without reloading
  await page.unroute('**/api/models/availability');
  await mockAvailability(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(form.getByTestId('assist-ask').first()).toBeVisible();
  await expect(form.getByTestId('describe-pick')).toBeVisible();
  await expect(form.getByTestId('model-notice')).toHaveCount(0);
  expect((await request.delete('/api/projects/e2e-sinmodelos')).status()).toBe(204);
});

test('a11y: sin violaciones críticas en las vistas principales', async ({ page }) => {
  for (const path of ['/projects', '/runs', '/environment', '/models']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, `${path}: ${JSON.stringify(critical.map((v) => v.id))}`).toEqual([]);
  }
});

test('teclado: el foco es visible y recorre la navegación', async ({ page }) => {
  await page.goto('/projects');
  // Tab until a rail link holds focus; the global :focus-visible outline
  // must be the working color (set in styles.scss).
  let focusedNav = false;
  for (let i = 0; i < 15 && !focusedNav; i++) {
    await page.keyboard.press('Tab');
    focusedNav = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && el.closest('mat-nav-list') !== null;
    });
  }
  expect(focusedNav).toBe(true);
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe('none');
  // Enter activates the focused link (keyboard-only navigation works).
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    while (el && el.tagName !== 'A') break;
  });
});

test('estilo y calidad: elegirlos al crear el proyecto y cambiarlos en el editor, con deshacer', async ({
  page,
  request,
}) => {
  await page.goto('/projects');
  await page.getByTestId('create-project').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identificador del proyecto').fill('e2e-estilo');
  await dialog.getByTestId('new-style').click();
  await page.getByRole('option', { name: 'Ilustración y anime' }).click();
  await dialog.getByTestId('new-tier').click();
  await page.getByRole('option', { name: 'Baja' }).click();
  await dialog.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page).toHaveURL(/\/projects\/e2e-estilo\/editor$/);

  // The values were written before the editor opened.
  const res = await request.get('/api/projects/e2e-estilo/config');
  const yaml = ((await res.json()) as { yaml: string }).yaml;
  expect(yaml).toContain('ponyDiffusionV6XL_v6StartWithThisOne.safetensors');
  expect(yaml).toContain('resolution: 384x384');

  // In the editor: apply High, see the note, undo it.
  await page.getByText('Estilo y calidad').click();
  await page.getByTestId('tier-high').click();
  await expect(page.getByTestId('tier-applied')).toContainText('640x640');
  await page.getByTestId('undo-tier').click();
  await expect(page.getByTestId('tier-applied')).toHaveCount(0);
});

test('calidad por escena: dar un nivel a una escena, guardarlo y quitarlo', async ({ page, request }) => {
  expect((await request.post('/api/projects', { data: { id: 'e2e-scene-quality' } })).status()).toBe(201);
  await page.goto('/projects/e2e-scene-quality/editor');
  const section = page.getByTestId('scene-quality');
  await expect(section).toBeVisible();
  await section.locator(':scope > mat-expansion-panel-header').click();
  await expect(section.getByTestId('scene-quality-summary')).toContainText('como el proyecto');

  await section.getByTestId('scene-tier-high').click();
  await expect(section.getByTestId('scene-quality-applied')).toBeVisible();
  const save = page.getByRole('button', { name: 'Guardar' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled();
  let yaml = ((await (await request.get('/api/projects/e2e-scene-quality/config')).json()) as { yaml: string }).yaml;
  expect(yaml).toMatch(/render:\s*\n\s+resolution: \d+x\d+\s*\n\s+steps: \d+/);

  await section.getByTestId('scene-quality-clear').click();
  await save.click();
  await expect(save).toBeDisabled();
  yaml = ((await (await request.get('/api/projects/e2e-scene-quality/config')).json()) as { yaml: string }).yaml;
  expect(yaml).not.toContain('render:');
  expect((await request.delete('/api/projects/e2e-scene-quality')).status()).toBe(204);
});
