// The figures of the full dashboard's tutorial (docs/TUTORIAL.md and TUTORIAL.es.md). They are flat (docs/tutorial/<lang>/<file>.png) and keep the
// names the text already uses, so a figure is replaced without touching the text. Each shot: the `file`, the path to open, optional steps and the
// marks to circle, numbered in this order. Taken against the mock with the `tutorial` configuration (see the top of scripts/tutorial-shots.mjs), so
// the buttons that open other sections are not in the picture. Selectors do not depend on the language.
//
// The mock answers with one project, one provider and a small catalog; a shot that needs more (a remote provider, a catalog entry with recommended
// settings, the parts of a project's storage) says so in its `setup`, which answers those requests for that page only, with example data.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A file named like the clip of the figure, for the file chooser (the server is the mock: nothing reads it). */
const CLIP_FILE = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'tutorial-'));
  const file = join(dir, 'calle.mp4');
  writeFileSync(file, 'not a real clip');
  return file;
})();
const PANEL = (n) => `.columns--4 > :nth-child(${n})`;
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** Answers a request of the page with `body` (a function of the request's own answer, to change it, or a value). */
const answer = (page, method, glob, body) =>
  page.route(glob, async (route) => {
    if (route.request().method() !== method) return route.continue();
    if (typeof body !== 'function') return route.fulfill({ json: body });
    const original = await route.fetch();
    return route.fulfill({ response: original, json: body(await original.json()) });
  });

/** The projects list with nothing in it. */
const noProjects = (page) => answer(page, 'GET', '**/api/projects', []);

const OLLAMA = { id: 'ollama', name: 'Ollama', type: 'ollama', base_url: 'http://127.0.0.1:11434', text_model: '', vision_model: '', builtin: true, remote: false, key_set: false };
const OPENROUTER = { id: 'openrouter', name: 'OpenRouter', type: 'openai', base_url: 'https://openrouter.ai/api/v1', text_model: 'google/gemini-2.5-flash', vision_model: 'google/gemini-2.5-flash', builtin: false, remote: true, key_set: true };

/** A built-in Ollama and a provider on another machine (OpenRouter, with its key saved), and a test of each. */
const providers = async (page) => {
  await answer(page, 'GET', '**/api/providers', { providers: [OLLAMA, OPENROUTER] });
  await answer(page, 'POST', '**/api/providers/openrouter/test', { ok: true, host: 'https://openrouter.ai/api/v1', remote: true, models: [{ name: 'google/gemini-2.5-flash' }, { name: 'anthropic/claude-sonnet-4.5' }, { name: 'meta-llama/llama-3.3-70b-instruct' }] });
};

/** The catalog of the Image tab with a model not yet installed that has recommended settings, and the support file it needs already installed. */
const catalog = (page, lang) => {
  const es = lang === 'es';
  const entry = (id, name, description, extra) => ({ id, kind: 'model', name, description, files: [{ name: `${id}.safetensors`, role: 'model', url: 'https://example.invalid/' + id }], size_bytes: 4 * GB, installed: false, ...extra });
  return Promise.all([
    answer(page, 'GET', '**/api/assets/catalog', {
      entries: [
        entry('sd15', 'Stable Diffusion 1.5', es ? 'Modelo base, ligero. Sirve para empezar.' : 'A light base model. A good way to start.', { starter: true, vram_mb: 4096, installed: true, files: [{ name: 'v1-5-pruned-emaonly.safetensors', role: 'model', url: 'https://example.invalid/sd15' }] }),
        entry('krea2', 'Krea 2', es ? 'Fotorrealista y rápido con pocos pasos.' : 'Photorealistic and quick with few steps.', {
          size_bytes: 12 * GB,
          vram_mb: 10240,
          preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
          files: [
            { name: 'krea2-Q8_0.gguf', role: 'model', url: 'https://example.invalid/krea2' },
            { name: 'ae.safetensors', role: 'vae', url: 'https://example.invalid/ae' },
          ],
        }),
      ],
    }),
    answer(page, 'GET', '**/api/assets', (body) => ({ ...body, kinds: body.kinds.map((k) => (k.kind === 'model' ? { ...k, assets: [...k.assets, { name: 'ae.safetensors', size: 320 * MB }] } : k)) })),
  ]);
};

/** The `demo` project with its scenes written in the language of the figure (the mock's own are in Spanish). */
const demoProject = (page, lang, animate, patch) => {
  const es = lang === 'es';
  const scenes = [
    { id: 'intro', prompt: es ? 'Un faro al amanecer, niebla suave, luz cinematográfica' : 'A lighthouse at dawn, soft fog, cinematic light', tts_text: es ? 'Bienvenidos al faro.' : 'Welcome to the lighthouse.', seed: 42, motion: { type: 'zoom_in', intensity: 0.5 } },
    { id: 'mar', prompt: es ? 'Olas rompiendo contra las rocas, atardecer' : 'Waves breaking on the rocks, sunset', tts_text: es ? 'El mar nunca descansa.' : 'The sea never rests.', seed: 7 },
    { id: 'cierre', prompt: es ? 'El faro de noche con la luz girando' : 'The lighthouse at night, its light turning', tts_text: es ? 'Y la luz sigue encendida.' : 'And the light stays on.', seed: 21 },
  ];
  // With animation configured the first scene is animated and carries what its picture should do.
  if (animate) Object.assign(scenes[0], { animate: true, motion_prompt: es ? 'el haz del faro barre despacio el mar' : 'the beam of the lighthouse slowly sweeps the sea' });
  const defaults = { model: 'models/v1-5-pruned-emaonly.safetensors', voice: es ? 'voices/es_ES-davefx-medium.onnx' : 'voices/en_US-lessac-medium.onnx', resolution: '1280x720', sampler: 'euler', steps: 20, fps: 30, ...(animate ? { animate } : {}) };
  const yaml = [
    'project: demo',
    'output:\n  mode: video\n  file: out/demo.mp4',
    `defaults:\n${Object.entries(defaults).map(([k, v]) => (typeof v === 'object' ? `  ${k}:\n${Object.entries(v).map(([k2, v2]) => `    ${k2}: ${v2}`).join('\n')}` : `  ${k}: ${v}`)).join('\n')}`,
    `scenes:\n${scenes.map((sc) => `  - id: ${sc.id}\n    prompt: ${sc.prompt}\n    tts_text: ${sc.tts_text}\n    seed: ${sc.seed}${sc.animate ? `\n    animate: true\n    motion_prompt: ${sc.motion_prompt}` : ''}${sc.motion ? `\n    motion:\n      type: ${sc.motion.type}\n      intensity: ${sc.motion.intensity}` : ''}`).join('\n')}`,
  ].join('\n') + '\n';
  const parsed = { project: 'demo', output: { mode: 'video', file: 'out/demo.mp4' }, defaults, scenes };
  patch?.(parsed);
  return answer(page, 'GET', '**/api/projects/demo/config', { yaml, parsed, valid: true });
};

const WAN = { diffusion_model: 'models/video/wan2.2_ti2v_5B-Q8_0.gguf', t5xxl: 'models/video/umt5-xxl-encoder-Q8_0.gguf', vae: 'models/video/wan2.2_vae.safetensors', resolution: '832x480', frames: 33, fps: 16, steps: 20 };
const MINIMAX = { engine: 'minimax-h3', first_frame: true, diffusion_model: 'models/video/minimax-h3-fl2va-Q4_K_M.gguf', vae: 'models/video/minimax-h3-vae.safetensors', audio_vae: 'models/video/minimax-h3-audio-vae.safetensors', llm: 'models/video/Qwen3-VL-8B-Q4_K_M.gguf', lora: 'models/video/minimax-h3-turbo-8step.safetensors', resolution: '864x480', frames: 56, steps: 8, cfg_scale: 1 };
const VIDEO_FILES = [...Object.values(WAN).filter((v) => typeof v === 'string' && v.startsWith('models/video/')), ...Object.values(MINIMAX).filter((v) => typeof v === 'string' && v.startsWith('models/video/'))].map((f) => f.replace('models/video/', ''));

/** Three installed image models, one for each style, so that the style buttons and the plan of "I'm lazy" have something to choose from. */
const styleModels = (page, lang, animate, patch) => {
  const es = lang === 'es';
  const model = (id, name, file, styles, size, vram) => ({ id, kind: 'model', name, description: '', styles, style_rank: 1, size_bytes: size, vram_mb: vram, installed: true, files: [{ name: file, role: 'model', url: 'https://example.invalid/' + id }] });
  const entries = [
    model('juggernaut', 'Juggernaut XL', 'juggernautXL_v9.safetensors', ['photo'], 6.6 * GB, 8192),
    model('animagine', 'Animagine XL', 'animagineXL_v31.safetensors', ['anime'], 6.9 * GB, 8192),
    { ...model('sd15', 'Stable Diffusion 1.5', 'v1-5-pruned-emaonly.safetensors', ['general'], 4 * GB, 4096), starter: true, preset: { steps: 25, cfg_scale: 7, resolution: '768x432' }, description: es ? 'Modelo base, ligero.' : 'A light base model.' },
  ];
  return Promise.all([
    demoProject(page, lang, animate, patch),
    answer(page, 'GET', '**/api/assets/catalog', { entries }),
    answer(page, 'GET', '**/api/assets', (body) => ({ ...body, kinds: [...body.kinds.filter((k) => k.kind !== 'video'), { kind: 'video', dir: 'models/video', extensions: ['.gguf', '.safetensors'], assets: VIDEO_FILES.map((f) => ({ name: f, size: 3 * GB })) }] })),
    answer(page, 'GET', '**/api/environment', (body) => ({ ...body, models: [...body.models, { name: 'animagineXL_v31.safetensors', size: Math.round(6.9 * GB) }] })),
  ]);
};

/** The Video tab's catalog with the MiniMax H3 bundle (five files) that is not installed yet. */
const minimaxCatalog = (page, lang) => {
  const es = lang === 'es';
  const file = (name, role) => ({ name, role, url: 'https://example.invalid/' + name });
  return answer(page, 'GET', '**/api/assets/catalog', {
    entries: [
      {
        id: 'minimax-h3-ref2va',
        kind: 'video',
        name: 'MiniMax H3 Ref2VA',
        description: es ? 'Vídeo con audio estéreo a partir de la imagen de la escena, que usa como referencia del sujeto.' : "Video with stereo audio from the scene's picture, used as a reference of the subject.",
        size_bytes: 37 * GB,
        vram_mb: 13824,
        installed: false,
        preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
        files: [file('minimax-h3-ref2va-Q4_K_M.gguf', 'model'), file('Qwen3-VL-8B-Q4_K_M.gguf', 'llm'), file('minimax-h3-vae.safetensors', 'vae'), file('minimax-h3-audio-vae.safetensors', 'audio_vae'), file('minimax-h3-turbo-4step.safetensors', 'lora')],
      },
    ],
  });
};

// ---- Runs: a history, the events and the resources of one run, and the statistics (the mock's runs last a second, which says nothing).
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const run = (id, minutesAgo, seconds, extra = {}) => ({
  id,
  project: 'demo',
  state: 'succeeded',
  gpu: '0',
  keep_tmp: true,
  force: false,
  vram_warn_mb: 2048,
  mode: 'video',
  created_at: ago(minutesAgo),
  started_at: ago(minutesAgo),
  finished_at: ago(minutesAgo - seconds / 60),
  artifact: 'out/demo.mp4',
  result_available: true,
  ...extra,
});
const RUNS = [
  run('e80b3f57', 25, 312),
  run('2d5ae611', 140, 95, { state: 'cancelled', artifact: undefined, error: 'cancelled' }),
  run('9c41d7a0', 380, 48, { state: 'failed', artifact: undefined, error: 'ffmpeg exited with status 1' }),
  run('b72e08d4', 1500, 120, { force: true, only: 'intro' }),
  run('f3a91c2e', 3000, 288),
];
const RUN_ID = 'e80b3f57';
const pathIs = (re) => (url) => re.test(new URL(url).pathname);

/** The history, one run in detail with its pipeline events and its resources, and what the next run would re-execute. */
const runsData = async (page) => {
  await page.route(pathIs(/^\/api\/runs$/), (route) => (route.request().method() === 'GET' ? route.fulfill({ json: RUNS }) : route.continue()));
  await page.route(pathIs(/^\/api\/runs\/[^/]+$/), (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const id = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: { run: RUNS.find((r) => r.id === id) ?? RUNS[0], queue_position: 0 } });
  });
  await page.route(pathIs(/^\/api\/runs\/[^/]+\/events$/), (route) => {
    const start = Date.now() - 312_000;
    const at = (seconds) => new Date(start + seconds * 1000).toISOString();
    const events = [{ timestamp: at(0), type: 'pipeline_start' }];
    let t = 1;
    const durations = { tts: [3, 2, 3], render: [38, 41, 36], animate: [62, 58, 66], clip: [6, 5, 6] };
    ['intro', 'mar', 'cierre'].forEach((scene, i) => {
      for (const phase of ['tts', 'render', 'animate', 'clip']) {
        const d = durations[phase][i];
        events.push({ timestamp: at(t), type: 'phase_start', scene_id: scene, phase });
        t += d;
        events.push({ timestamp: at(t), type: 'phase_end', scene_id: scene, phase, duration_ms: d * 1000, artifact: `tmp/${phase}_${scene}.bin` });
      }
    });
    events.push({ timestamp: at(t), type: 'phase_start', phase: 'concat' }, { timestamp: at(t + 9), type: 'phase_end', phase: 'concat', duration_ms: 9000, artifact: 'out/demo.mp4' }, { timestamp: at(312), type: 'pipeline_end', duration_ms: 312000, artifact: 'out/demo.mp4' });
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + `event: run-state\ndata: ${JSON.stringify({ id: RUN_ID, state: 'succeeded', artifact: 'out/demo.mp4' })}\n\nevent: stream-end\ndata: {}\n\n`;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
  await page.route(pathIs(/^\/api\/runs\/[^/]+\/resources$/), (route) => {
    const n = 78;
    const wave = (base, amp, i, phase) => Math.round(base + amp * Math.sin(i / 5 + phase) + (i > 55 ? 700 : 0));
    const gpu = Array.from({ length: n }, (_, i) => ({ t_ms: i * 4000, used_mb: wave(7400, 2600, i, 0), util_pct: Math.max(4, Math.min(99, wave(70, 28, i, 1))) }));
    const ram = Array.from({ length: n }, (_, i) => ({ t_ms: i * 4000, used_mb: wave(11500, 900, i, 2) }));
    return route.fulfill({ json: { interval_ms: 4000, truncated: false, gpus: [{ index: 0, total_mb: 12288, samples: gpu }], ram: { total_mb: 32768, samples: ram }, peaks: { vram: [{ gpu: 0, mb: 10950, pct: 89 }], ram: { mb: 12800, pct: 39 } } } });
  });
  await answer(page, 'GET', '**/api/projects/demo/cache', {
    mode: 'video',
    cold: false,
    scenes: [
      { scene_id: 'intro', phases: { tts: 'hit', render: 'hit', animate: 'hit', clip: 'hit' } },
      { scene_id: 'mar', phases: { tts: 'hit', render: 'run', animate: 'run', clip: 'run' } },
      { scene_id: 'cierre', phases: { tts: 'hit', render: 'hit', animate: 'hit', clip: 'hit' } },
    ],
  });
};

/** Thirty days of runs for the statistics. */
const statsData = (page) => {
  const day = (i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
  const by_day = Array.from({ length: 14 }, (_, i) => ({ date: day(i), succeeded: [2, 3, 1, 4, 2, 0, 1, 3, 5, 2, 3, 4, 2, 3][i], failed: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0][i], other: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0][i], seconds: [610, 1180, 240, 1500, 780, 0, 300, 1020, 1710, 640, 980, 1330, 700, 1010][i] }));
  const point = (id, minutes, seconds, state = 'succeeded') => ({ id, project: 'demo', state, created_at: ago(minutes), seconds, result_available: true, mode: 'video' });
  return answer(page, 'GET', '**/api/stats*', {
    period: { since: ago(30 * 1440), until: ago(0) },
    totals: { runs: 34, by_state: { succeeded: 28, failed: 4, cancelled: 2 }, success_rate: 0.82, total_seconds: 12010, queue_wait_mean_seconds: 4 },
    duration: { runs: 34, mean_seconds: 353, median_seconds: 296, p95_seconds: 880, total_seconds: 12010 },
    by_day,
    phases: [
      { phase: 'animate', executions: 61, reused: 40, total_seconds: 5180, mean_seconds: 85, p95_seconds: 140 },
      { phase: 'render', executions: 92, reused: 120, total_seconds: 3560, mean_seconds: 39, p95_seconds: 66 },
      { phase: 'tts', executions: 150, reused: 80, total_seconds: 410, mean_seconds: 3, p95_seconds: 5 },
      { phase: 'clip', executions: 150, reused: 62, total_seconds: 880, mean_seconds: 6, p95_seconds: 9 },
      { phase: 'concat', executions: 28, reused: 0, total_seconds: 250, mean_seconds: 9, p95_seconds: 14 },
    ],
    cache: { executed: 481, reused: 302, reuse_share: 0.39 },
    by_project: [{ name: 'demo', runs: 34, seconds: 12010, success_rate: 0.82 }],
    by_gpu: [{ name: '0', runs: 34, seconds: 12010, success_rate: 0.82, peak_vram_pct: 93, mean_peak_vram_pct: 81, sampled_runs: 30 }],
    by_mode: [{ name: 'video', runs: 34, seconds: 12010, success_rate: 0.82 }],
    by_client: [{ name: 'embedded', runs: 34, seconds: 12010, success_rate: 0.82 }],
    run_durations: [point('a1', 12 * 1440, 410), point('a2', 9 * 1440, 288), point('a3', 6 * 1440, 880), point('a4', 4 * 1440, 295), point('a5', 2 * 1440, 312), point('a6', 100, 301)],
    slowest: [point('a3', 900, 880), point('a1', 2000, 410), point('a5', 300, 312), point('a6', 100, 301), point('a4', 600, 295)],
  });
};

