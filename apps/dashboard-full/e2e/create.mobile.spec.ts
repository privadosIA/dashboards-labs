import { Page, expect, test } from '@playwright/test';

import { choose } from './helpers';

// The Create page on a phone (openspec changes add-mobile-create-page and add-mobile-e2e-audit). The
// e2e server has no Ollama, so unless a test answers the assistant itself the card is filled with the
// user's words and the user picks the kind. Pictures come from the stub `sd` and the voice from the
// stub `whisper-cli` (a fixed sentence), so an image or a song is the cheap result.
const WIDTHS = [360, 390, 844];

// The machine that runs the suite may have an Ollama of its own: the tests that need the card filled
// with the words of the user say the assistant is not available (the one that plans answers for itself).
test.beforeEach(async ({ page }) => {
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: false, reason: 'unreachable', provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
});
const TOUCH_MIN = 44;

/** Where the page overflows sideways, and which controls are shorter than a thumb. */
async function measure(page: Page): Promise<{ over: string[]; small: string[] }> {
  return page.evaluate((min) => {
    const vw = window.innerWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const describe = (el: Element) =>
      el.tagName.toLowerCase() + (el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : '') + ((el.textContent ?? '').trim().slice(0, 20) ? ` "${(el.textContent ?? '').trim().slice(0, 20)}"` : '');
    const content = document.querySelector('mat-sidenav-content');
    const sideways = document.documentElement.scrollWidth > vw + 1 || (content ? content.scrollWidth > content.clientWidth + 1 : false);
    const over = sideways
      ? [...document.querySelectorAll('main *')].filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1).slice(0, 3).map(describe)
      : [];
    // The text of a field is typed in a textarea the field's own area wraps, and the toggle inside a
    // button group is measured through its button: the controls a thumb taps are the buttons and links.
    // (the switch of a slide toggle is 32 px inside a toggle that is a thumb tall: the toggle is measured)
    const small = [...document.querySelectorAll('main button:not(.mdc-switch), main a[href], main [role=button], main mat-slide-toggle, .composer button, .composer a[href]')]
      .filter((el) => visible(el) && el.getBoundingClientRect().height < min)
      .map((el) => `${describe(el)} ${Math.round(el.getBoundingClientRect().height)}px`);
    return { over, small };
  }, TOUCH_MIN);
}

test('a request typed on a phone becomes an image and shows its result', async ({ page }) => {
  test.setTimeout(120_000);
  // A phone opens Create at the root; a screen of 600 px or more (the landscape project) opens Projects.
  const phone = (page.viewportSize()?.width ?? 0) < 600;
  await page.goto('/');
  await expect(page).toHaveURL(phone ? /\/create$/ : /\/projects$/);
  if (!phone) await page.goto('/create');
  await page.getByTestId('pick-auto').click();
  await page.getByTestId('create-text').fill('un gato en una azotea al atardecer');
  await page.getByTestId('create-send').tap();

  await expect(page.getByTestId('create-review')).toBeVisible();
  await choose(page, 'create-kinds', 'kind-image');
  await page.getByTestId('create-confirm').tap();

  await expect(page.getByTestId('create-result').last()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('create-result').last().locator('img.media')).toBeVisible();
  await expect(page.getByTestId('create-download').last()).toBeVisible();
});

test('a song asked for on a phone plays in the page', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/create');
  await page.getByTestId('pick-auto').click();
  await page.getByTestId('create-text').fill('una canción triste de piano');
  await page.getByTestId('create-send').tap();
  await expect(page.getByTestId('create-review')).toBeVisible();
  await choose(page, 'create-kinds', 'kind-music');
  await expect(page.getByTestId('create-instrumental')).toBeVisible();
  await page.getByTestId('create-confirm').tap();
  await expect(page.getByTestId('create-result').last()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('create-result').last().locator('audio')).toBeVisible();
});