// ---- Music: the `demo-musica` project with its tracks written in the language of the figure, and what the studio made of the first one.
const MUSIC_ID = 'demo-musica';
const musicTracks = (es) => [
  {
    id: 'tema1',
    prompt: es ? 'Synthpop de los 80, sintetizadores brillantes y caja de ritmos' : '80s synthpop, bright synthesizers and a drum machine',
    lyrics: es ? '[Verse]\nLuces en la ciudad\nCorremos sin parar\n\n[Chorus]\nBailamos hasta el final\nBailamos hasta el final' : "[Verse]\nCity lights are glowing\nWe keep on running through\n\n[Chorus]\nWe dance until the end\nWe dance until the end",
    vocal_language: es ? 'es' : 'en',
    duration_seconds: 90,
    bpm: 118,
    variants: 2,
  },
  {
    id: 'tema2',
    prompt: es ? 'Piano suave y cuerdas, balada tranquila' : 'Soft piano and strings, a quiet ballad',
    lyrics: '',
    instrumental: true,
    duration_seconds: 120,
    bpm: 72,
    variants: 1,
  },
];
const yamlOfMusic = (tracks, music, favorites) =>
  [
    `project: ${MUSIC_ID}`,
    'output:\n  mode: music',
    music ? `defaults:\n  music:\n${Object.entries(music).map(([k, v]) => `    ${k}: ${v}`).join('\n')}` : '',
    `tracks:\n${tracks.map((t) => `  - id: ${t.id}\n    prompt: ${t.prompt}${t.tags ? `\n    tags: ${t.tags}` : ''}${t.instrumental ? '\n    instrumental: true' : `\n    vocal_language: ${t.vocal_language}\n    lyrics: |\n${t.lyrics.split('\n').map((l) => `      ${l}`).join('\n')}`}\n    duration_seconds: ${t.duration_seconds}\n    bpm: ${t.bpm}\n    variants: ${t.variants}`).join('\n')}`,
    favorites?.length ? `favorites:\n${favorites.map((f) => `  - track: ${f.track}\n    seed: ${f.seed}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n') + '\n';

/** The music project, its manifest (two variants of the first track, the first one a favorite) and the songs' files. */
const musicProject = async (page, lang, opts = {}) => {
  const es = lang === 'es';
  const tracks = musicTracks(es);
  // HeartMuLa reads tags, not the long style.
  if (opts.music?.generator === 'heartmula') tracks[0].tags = 'synthpop, 80s, bright synthesizers, drum machine, energetic, female vocal';
  const music = { output_format: 'mp3', engine: 'cli', ...(opts.music ?? {}) };
  const favorites = opts.favorites === false ? [] : [{ track: 'tema1', seed: 4821 }];
  const mixes = opts.mixes ? [{ id: 'mezcla1', normalize: !!opts.normalize, clips: [{ track: 'tema1', variant: 1, start: 0 }, { track: 'tema2', variant: 1, start: 28, fade_in: 1.5, trim_start: 1.3 }] }] : [];
  const parsed = { project: MUSIC_ID, output: { mode: 'music' }, defaults: { music }, tracks, favorites, ...(mixes.length ? { mixes } : {}) };
  // The music models the quality levels choose between, installed (the mock has only a small one).
  const MUSIC_FILES = ['acestep-5Hz-lm-1.7B-Q8_0.gguf', 'acestep-v15-turbo-Q8_0.gguf', 'acestep-v15-xl-turbo-Q8_0.gguf', 'Qwen3-Embedding-0.6B-Q8_0.gguf', 'vae-BF16.gguf'].map((name) => ({ name, size: Math.round(2.4 * GB) }));
  await answer(page, 'GET', '**/api/environment', (body) => ({ ...body, music: MUSIC_FILES }));
  await answer(page, 'GET', '**/api/assets', (body) => ({ ...body, kinds: [...body.kinds.filter((k) => k.kind !== 'music'), { kind: 'music', dir: 'models/music', extensions: ['.gguf'], assets: MUSIC_FILES }] }));
  await answer(page, 'GET', `**/api/projects/${MUSIC_ID}/config`, { yaml: yamlOfMusic(tracks, music, favorites) + (mixes.length ? `mixes:\n  - id: mezcla1\n    clips:\n      - track: tema1\n        start: 0\n      - track: tema2\n        start: 28\n` : ''), parsed, valid: true });
  const entry = (variant, seed, extra = {}) => ({
    track_id: 'tema1',
    variant,
    effective_seed: seed,
    lm_seed: seed,
    use_lm: true,
    caption: tracks[0].prompt,
    lyrics_requested: tracks[0].lyrics,
    lyrics_sung: tracks[0].lyrics,
    bpm: 118,
    duration_seconds: 90,
    audio_seconds: 89.6,
    keyscale: 'A minor',
    timesignature: '4',
    vocal_language: tracks[0].vocal_language,
    lm_model: 'acestep-5Hz-lm-1.7B-Q8_0.gguf',
    synth_model: 'acestep-v15-turbo-Q8_0.gguf',
    params: {},
    file: variant === 0 ? 'tema1.mp3' : `tema1.v${variant + 1}.mp3`,
    sha256: `a${variant}`,
    title: es ? 'Luces en la ciudad' : 'City lights',
    cover: 'tema1.jpg',
    check: { peak_db: -1.2, lufs: -14.3, issues: [] },
    ...extra,
  });
  const tema2 = { ...entry(0, 9310), track_id: 'tema2', caption: tracks[1].prompt, lyrics_requested: '', lyrics_sung: '', instrumental: true, bpm: 72, duration_seconds: 120, audio_seconds: 119.4, file: 'tema2.mp3', title: es ? 'Balada del piano' : 'Piano ballad', sha256: 'b0' };
  const mixEntry = { id: 'mezcla1', file: 'mezcla1.mp3', audio_seconds: 147.4, hash: 'm1', clips: mixes[0]?.clips ?? [], gain: 1, normalize: !!opts.normalize, lufs: opts.normalize ? -14.1 : -13.1 };
  const manifest = { project: MUSIC_ID, mode: 'music', generated_at: ago(40), tracks: [entry(0, 4821), entry(1, 4822), tema2], ...(mixes.length ? { mixes: [mixEntry] } : {}) };
  await page.route(pathIs(new RegExp(`^/api/projects/${MUSIC_ID}/artifacts/out/${MUSIC_ID}/manifest\\.json$`)), (route) => route.fulfill({ json: manifest }));
};

/** The waveform of a song of the studio (the mock has no audio to measure). */
const peaks = (page) =>
  page.route(pathIs(/^\/api\/projects\/[^/]+\/peaks$/), (route) => {
    const n = 400;
    const peaks = Array.from({ length: n }, (_, i) => {
      const section = i < 40 ? 0.35 : i < 150 ? 0.62 : i < 230 ? 0.9 : i < 330 ? 0.7 : 0.45;
      return Math.round(1000 * Math.min(1, section * (0.65 + 0.35 * Math.abs(Math.sin(i * 0.9)) * Math.abs(Math.cos(i * 0.31)) + 0.1 * Math.sin(i / 7)))) / 1000;
    });
    return route.fulfill({ json: { duration: 89.6, buckets: n, peaks, active: { start: 0.6, end: 88.9 }, beat_offset: 0.31 } });
  });

/** The Music tab's catalog: two bundles that share the text encoder and the VAE, which are installed with the lighter bundle. */
const musicModelsCatalog = (page, lang) => {
  const es = lang === 'es';
  const f = (name, role) => ({ name, role, url: 'https://example.invalid/' + name });
  const bundle = (id, name, description, lm, size, vram, installed) => ({
    id,
    kind: 'music',
    name,
    description,
    size_bytes: size,
    vram_mb: vram,
    installed,
    files: [f(lm, 'lm'), f('Qwen3-Embedding-0.6B-Q8_0.gguf', 'text_encoder'), f('acestep-v15-turbo-Q8_0.gguf', 'dit'), f('vae-BF16.gguf', 'vae')],
  });
  const lighter = bundle('acestep-0.6b', 'ACE-Step 1.5 · LM 0.6B', es ? 'Más ligero: el modelo de lenguaje de 0.6B. Medido: 7 s para una canción de 2 minutos.' : 'Lighter: the 0.6B language model. Measured: 7 s for a two-minute song.', 'acestep-5Hz-lm-0.6B-Q8_0.gguf', 6.4 * GB, 8192, true);
  const balanced = bundle('acestep-1.7b', 'ACE-Step 1.5 · LM 1.7B', es ? 'El equilibrado: el modelo de lenguaje de 1.7B. Medido: 9 s para una canción de 2 minutos.' : 'The balanced one: the 1.7B language model. Measured: 9 s for a two-minute song.', 'acestep-5Hz-lm-1.7B-Q8_0.gguf', 7.9 * GB, 10240, false);
  const supportAssets = ['acestep-5Hz-lm-0.6B-Q8_0.gguf', 'Qwen3-Embedding-0.6B-Q8_0.gguf', 'acestep-v15-turbo-Q8_0.gguf', 'vae-BF16.gguf'].map((name) => ({ name, size: Math.round(1.6 * GB) }));
  return Promise.all([
    answer(page, 'GET', '**/api/assets/catalog', { entries: [lighter, balanced] }),
    answer(page, 'GET', '**/api/assets', (body) => ({ ...body, kinds: [...body.kinds.filter((k) => k.kind !== 'music'), { kind: 'music', dir: 'models/music', extensions: ['.gguf'], assets: supportAssets }] })),
  ]);
};

/** Six songs of three music projects, rated, one of them a favorite, and a playlist of three. */
const libraryData = (page, lang) => {
  const es = lang === 'es';
  const lyrics = es ? '[Verse]\nLuces en la ciudad\n\n[Chorus]\nBailamos hasta el final' : '[Verse]\nCity lights are glowing\n\n[Chorus]\nWe dance until the end';
  const song = (project, id, seed, title, caption, extra = {}) => ({ key: `${project}/${id}/${seed}`, project, track_id: id, variant: 0, seed, title, caption, lyrics, instrumental: false, bpm: 118, keyscale: 'A minor', vocal_language: es ? 'es' : 'en', audio_seconds: 90, file: `out/${project}/${id}.mp3`, favorite: false, generator: 'ace-step', generated_at: ago(2000), ...extra });
  const songs = [
    song('demo-musica', 'tema1', 4821, es ? 'Luces en la ciudad' : 'City lights', es ? 'Synthpop de los 80, sintetizadores brillantes' : '80s synthpop, bright synthesizers', { favorite: true }),
    song('demo-musica', 'tema2', 9310, es ? 'Balada del piano' : 'Piano ballad', es ? 'Piano suave y cuerdas' : 'Soft piano and strings', { instrumental: true, lyrics: '', bpm: 72, audio_seconds: 119 }),
    song('para-correr', 'ritmo', 1204, es ? 'Sin frenos' : 'No brakes', es ? 'Electrónica enérgica, 140 bpm' : 'Energetic electronic, 140 bpm', { bpm: 140, keyscale: 'E minor', audio_seconds: 126, generator: 'heartmula' }),
    song('para-correr', 'subida', 1205, es ? 'Cuesta arriba' : 'Uphill', es ? 'Rock alternativo con guitarras' : 'Alternative rock with guitars', { bpm: 128, keyscale: 'D major', audio_seconds: 141 }),
    song('noche', 'lluvia', 3377, es ? 'Lluvia de neón' : 'Neon rain', es ? 'Lo-fi tranquilo, ritmo suave' : 'Calm lo-fi, soft beat', { instrumental: true, lyrics: '', bpm: 84, keyscale: 'C major', audio_seconds: 180 }),
    song('noche', 'faro', 3378, es ? 'El faro' : 'The lighthouse', es ? 'Balada folk, guitarra acústica' : 'Folk ballad, acoustic guitar', { bpm: 76, keyscale: 'G major', audio_seconds: 154 }),
  ];
  const ratings = { [songs[0].key]: 5, [songs[2].key]: 4, [songs[3].key]: 4, [songs[4].key]: 3 };
  const playlists = [{ id: 'running', name: es ? 'Para correr' : 'Running', songs: [songs[2].key, songs[3].key, songs[0].key] }];
  return answer(page, 'GET', '**/api/library', { songs, ratings, playlists });
};

/** A cover picture for the songs of the studio: any file under artifacts/ that ends in .jpg answers with a drawing. */
const covers = (page) =>
  page.route(pathIs(/\.jpg$/), (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset=".55" stop-color="#7a4dff"/><stop offset="1" stop-color="#18d6c8"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="210" r="86" fill="#ffd36b"/><rect y="300" width="512" height="212" fill="#1b1340"/><g fill="#ff5fa2" opacity=".9"><rect x="40" y="320" width="60" height="140"/><rect x="120" y="290" width="50" height="170"/><rect x="190" y="340" width="70" height="120"/><rect x="280" y="300" width="60" height="160"/><rect x="360" y="330" width="80" height="130"/></g></svg>',
    }),
  );

/** The music engines with HeartMuLa ready as a container on this machine, and the build state of its image. */
const heartmulaReady = (page) =>
  answer(page, 'GET', '**/api/music/engines*', { engines: { ace: { available: true, mode: 'local' }, heartmula: { available: true, mode: 'local', version: '0.1.2' }, diffrhythm2: { available: false, reason: 'not_installed', detail: 'container image not built' } } });

/** Two files in the sources folder of `demo` (a picture and a song), and the picture itself. */
const sourcesData = async (page) => {
  await answer(page, 'GET', '**/api/projects/demo/sources', { sources: [{ name: 'faro.png', kind: 'image', size: 1.8 * MB, modified: ago(3000) }, { name: 'ambiente.mp3', kind: 'audio', size: 3.1 * MB, modified: ago(3000) }, { name: 'calle.mp4', kind: 'video', used_by: [], size: 18 * MB, modified: ago(3000) }] });
  // The clip a figure uploads (its name is the one in the list above).
  await answer(page, 'PUT', '**/api/projects/demo/sources/**', { name: 'calle.mp4' });
  await page.route(pathIs(/\/sources\/.*\.png$/), (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f77"/><stop offset=".6" stop-color="#f08a5d"/><stop offset="1" stop-color="#ffd8a8"/></linearGradient></defs><rect width="640" height="360" fill="url(#s)"/><circle cx="470" cy="210" r="46" fill="#fff3c4"/><rect y="250" width="640" height="110" fill="#14203d"/><path d="M300 250 L316 120 L344 120 L360 250 Z" fill="#f4f1ea"/><rect x="312" y="96" width="36" height="26" fill="#ffd36b"/><path d="M308 96 L330 74 L352 96 Z" fill="#7a2d2d"/></svg>',
    }),
  );
};