/** A machine with a 12 GB card and the engines installed, so the card has something to choose from. */
async function withEngines(page: Page) {
  const file = (name: string, role: string) => ({ name, role, url: '' });
  const base = { description: '', size_bytes: 1, installed: true };
  const entries = [
    { ...base, id: 'sd15', kind: 'model', name: 'SD 1.5', styles: ['general'], style_rank: 2, vram_mb: 4096, timing: { seconds: 4, resolution: '512x512', steps: 20, measured: false }, files: [file('sd15.safetensors', 'model')] },
    {
      ...base, id: 'ltx', kind: 'video', name: 'LTX 2.3', vram_mb: 11520, min_ram_gb: 24, preset: { steps: 8, cfg_scale: 1, resolution: '768x416' },
      timing: { seconds: 116, resolution: '768x416', steps: 8, frames: 49, measured: true },
      files: [file('ltx.gguf', 'model'), file('gemma.gguf', 'text_encoder'), file('lv.safetensors', 'vae'), file('la.safetensors', 'audio_vae'), file('conn.safetensors', 'connectors')],
    },
    {
      ...base, id: 'wan-med', kind: 'video', name: 'Wan 5B', quality: 'medium', vram_mb: 8192, preset: { steps: 20, cfg_scale: 6, resolution: '832x480' },
      timing: { seconds: 85, resolution: '832x480', steps: 20, frames: 33, measured: true }, files: [file('wan.gguf', 'model')],
    },
  ];
  await page.route('**/api/assets/catalog*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), entries } });
  });
  await page.route('**/api/environment', async (route) => {
    const res = await route.fetch();
    const env = await res.json();
    await route.fulfill({
      response: res,
      json: { ...env, gpus: [{ index: 0, name: 'NVIDIA GeForce RTX 4070', free_vram_mb: 12000, total_vram_mb: 12282 }], ram: { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 } },
    });
  });
}

test('a video that names words offers the engines with their times and LTX 2.3 for the speech', async ({ page }) => {
  await withEngines(page);
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
  await page.route('**/api/assist/request', (route) =>
    route.fulfill({
      json: { kind: 'video', kind_source: 'model', title: 'Mujer en la playa', language: 'es', image_prompt: 'A woman on a beach.', motion_prompt: 'She smiles.', speech: 'hola, bienvenidos', instrumental: false, warnings: [] },
    }),
  );
  await page.goto('/create');
  await page.getByTestId('pick-auto').click();
  await page.getByTestId('create-text').fill('una mujer en la playa que dice «hola, bienvenidos»');
  await page.getByTestId('create-send').tap();
  await expect(page.getByTestId('create-review')).toBeVisible();
  await expect(page.getByTestId('create-speech')).toHaveValue('hola, bienvenidos');
  const engines = page.getByTestId('create-engines');
  await expect(engines).toBeVisible();
  await expect(engines).toContainText('LTX 2.3');
  await expect(page.getByTestId('engine-auto')).toContainText('LTX 2.3');
  await expect(page.getByTestId('create-speech-note')).toBeVisible();
  // Forcing another engine takes the reason away: speech never replaces what the user picked.
  await page.getByTestId('engine-wan-medium').locator('label').click();
  await expect(page.getByTestId('create-speech-note')).toHaveCount(0);
  await expect(page.getByTestId('engine-wan-medium').locator('input')).toBeChecked();
  // The list can be tapped with a thumb on every width.
  const { over, small } = await measure(page);
  expect(over).toEqual([]);
  expect(small).toEqual([]);
});

test('removing a finished request deletes its project', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => void d.accept());
  const ids = async () => ((await (await page.request.get('/api/projects')).json()) as { id: string }[]).map((p) => p.id);
  const existing = await ids();
  await page.goto('/create');
  await page.getByTestId('pick-auto').click();
  await page.getByTestId('create-text').fill('un gato para borrar');
  await page.getByTestId('create-send').tap();
  await choose(page, 'create-kinds', 'kind-image');
  await page.getByTestId('create-confirm').tap();
  const mine = page.getByTestId('create-card').filter({ hasText: 'un gato para borrar' });
  await expect(mine.getByTestId('create-result')).toBeVisible({ timeout: 90_000 });
  const made = (await ids()).filter((id) => !existing.includes(id) && id.includes('un-gato-para-borrar'));
  expect(made).toHaveLength(1);
  await mine.getByTestId('create-remove').tap();
  await expect.poll(async () => (await ids()).includes(made[0])).toBe(false);
});

test('dictating on a phone puts the spoken request in the field, and the assistant plans it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/api/assist/request', (route) =>
    route.fulfill({
      json: { kind: 'music', kind_source: 'model', title: 'Canción triste', language: 'es', caption: 'sad solo piano ballad', lyrics: '', instrumental: true, seconds: 120, warnings: [] },
    }),
  );
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
  await page.goto('/create');
  await page.getByTestId('pick-auto').tap();
  await page.getByTestId('create-mic').tap();
  await expect(page.getByTestId('create-recording')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByTestId('create-mic').tap();
  await expect(page.getByTestId('create-text')).toHaveValue('una canción triste de piano', { timeout: 30_000 });
  await page.getByTestId('create-send').tap();
  await expect(page.getByTestId('create-review')).toBeVisible();
  await expect(page.getByTestId('create-manual')).toHaveCount(0); // the assistant answered
  await expect(page.getByTestId('create-title')).toHaveValue('Canción triste');
  await expect(page.getByTestId('create-instrumental')).toBeVisible(); // understood as a song
});