/** What the server says of a project package: with everything installed, or with a LoRA missing that the catalog has. */
const packageReport = (missing) => (page, lang) => {
  const es = lang === 'es';
  const file = (key, label, name, size, catalog_id, installed) => ({ key, label, path: `models/${name}`, name, size_bytes: size, catalog_id, catalog_name: catalog_id, installed });
  const files = [file('model', es ? 'Modelo' : 'Model', 'juggernautXL_v9.safetensors', 6.6 * GB, 'juggernaut', true), file('voice', es ? 'Voz' : 'Voice', 'en_US-lessac-medium.onnx', 63 * MB, 'lessac', true), ...(missing ? [file('lora', 'LoRA', 'detail-tweaker.safetensors', 150 * MB, 'detail-tweaker', false)] : [])];
  const report = {
    project: 'faro-y-mar',
    suggested_id: 'faro-y-mar',
    id_taken: false,
    mode: 'video',
    scenes: 6,
    tracks: 0,
    sources: 2,
    recipe: {
      format: 1,
      project: 'faro-y-mar',
      mode: 'video',
      exported_at: ago(60),
      settings: { resolution: '1280x720', sampler: 'euler', steps: 8, cfg_scale: 1, fps: 30 },
      presets: [{ for: 'model', catalog_id: 'juggernaut', catalog_name: 'Juggernaut XL', recommended: { steps: 8, cfg_scale: 1, resolution: '1280x720' }, used: { steps: 8, cfg_scale: 1, resolution: '1280x720' }, matches: true }],
      files,
    },
    install: missing ? [{ catalog_id: 'detail-tweaker', name: 'Detail tweaker', size_bytes: 150 * MB, missing: ['detail-tweaker.safetensors'], total_files: 1 }] : null,
    unknown: null,
    problems: null,
    ready: !missing,
  };
  return answer(page, 'POST', '**/api/import/package/preview*', report);
};

/** A clip of three shots described by the vision model. */
const describeClip = (page, lang) => {
  const es = lang === 'es';
  const shots = [
    { start: 0, end: 3.2, prompt: es ? 'Plano general de una calle mojada al amanecer, farolas encendidas, niebla baja' : 'Wide shot of a wet street at dawn, street lamps still on, low fog', motion: es ? 'la cámara avanza despacio por el centro de la calle' : 'the camera slowly moves forward along the middle of the street' },
    { start: 3.2, end: 6.8, prompt: es ? 'Un ciclista cruza el encuadre de izquierda a derecha, reflejos en el asfalto' : 'A cyclist crosses the frame from left to right, reflections on the asphalt', motion: es ? 'el ciclista pedalea, la cámara le sigue' : 'the cyclist pedals, the camera follows' },
    { start: 6.8, end: 10, prompt: es ? 'Primer plano de un charco con la luz del semáforo en rojo' : 'Close-up of a puddle with the red traffic light reflected', motion: es ? 'caen gotas que rompen el reflejo' : 'drops fall and break the reflection' },
  ];
  return answer(page, 'POST', '**/api/describe', { prompt: shots[0].prompt, motion: shots[0].motion, model: 'gemma4:26b', provider: 'ollama', kind: 'video', frames: 24, shots });
};

/** Opens a section of the editor (they start folded). */
const openSection = (testid) => ({ click: `[data-testid="${testid}"] > mat-expansion-panel-header` });