test('a song that plays is listened to and becomes a request for a new song of that kind', async ({ page }) => {
  test.setTimeout(120_000);
  let listened = 0;
  await page.route('**/api/assist/listen*', (route) => {
    listened++;
    route.fulfill({
      json: {
        seconds: 6, language: 'es', no_words: false, bpm: 128, keyscale: 'A minor', style: 'fast techno with a male rap voice',
        theme: 'una desplumadora de pollos', request: 'A new original song in this style: fast techno with a male rap voice, about 128 BPM, in A minor. It is about: una desplumadora de pollos.', warnings: [],
      },
    });
  });
  await page.route('**/api/assist/request', (route) =>
    route.fulfill({ json: { kind: 'music', kind_source: 'user', title: 'Desplumadora', language: 'es', caption: 'fast techno rap', lyrics: '[verse]\nnueva letra', instrumental: false, seconds: 120, warnings: [] } }),
  );
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
  await page.goto('/create');
  await page.getByTestId('pick-auto').tap();
  await page.getByTestId('create-listen').tap();
  await expect(page.getByTestId('create-method')).toBeVisible();
  await page.getByTestId('create-listen').tap();
  await expect(page.getByTestId('create-recording')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByTestId('create-listen').tap();
  await expect(page.getByTestId('create-review')).toBeVisible({ timeout: 30_000 });
  expect(listened).toBe(1);
  await expect(page.getByTestId('create-note')).toContainText('128');
  await expect(page.getByTestId('create-note')).toContainText('desplumadora');
  await expect(page.getByTestId('create-title')).toHaveValue('Desplumadora');
  await expect(page.getByTestId('create-lyrics')).toHaveValue(/nueva letra/);
});

test('a song is written again for the generator the user picks, and what each one cannot do is hidden', async ({ page }) => {
  const asked: { generator?: string; kind?: string }[] = [];
  const plans: Record<string, object> = {
    heartmula: { caption: 'fast techno rap', tags: 'techno,rap,fast', lyrics: '[verse]\nla desplumadora' },
    diffrhythm2: { caption: 'fast techno rap', tags: 'techno,rap', lyrics: '[verse]\nthe plucker' },
  };
  await page.route('**/api/music/engines', (route) =>
    route.fulfill({ json: { engines: { heartmula: { available: true }, diffrhythm2: { available: true } } } }),
  );
  await page.route('**/api/assist/music-tags', (route) =>
    route.fulfill({ json: { categories: [{ id: 'genre', tags: ['techno', 'rap', 'pop'] }, { id: 'tempo', tags: ['fast', 'slow'] }], combos: [{ id: 'hiphop-beat', name: 'Hip-Hop Beat', tags: ['hip-hop', '808', 'bass', 'rap'] }] } }),
  );
  await page.route('**/api/assist/request', (route) => {
    const body = route.request().postDataJSON() as { generator?: string; kind?: string };
    asked.push(body);
    route.fulfill({
      json: { kind: 'music', kind_source: 'user', title: 'Desplumadora', language: 'es', instrumental: false, warnings: [], ...(plans[body.generator ?? 'heartmula'] ?? plans['heartmula']) },
    });
  });
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
  await page.goto('/create');
  await page.getByTestId('pick-auto').click();
  await page.getByTestId('create-text').fill('una canción tecno, rap veloz, sobre la complejidad de la desplumadora de pollos');
  await page.getByTestId('create-send').tap();
  await expect(page.getByTestId('create-review')).toBeVisible();
  await choose(page, 'create-kinds', 'kind-music');
  // The e2e machine has ACE-Step models: Automatic takes it, with a style sentence and no chips.
  await expect(page.getByTestId('create-generators')).toBeVisible();
  await expect(page.getByTestId('generator-help')).toContainText('ACE-Step');
  await expect(page.getByTestId('create-caption')).toBeVisible();
  await page.getByTestId('combo-hiphop-beat').tap();
  await expect(page.getByTestId('create-caption')).toHaveValue('hip-hop, 808, bass, rap');
  await choose(page, 'create-generators', 'generator-heartmula');
  // The combination counted as an edit: changing the generator asks before replacing it.
  await expect(page.getByTestId('suggest-confirm')).toBeVisible();
  await page.getByTestId('suggest-replace').tap();
  await expect(page.getByTestId('tag-techno')).toBeVisible();
  await expect(page.getByTestId('create-caption')).toHaveCount(0);
  await expect(page.getByTestId('create-lyrics')).toHaveValue(/desplumadora/);
  await choose(page, 'create-generators', 'generator-diffrhythm2');
  await expect(page.getByTestId('create-tags-free')).toHaveValue('techno,rap');
  await expect(page.getByTestId('create-lyrics')).toHaveValue(/plucker/);
  await expect(page.getByTestId('create-instrumental')).toHaveCount(0);
  expect(asked.some((b) => b.generator === 'diffrhythm2' && b.kind === 'music')).toBe(true);
  // Editing the text and asking again asks first, and keeping it changes nothing.
  await page.getByTestId('create-lyrics').fill('mi letra');
  await page.getByTestId('suggest-again').tap();
  await expect(page.getByTestId('suggest-confirm')).toBeVisible();
  await page.getByTestId('suggest-keep').tap();
  await expect(page.getByTestId('create-lyrics')).toHaveValue('mi letra');
});

for (const width of WIDTHS) {
  test(`the page does not scroll sideways and every control is a thumb tall, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/create');
    await expect(page.getByTestId('create-composer')).toBeVisible();
    let m = await measure(page);
    expect(m.over, `sideways at ${width} px (empty page)`).toEqual([]);
    expect(m.small, `short controls at ${width} px (empty page)`).toEqual([]);

    await page.getByTestId('pick-auto').click();

    await page.getByTestId('create-text').fill('una canción triste de piano en español para una despedida muy larga');
    await page.getByTestId('create-send').click();
    await expect(page.getByTestId('create-review')).toBeVisible();
    await choose(page, 'create-kinds', 'kind-music');
    m = await measure(page);
    expect(m.over, `sideways at ${width} px (with a card)`).toEqual([]);
    expect(m.small, `short controls at ${width} px (with a card)`).toEqual([]);
  });
}

// Reference pictures for a human to look at after a change of styles (not compared pixel by pixel).
for (const theme of ['dark', 'light']) {
  for (const lang of ['es', 'en']) {
    test(`pictures of the page: ${theme}, ${lang}`, async ({ page }, testInfo) => {
      await page.addInitScript(([t, l]) => {
        try {
          sessionStorage.setItem('mo-theme', t);
          localStorage.setItem('mo.lang', l);
        } catch {
          /* the pictures are then in the defaults */
        }
      }, [theme, lang]);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/create');
        await expect(page.getByTestId('create-composer')).toBeVisible();
        await testInfo.attach(`empty-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await page.getByTestId('pick-auto').click();
        await page.getByTestId('create-text').fill('una canción triste de piano');
        await page.getByTestId('create-send').click();
        await expect(page.getByTestId('create-review')).toBeVisible();
        await testInfo.attach(`card-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        await page.getByTestId('create-dismiss').click();
      }
    });
  }
}

test('choosing the kind first sends it to the planner, and the back arrow keeps what was written', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/models/availability', (route) =>
    route.fulfill({ json: { tasks: { assistant: { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } } } } }),
  );
  await page.route('**/api/assist/request', (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ json: { kind: 'music', kind_source: 'user', title: 'Piano', language: 'es', caption: 'sad piano', lyrics: '', instrumental: true, seconds: 120, warnings: [] } });
  });
  await page.goto('/create');
  await expect(page.getByTestId('create-pick')).toBeVisible();
  await expect(page.getByTestId('create-text')).toHaveCount(0);
  await page.getByTestId('pick-video').tap();
  await page.getByTestId('create-text').fill('una canción triste de piano');
  await page.getByTestId('create-back').tap();
  await expect(page.getByTestId('create-pick')).toBeVisible();
  await page.getByTestId('pick-music').tap();
  await expect(page.getByTestId('create-text')).toHaveValue('una canción triste de piano');
  await page.getByTestId('create-send').tap();
  await expect(page.getByTestId('create-review')).toBeVisible();
  expect(sent).toMatchObject({ kind: 'music' });
  await expect(page.getByTestId('create-pick')).toBeVisible(); // back to the choice after sending
});