export default {
  dashboard: 'dashboard-full',
  needsUrl: true,
  viewport: { width: 1280, height: 820 },
  storage: (lang) => [['mo.lang', lang]],
  shots: [
    // 3. Before you start
    {
      file: '01-proyectos-vacio',
      path: '/projects',
      setup: noProjects,
      steps: [{ waitFor: 'mo-empty-state' }, { wait: 400 }],
      marks: [{ selector: '[data-testid="create-project"]' }, { selector: '[data-testid="import-project"]' }, { selector: '.rail__nav' }, { selector: 'mo-empty-state' }],
    },
    {
      file: '02-entorno',
      height: 980,
      path: '/environment',
      steps: [{ waitFor: PANEL(1) }, { wait: 500 }],
      marks: [{ selector: PANEL(1) }, { selector: PANEL(6) }, { selector: PANEL(3) }, { selector: '[data-testid="refresh"]' }],
    },
    {
      file: '54-configuracion-ollama',
      path: '/settings',
      setup: (page) => answer(page, 'POST', '**/api/settings/ollama/test', { ok: true, host: 'http://192.0.2.50:11434', remote: true, version: '0.12.3', models: [{ name: 'gemma4:26b', vision: true }, { name: 'qwen3:8b', vision: false }] }),
      steps: [{ waitFor: '[data-testid="settings-input"]' }, { fill: ['[data-testid="settings-input"]', '192.0.2.50:11434'] }, { click: '[data-testid="settings-test"]' }, { waitFor: '[data-testid="settings-remote-warning"]' }, { wait: 400 }],
      marks: [{ selector: '[data-testid="settings-current"]' }, { selector: '[data-testid="settings-input"]' }, { selector: '[data-testid="settings-remote-warning"]' }, { selector: '[data-testid="settings-test-result"]' }],
    },
    {
      file: '55-proveedores',
      height: 1100,
      path: '/settings',
      setup: providers,
      steps: [{ waitFor: '[data-testid="providers-list"]' }, { click: '[data-testid="provider-test-openrouter"]' }, { waitFor: '[data-testid="provider-result-openrouter"]' }, { click: '[data-testid="provider-add"]' }, { waitFor: '[data-testid="provider-key"]' }, { scrollTop: '[data-testid="providers-list"]' }, { wheel: -110 }, { wait: 500 }],
      marks: [{ selector: '[data-testid="provider-openrouter"]' }, { selector: '[data-testid="provider-result-openrouter"]' }, { selector: '[data-testid="provider-key"]' }],
    },
    {
      file: '56-tareas',
      path: '/settings',
      setup: async (page) => {
        await providers(page);
        const task = { provider: 'openrouter', name: 'OpenRouter', remote: true, consented: true, model: 'google/gemini-2.5-flash' };
        await answer(page, 'GET', '**/api/routing', (body) => ({ ...body, routing: { ...body.routing, describe_image: task } }));
      },
      steps: [{ waitFor: '[data-testid="tasks-list"]' }, { scrollTo: '[data-testid="task-cap"]' }, { wheel: 200 }, { wait: 500 }],
      marks: [{ selector: '[data-testid="task-select-describe_image"]' }, { selector: '[data-testid="task-describe_image"] app-provider-badge', at: 'right' }, { selector: '[data-testid="task-cap"]' }],
    },
    // 4. Models
    {
      file: '03-modelos-guia-claves',
      path: '/models',
      steps: [{ click: '[data-testid="guide"] summary' }, { wait: 400 }],
      marks: [{ selector: '[data-testid="guide"]' }, { selector: '[data-testid="tokens"]' }, { selector: '[role="tablist"]' }],
    },
    {
      file: '04-modelos-instalados-catalogo',
      height: 1100,
      path: '/models',
      setup: catalog,
      steps: [{ click: '[data-testid="installed-section"] summary' }, { click: '[data-testid="catalog-section"] summary' }, { scrollTop: '[data-testid="installed-section"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="installed-section"] summary' }, { selector: '[data-testid="catalog-section"] summary' }, { selector: '[data-testid="preset"]', at: 'right' }, { selector: '[data-entry="sd15"] .entry__state', at: 'left' }, { selector: '[data-testid="support"]', at: 'left' }],
    },
    {
      file: '34-modelos-plegables',
      path: '/models',
      setup: catalog,
      steps: [{ click: '[data-testid="installed-section"] summary' }, { scrollTop: '[data-testid="installed-section"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="installed-section"] summary' }, { selector: '[data-testid="catalog-section"] summary' }],
    },
    // 5. Creating a project
    {
      file: '28-proyecto-nuevo-estilo-calidad',
      path: '/projects',
      steps: [{ click: '[data-testid="create-project"]' }, { waitFor: '[data-testid="new-style"]' }, { wait: 400 }],
      marks: [{ selector: '[data-testid="new-style"]' }, { selector: '[data-testid="new-tier"]' }, { selector: '[data-testid="new-auto"]' }],
    },
    {
      file: '06-proyectos-lista',
      path: '/projects',
      steps: [{ waitFor: 'tbody tr' }, { wait: 400 }],
      marks: [{ selector: '[data-testid="create-project"]' }, { selector: 'tbody tr td:first-child' }, { selector: 'tbody tr td:last-child', at: 'left' }],
    },
    {
      file: '43-almacenamiento',
      path: '/projects',
      setup: (page) =>
        answer(page, 'GET', '**/api/projects/*/storage', {
          total_bytes: 14.2 * GB,
          parts: [
            { id: 'cache', bytes: 9.8 * GB, files: 412, cleanable: true },
            { id: 'clips', bytes: 2.1 * GB, files: 38, cleanable: true },
            { id: 'leftovers', bytes: 640 * MB, files: 57, cleanable: true },
            { id: 'final', bytes: 1.2 * GB, files: 3, cleanable: false },
            { id: 'sources', bytes: 410 * MB, files: 6, cleanable: false },
          ],
        }),
      steps: [{ click: '[data-testid^="storage-"]' }, { waitFor: '[data-testid="storage-summary"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="storage-summary"]' }, { selector: '[data-testid="storage-part-cache"]', at: 'left' }, { selector: '[data-testid="storage-part-cache"] button' }, { selector: '[data-testid="storage-part-final"]', at: 'left' }],
    },
    {
      file: '42-selector-idioma',
      path: '/projects',
      steps: [{ waitFor: '[data-testid="lang-switch"]' }],
      marks: [{ selector: '[data-testid="lang-switch"]' }],
    },
    // 6. The editor, section by section
    {
      file: '29-editor-estilo-calidad',
      height: 1000,
      path: '/projects/demo/editor',
      setup: styleModels,
      steps: [openSection('quality-panel'), { waitFor: '[data-testid="tier-medium"]' }, { click: '[data-testid="style-photo"]' }, { click: '[data-testid="tier-medium"]' }, { waitFor: '[data-testid="tier-applied"]' }, { hover: '[data-testid="brand"]' }, { wait: 600 }],
      marks: [{ selector: '.quality-buttons', nth: 1 }, { selector: '.quality-buttons', nth: 0 }, { selector: '[data-testid="tune-panel"]' }, { selector: '[data-testid="tier-applied"]', at: 'left' }],
    },
    {
      file: '30-editor-calidad-escena',
      height: 1000,
      path: '/projects/demo/editor',
      setup: demoProject,
      steps: [{ waitFor: '[data-testid="scene-quality"]' }, { scrollTo: '[data-testid="scene-quality"]' }, { click: '[data-testid="scene-quality"] mat-expansion-panel-header, [data-testid="scene-quality"] summary' }, { click: '[data-testid="scene-tier-high"]' }, { hover: '[data-testid="brand"]' }, { wait: 600 }],
      marks: [],
    },
    {
      file: '49-modo-facil',
      height: 1000,
      path: '/projects/demo/editor',
      setup: styleModels,
      steps: [openSection('quality-panel'), { waitFor: '[data-testid="auto-panel"]' }, { click: '[data-testid="auto-panel"] > mat-expansion-panel-header' }, { waitFor: '[data-testid="auto-lines"]' }, { wait: 500 }],
      marks: [],
    },
    {
      file: '07-editor-ajustes',
      height: 1000,
      path: '/projects/demo/editor',
      setup: styleModels,
      steps: [openSection('defaults-section'), { wait: 700 }],
      marks: [{ selector: '[data-testid="model-mode"]' }, { selector: '[data-testid="defaults-section"] mat-form-field.span-6', nth: 0 }, { selector: '[data-testid="apply-preset"]' }, { selector: '[data-testid="defaults-section"] mat-form-field:has(mat-label:text-matches("^Resolu"))' }],
    },
    {
      file: '09-editor-escenas',
      height: 1000,
      path: '/projects/demo/editor',
      setup: demoProject,
      steps: [{ waitFor: '[data-testid="scene-prompt"]' }, { scrollTop: 'app-scene-reel' }, { wheel: -70 }, { wait: 500 }],
      marks: [{ selector: 'app-scene-reel', at: 'left' }, { selector: '[data-testid="scene-prompt"]', at: 'left' }, { selector: '[data-testid="assist-ask"]' }],
    },
    {
      file: '09b-editor-narracion-animar',
      height: 1000,
      path: '/projects/demo/editor',
      setup: (page, lang) => styleModels(page, lang, WAN),
      steps: [{ waitFor: '[data-testid="scene-tts-text"]' }, { scrollTop: 'mat-button-toggle[value="tts"]' }, { wheel: -60 }, { wait: 500 }],
      marks: [{ selector: 'mat-button-toggle-group:has(mat-button-toggle[value="tts"])', at: 'left' }, { selector: '[data-testid="scene-tts-text"]', at: 'left' }, { selector: '[data-testid="scene-animate-toggle"]', at: 'left' }, { selector: '[data-testid="assist-ask"]', nth: 1 }],
    },
    {
      file: '08-editor-animacion',
      height: 1000,
      path: '/projects/demo/editor',
      setup: (page, lang) => styleModels(page, lang, WAN),
      steps: [openSection('animate-panel'), { waitFor: '[data-testid="animate-engine"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="animate-enable"]' }, { selector: '[data-testid="animate-engine"]' }, { selector: 'mat-form-field:has(+ mat-form-field [data-testid="animate-highnoise"])' }, { selector: '[data-testid="animate-highnoise"]' }],
    },
    {
      file: '44-editor-minimax-h3',
      height: 1000,
      path: '/projects/demo/editor',
      setup: (page, lang) => styleModels(page, lang, MINIMAX),
      steps: [openSection('animate-panel'), { waitFor: '[data-testid="animate-mm-dit"]' }, { wait: 700 }],
      marks: [],
    },
    {
      file: '46-modelos-minimax-h3',
      height: 900,
      path: '/models',
      setup: minimaxCatalog,
      steps: [{ click: '[role="tab"]', nth: 3 }, { click: '[data-testid="catalog-section"] summary' }, { scrollTop: '[data-testid="catalog-section"]' }, { wheel: -40 }, { wait: 600 }],
      marks: [],
    },
    // 7. Launching a run and following it, 8. History, 9. Statistics
    {
      file: '10-runs-lanzar',
      height: 1100,
      path: '/runs',
      setup: runsData,
      steps: [{ waitFor: 'fieldset.group' }, { click: 'fieldset.group mat-select', nth: 0 }, { click: 'mat-option', nth: 0 }, { click: 'fieldset.group mat-select', nth: 3 }, { click: 'mat-option', nth: 0 }, { press: 'Escape' }, { waitFor: '.cache__table' }, { hover: '[data-testid="brand"]' }, { wait: 600 }],
      marks: [{ selector: 'fieldset.group', nth: 0, at: 'left' }, { selector: 'fieldset.group', nth: 1, at: 'left' }, { selector: 'fieldset.group', nth: 2, at: 'left' }, { selector: '.launch__action button', at: 'left' }],
    },
    {
      file: '13-monitor',
      height: 1300,
      path: `/runs/${RUN_ID}`,
      setup: runsData,
      steps: [{ waitFor: '[data-testid="run-state"]' }, { wait: 1500 }],
      marks: [{ selector: 'h1', at: 'right' }, { selector: '[data-testid="run-state"]', at: 'left' }, { selector: 'app-phase-strip' }, { selector: 'video', at: 'right' }, { selector: '[data-testid="run-resources"]', at: 'left' }],
    },
    {
      file: '11-runs-historial',
      height: 1150,
      path: '/runs',
      setup: runsData,
      steps: [{ waitFor: '.df-table__table tbody tr' }, { click: '.df-table__table tbody tr .df-table__check input', nth: 1 }, { scrollTo: '[data-testid="history-tools"]' }, { hover: '[data-testid="brand"]' }, { wait: 600 }],
      marks: [{ selector: '.df-table__table tbody tr .df-table__check', nth: 1 }, { selector: '[data-testid="select-all-finished"]' }, { selector: '[data-testid="delete-selected"]' }, { selector: '[data-testid="delete-all-finished"]' }, { selector: '.df-table__action', nth: 0, at: 'left' }],
    },
    {
      file: '12-runs-borrar-dialogo',
      height: 1150,
      path: '/runs',
      setup: runsData,
      steps: [{ waitFor: '.df-table__table tbody tr' }, { click: '.df-table__table tbody tr .df-table__check input', nth: 1 }, { click: '[data-testid="delete-selected"]' }, { waitFor: 'mat-dialog-container' }, { wait: 500 }],
      marks: [],
    },
    {
      file: '14-estadisticas',
      height: 1500,
      path: '/statistics',
      setup: statsData,
      steps: [{ waitFor: '[data-testid="stats-cards"]' }, { wait: 1200 }],
      marks: [{ selector: '[data-testid="stats-filters"]', at: 'left' }, { selector: '[data-testid="stats-cards"]', at: 'left' }, { selector: '.grid > :first-child', at: 'left' }, { selector: '.grid > :first-child button', nth: 0 }],
    },
    // Mobile and light theme
    {
      file: '15-movil',
      width: 390,
      height: 844,
      path: '/projects',
      // On a phone the simple version is the default (a bar of tabs); the advanced one has the menu behind a hamburger button.
      setup: (page) => page.addInitScript(() => localStorage.setItem('mo.simple', 'advanced')),
      steps: [{ waitFor: 'mat-toolbar.topbar button' }, { wait: 600 }],
      marks: [{ selector: 'mat-toolbar.topbar button' }],
    },
    {
      file: '16-tema-claro',
      path: '/runs',
      setup: async (page) => {
        await page.addInitScript(() => sessionStorage.setItem('mo-theme', 'light'));
        await runsData(page);
      },
      steps: [{ waitFor: '.df-table__table tbody tr' }, { wait: 800 }],
      marks: [{ selector: '[data-testid="theme-toggle"]', at: 'right' }],
    },
    // Music: creating songs
    {
      file: '18-musica-estudio',
      height: 2500,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: 'app-track-results' }, { hover: '[data-testid="brand"]' }, { wait: 1200 }],
      marks: [{ selector: '[data-testid="engine-panel"]' }, { selector: '[data-testid="track-0"] textarea', nth: 0, at: 'left' }, { selector: '[data-testid="track-0"] textarea', nth: 1, at: 'left' }, { selector: '[data-testid="create-track"]' }, { selector: 'app-track-results', at: 'left' }],
    },
    {
      file: '31-musica-estudio-calidad',
      height: 1500,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="engine-panel"] mat-expansion-panel-header' }, { waitFor: '[data-testid="quality"]' }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="quality"]' }, { selector: '[data-testid="default-vocals"]' }, { selector: '[data-testid="only-favorites"]' }, { selector: '[data-testid="pick-track-0"]', at: 'left' }, { selector: '[data-testid="track-favorite"]', at: 'right' }],
    },
    {
      file: '50-musica-modo-facil',
      height: 1000,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="auto-panel"]' }, { click: '[data-testid="auto-panel"] mat-expansion-panel-header' }, { waitFor: '[data-testid="auto-lines"]' }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [],
    },
    {
      file: '32-musica-variantes',
      height: 2500,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: '[data-testid="compare"]' }, { scrollTo: '[data-testid="compare"]' }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="compare"]', at: 'left' }, { selector: '[data-testid="favorite"]', nth: 0, at: 'left' }, { selector: '[data-testid="extend"]', nth: 0 }, { selector: '[data-testid="keep-variant"]', nth: 0 }],
    },
    {
      file: '23-musica-plantillas',
      height: 1500,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { click: '[data-testid="track-0"] app-style-templates mat-expansion-panel-header' }, { wait: 900 }, { scrollTo: '[data-testid="track-0"] app-style-templates' }, { hover: '[data-testid="brand"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="track-0"] textarea', nth: 0, at: 'left' }, { selector: '[data-testid="track-0"] app-style-templates', at: 'left' }],
    },
    {
      file: '24-musica-remix',
      height: 1100,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { click: '[data-testid="task-select"]' }, { click: 'mat-option', nth: 1 }, { waitFor: '[data-testid="cover-strength"]' }, { scrollTop: '[data-testid="task-select"]' }, { wheel: -80 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="task-select"]', at: 'left' }, { selector: '[data-testid="source-select"]', at: 'left' }, { selector: '[data-testid="cover-strength"]', at: 'left' }],
    },
    {
      file: '25-musica-referencia',
      height: 1100,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: '[data-testid="source-select"]' }, { scrollTop: '[data-testid="task-select"]' }, { wheel: -80 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="task-select"]', at: 'left' }, { selector: '[data-testid="source-select"]', at: 'left' }, { selector: '[data-testid="source-upload"]' }, { selector: 'mat-form-field:has(mat-label:text-matches("YouTube"))', at: 'left' }],
    },
    {
      file: '62-musica-onda',
      height: 900,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang);
        await peaks(page);
      },
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { click: '[data-testid="repaint"]', nth: 0 }, { waitFor: '[data-testid="range-picker"]' }, { wait: 700 }, { drag: ['[data-testid="range-picker"] svg.wave', '[data-testid="range-picker"] svg.wave', { x: 380, y: 32 }, { x: 205, y: 32 }] }, { waitFor: '[data-testid="repaint-range"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="range-picker"] svg.wave', at: 'left' }, { selector: '[data-testid="hear-range"]' }, { selector: '[data-testid="repaint-range"]', at: 'left' }],
    },
    {
      file: '19-modelos-musica',
      height: 1000,
      path: '/models',
      setup: musicModelsCatalog,
      steps: [{ click: '[role="tab"]', nth: 4 }, { click: '[data-testid="installed-section"] summary' }, { click: '[data-testid="catalog-section"] summary' }, { scrollTop: '[role="tablist"]' }, { wheel: -20 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[role="tabpanel"] p.note', at: 'left' }, { selector: '[data-entry="acestep-1.7b"]', at: 'left' }, { selector: '[data-testid="support"]', nth: 1, at: 'left' }],
    },
    {
      file: '27-musica-mezclas',
      height: 780,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang, { mixes: true });
        await peaks(page);
      },
      steps: [{ waitFor: '[data-testid="mixes"]' }, { click: '[data-testid="open-mix-0"]' }, { waitFor: '[data-testid="mix-timeline"]' }, { wait: 900 }, { click: 'app-mix-clip', nth: 1 }, { waitFor: '[data-testid="clip-panel"]' }, { hover: '[data-testid="mix-id"]' }, { wait: 600 }],
      marks: [{ selector: '[data-testid="add-clip"]' }, { selector: 'app-mix-clip', nth: 1, at: 'left' }, { selector: 'app-mix-clip', nth: 1, at: 'right' }, { selector: '[data-testid="clip-panel"]', at: 'left' }, { selector: '[data-testid="mix-now"]' }],
    },
    {
      file: '33-musica-mezclador',
      height: 780,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang, { mixes: true, normalize: true });
        await peaks(page);
      },
      steps: [{ waitFor: '[data-testid="mixes"]' }, { click: '[data-testid="open-mix-0"]' }, { waitFor: '[data-testid="mix-timeline"]' }, { hover: '[data-testid="mix-id"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="mix-undo"]' }, { selector: '[data-testid="mix-master"]' }, { selector: '[data-testid="crossfade"]' }, { selector: '[data-testid="snap"]', at: 'right' }, { selector: '[data-testid="mix-result"]', at: 'left' }],
    },
    {
      file: '53-biblioteca',
      height: 1000,
      path: '/library',
      setup: libraryData,
      steps: [{ waitFor: '[data-testid^="song-"]' }, { click: '[data-testid="view-running"]' }, { wait: 700 }, { click: '[data-testid="play-all"]' }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [],
    },
    {
      file: '51-musica-portada',
      height: 900,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang);
        await covers(page);
      },
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: '[data-testid="song-cover"]' }, { scrollTop: '[data-testid="song-cover"]' }, { wheel: -60 }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [],
    },
    {
      file: '52-videoclip',
      height: 1000,
      path: `/projects/${MUSIC_ID}/music`,
      setup: musicProject,
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: '[data-testid="compare"]' }, { click: 'app-track-results button:has(mat-icon:text("movie"))', nth: 0 }, { waitFor: 'mat-dialog-container' }, { wait: 900 }],
      marks: [],
    },
    {
      file: '60-configuracion-heartmula',
      height: 900,
      path: '/settings',
      setup: heartmulaReady,
      steps: [{ waitFor: '[data-testid="heartmula-host"]' }, { scrollTop: '[data-testid="heartmula-current"]' }, { wheel: -150 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="heartmula-current"]', at: 'left' }, { selector: '[data-testid="heartmula-host"]', at: 'left' }, { selector: '[data-testid="heartmula-test"]' }],
    },
    {
      file: '58-musica-heartmula',
      height: 900,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang);
        await heartmulaReady(page);
      },
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="engine-panel"] mat-expansion-panel-header' }, { waitFor: '[data-testid="generator"]' }, { hover: '[data-testid="brand"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="generator"]', at: 'left' }],
    },
    {
      file: '59-musica-etiquetas',
      height: 1300,
      path: `/projects/${MUSIC_ID}/music`,
      setup: async (page, lang) => {
        await musicProject(page, lang, { music: { generator: 'heartmula' } });
        await heartmulaReady(page);
      },
      steps: [{ waitFor: '[data-testid="track-0"]' }, { click: '[data-testid="track-0"] mat-expansion-panel-header' }, { waitFor: '[data-testid="track-tags"]' }, { scrollTop: '[data-testid="track-tags"]' }, { wheel: -120 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="track-tags"]', at: 'left' }, { selector: '[data-testid="track-tags-derive"]' }, { selector: '[data-testid="track-0"] textarea', nth: 1, at: 'left' }],
    },
    // Your own images and background music
    {
      file: '20-editor-imagen-propia',
      height: 1500,
      path: '/projects/demo/editor',
      setup: async (page, lang) => {
        await sourcesData(page);
        await styleModels(page, lang, undefined, (cfg) => {
          cfg.scenes[0].image = 'faro.png';
        });
      },
      steps: [{ waitFor: '[data-testid="scene-picture"]' }, { scrollTop: 'mat-button-toggle[value="own"]' }, { wheel: -140 }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="scene-picture"]', at: 'left' }, { selector: '[data-testid="picture-preview"]', at: 'left' }, { selector: '[data-testid="scene-motion-type"]', at: 'left' }],
    },
    {
      file: '22-imagenes-img2img',
      height: 1100,
      path: '/projects/demo/editor',
      setup: async (page, lang) => {
        await sourcesData(page);
        await styleModels(page, lang, undefined, (cfg) => {
          cfg.scenes[0].init_image = 'faro.png';
          cfg.scenes[0].strength = 0.6;
        });
      },
      steps: [{ waitFor: '[data-testid="scene-init"]' }, { scrollTop: '[data-testid="scene-init"]' }, { wheel: -80 }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="scene-init"]', at: 'left' }, { selector: '[data-testid="scene-init"] img', at: 'left' }, { selector: '[data-testid="scene-init"] mat-slider, [data-testid="scene-init"] input[type="range"]', at: 'below' }],
    },
    {
      file: '21-editor-musica-fondo',
      height: 1000,
      path: '/projects/demo/editor',
      setup: async (page, lang) => {
        await sourcesData(page);
        await styleModels(page, lang, undefined, (cfg) => {
          cfg.bgm = { prompt: lang === 'es' ? 'ambiente suave de sintetizadores, tranquilo' : 'soft ambient synthesizers, calm', volume: 0.25, fade_seconds: 2, ducking: true };
        });
      },
      steps: [{ waitFor: '[data-testid="bgm-panel"]' }, { click: '[data-testid="bgm-panel"] mat-expansion-panel-header' }, { waitFor: '[data-testid="bgm-kind"]' }, { hover: '[data-testid="brand"]' }, { wait: 900 }],
      marks: [{ selector: '[data-testid="bgm-kind"]', at: 'left' }, { selector: '[data-testid="bgm-prompt"]', at: 'left' }, { selector: '[data-testid="bgm-volume"]', at: 'left' }],
    },
    // Exporting a project, and importing it elsewhere
    {
      file: '47-importar-proyecto-completo',
      height: 1100,
      path: '/projects',
      setup: packageReport(false),
      steps: [{ click: '[data-testid="import-package"]' }, { upload: ['[data-testid="package-file"]', 'scripts/tutorial/faro-y-mar.zip'] }, { waitFor: '[data-testid="package-summary"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="package-summary"]', at: 'left' }, { selector: '[data-testid="package-ready"]', at: 'left' }],
    },
    {
      file: '48-importar-proyecto-faltan',
      height: 1100,
      path: '/projects',
      setup: packageReport(true),
      steps: [{ click: '[data-testid="import-package"]' }, { upload: ['[data-testid="package-file"]', 'scripts/tutorial/faro-y-mar.zip'] }, { waitFor: '[data-testid="package-install-all"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="package-install-all"]' }],
    },
    {
      file: '26-importar-canciones',
      height: 850,
      path: '/projects',
      steps: [{ waitFor: '[data-testid="import-project"]' }, { click: '[data-testid="import-project"]' }, { waitFor: '[data-testid="import-mode"]' }, { click: '[data-testid="import-mode"] mat-button-toggle[value="music"] button' }, { waitFor: '[data-testid="music-hint"]' }, { wait: 500 }],
      marks: [{ selector: '[data-testid="import-mode"]', at: 'left' }, { selector: '[data-testid="music-hint"]', at: 'left' }],
    },
    {
      file: '57-describir-referencia',
      height: 1200,
      path: '/projects/demo/editor',
      setup: async (page, lang) => {
        await sourcesData(page);
        await describeClip(page, lang);
        await styleModels(page, lang);
      },
      steps: [{ waitFor: '[data-testid="describe-pick"]' }, { click: '[data-testid="describe-split-many"]' }, { chooseFile: ['[data-testid="describe-pick"]', CLIP_FILE] }, { waitFor: '[data-testid="describe-shots"]' }, { scrollTop: '[data-testid="describe-split"]' }, { wheel: -60 }, { hover: '[data-testid="brand"]' }, { wait: 700 }],
      marks: [{ selector: '[data-testid="describe-split"]', at: 'left' }, { selector: '[data-testid="describe-model"]', at: 'right' }, { selector: '[data-testid="describe-shots"] li', nth: 0, at: 'left' }, { selector: '[data-testid="describe-use"]' }],
    },
  ],
};
