// Realistic answers for the endpoints whose shape is free-form in openapi.yaml (the schema gives no fields to
// generate from) and that the dashboard reads field by field. Sizes are in bytes; nothing here is a real file.
const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const SEED_VIDEO = `project: demo
output:
  mode: video
  file: out/demo.mp4
defaults:
  model: models/v1-5-pruned-emaonly.safetensors
  voice: voices/es_ES-davefx-medium.onnx
  resolution: 1280x720
  sampler: euler
  steps: 20
  fps: 30
scenes:
  - id: intro
    prompt: Un faro al amanecer, niebla suave, luz cinematográfica
    tts_text: Bienvenidos al faro.
    seed: 42
    motion:
      type: zoom_in
      intensity: 0.5
  - id: mar
    prompt: Olas rompiendo contra las rocas, atardecer
    tts_text: El mar nunca descansa.
    seed: 7
`;

export const SEED_MUSIC = `project: demo-musica
output:
  mode: music
tracks:
  - id: tema1
    prompt: Synthpop de los 80, sintetizadores brillantes y caja de ritmos
    lyrics: |
      [Verse]
      Luces en la ciudad
      [Chorus]
      Bailamos hasta el final
    vocal_language: es
    duration_seconds: 90
    bpm: 118
    variants: 2
`;

const asset = (name, size) => ({ name, size: Math.round(size) });

// A server with a models directory: where the models are installed and what is left on that disk.
const modelsDir = () => ({
  dir: '/mnt/backups/models',
  available: true,
  linked: true,
  disk: { free_bytes: 310 * GB, total_bytes: 954 * GB, warn_below_bytes: 20 * GB, low: false },
});

export const environment = () => ({
  content_mode: 'all',
  edition: 'private',
  ollama: { host: 'http://127.0.0.1:11434', source: 'default', remote: false },
  binaries: [
    { name: 'sd', required: true, present: true, path: '/usr/local/bin/sd', version: 'master-949' },
    { name: 'piper', required: true, present: true, path: '/usr/local/bin/piper', version: '1.2.0' },
    { name: 'ffmpeg', required: true, present: true, path: '/usr/bin/ffmpeg', version: '7.1' },
    { name: 'ffprobe', required: true, present: true, path: '/usr/bin/ffprobe', version: '7.1' },
    { name: 'ace-synth', required: false, present: true, path: '/usr/local/bin/ace-synth' },
    { name: 'yt-dlp', required: false, present: false, fix: 'bash scripts/get-ytdlp.sh' },
    { name: 'blender', required: false, present: true, path: '/usr/bin/blender', version: '4.2.3', devices: ['OPTIX NVIDIA GeForce RTX 4070'] },
  ],
  models: [asset('v1-5-pruned-emaonly.safetensors', 4 * GB), asset('juggernautXL_v9.safetensors', 6.6 * GB)],
  retouch: [],
  voices: [asset('es_ES-davefx-medium.onnx', 63 * MB), asset('en_US-lessac-medium.onnx', 63 * MB)],
  loras: [asset('detail-tweaker.safetensors', 150 * MB)],
  music: [asset('acestep-v15-turbo-Q8_0.gguf', 3.5 * GB)],
  music_adapters: [],
  gpus: [
    { index: 0, name: 'NVIDIA GeForce RTX 4070 (simulada)', free_vram_mb: 11000, total_vram_mb: 12288, speed_factor: 1, speed_samples: 4 },
  ],
  tokens: { huggingface: false, civitai: false },
  token_sources: {},
  disk: { free_bytes: 420 * GB, total_bytes: 1000 * GB, warn_below_bytes: 10 * GB, low: false },
  models_dir: modelsDir(),
  ram: { total_bytes: 32 * GB, available_bytes: 21 * GB },
  transcription: [],
  dictation: { available: false, reason: 'simulado: sin Whisper' },
});

export const settings = () => ({
  ollama: { host: 'http://127.0.0.1:11434', source: 'default', remote: false, saved: '' },
  heartmula: { saved: '', token_set: false, remote: false, consented: false },
  diffrhythm2: { saved: '', token_set: false, remote: false, consented: false },
  remote: { max_calls: 20 },
  browser: { saved: '', found: false },
  motion_model: { saved: '', default: 'gemma4:26b' },
  music_motion: { review_drafts: false },
});

export const engines = () => ({
  engines: {
    heartmula: { available: false, reason: 'not_installed', detail: 'simulado' },
    diffrhythm2: { available: false, reason: 'not_installed', detail: 'simulado' },
    ace: { available: true, mode: 'local' },
  },
});

const task = (name) => ({ provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: name });
export const routing = () => ({
  routing: {
    assistant: task('gemma4:26b'),
    describe_image: task('gemma4:26b'),
    describe_video: task('gemma4:26b'),
    quality: task('gemma4:26b'),
    motion_graphics: task('gemma4:26b'),
  },
  max_calls: 20,
});

export const availability = () => {
  const ok = { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } };
  return { tasks: { assistant: ok, describe_image: ok, describe_video: ok, quality: ok, motion_graphics: ok } };
};

export const providers = () => ({
  providers: [
    { id: 'ollama', name: 'Ollama', type: 'ollama', base_url: 'http://127.0.0.1:11434', text_model: '', vision_model: '', builtin: true, remote: false, key_set: false },
  ],
});

export const assets = () => {
  const e = environment();
  const kind = (k, dir, extensions, list) => ({ kind: k, dir, extensions, assets: list });
  return {
    kinds: [
      kind('model', 'models', ['.safetensors', '.gguf'], e.models),
      kind('voice', 'voices', ['.onnx'], e.voices),
      kind('lora', 'models/loras', ['.safetensors'], e.loras),
      kind('music', 'models/music', ['.gguf'], e.music),
    ],
  };
};

export const catalog = () => ({
  entries: [
    { id: 'sd15', kind: 'model', name: 'Stable Diffusion 1.5', description: 'Modelo base, ligero. Entrada de ejemplo del simulado.', starter: true, size_bytes: 4 * GB, vram_mb: 4096, files: [{ name: 'v1-5-pruned-emaonly.safetensors', url: 'https://example.invalid/sd15' }], installed: true },
    { id: 'juggernaut', kind: 'model', name: 'Juggernaut XL', description: 'Fotorrealista. Entrada de ejemplo del simulado.', size_bytes: Math.round(6.6 * GB), vram_mb: 8192, files: [{ name: 'juggernautXL_v9.safetensors', url: 'https://example.invalid/jug' }], installed: true },
    { id: 'lessac', kind: 'voice', name: 'Voz inglesa (lessac)', description: 'Voz de Piper.', size_bytes: 63 * MB, files: [{ name: 'en_US-lessac-medium.onnx', url: 'https://example.invalid/lessac' }], installed: true },
    { id: 'wan5b', kind: 'video', name: 'Wan 2.2 5B', description: 'Animación de vídeo. Aún no instalado en el simulado.', size_bytes: 9 * GB, vram_mb: 10240, files: [{ name: 'wan2.2_5b.gguf', role: 'model', url: 'https://example.invalid/wan' }], installed: false },
  ],
});

export const storage = (projects, clientOf = () => 'embedded') => ({
  projects: projects.map((id) => ({ id, client: clientOf(id), total_bytes: 12 * MB })),
  disk: environment().disk,
  // A server with a media directory: where the projects live and what is left on that disk.
  media: {
    dir: '/mnt/backups/media',
    disk: { free_bytes: 620 * GB, total_bytes: 954 * GB, warn_below_bytes: 20 * GB, low: false },
    projects: projects.map((id) => ({ id, folder: `/mnt/backups/media/${id}` })),
  },
  models: modelsDir(),
});

export const projectStorage = () => ({ parts: [], total_bytes: 0 });

// Songs of the library (the exported songs of the music projects). The first has two versions, one of them instrumental.
const LYRICS = '[Verse]\nWalking through the quiet town\nLights are coming down\n\n[Chorus]\nHold on to the morning\nNever let it go\n\n[Verse]\nSomething in the water\nSomething in the glow';
const song = (project, variant, title, extra = {}) => ({
  key: `${project}/track-1/${variant + 7}`,
  project,
  track_id: 'track-1',
  variant,
  seed: variant + 7,
  title,
  caption: 'dream pop, soft, female vocal',
  lyrics: LYRICS,
  instrumental: false,
  bpm: 96,
  keyscale: 'C major',
  vocal_language: 'en',
  audio_seconds: 48,
  file: `out/${project}/track-1${variant ? `_v${variant}` : ''}.mp3`,
  favorite: false,
  generated_at: '2026-11-04T10:00:00Z',
  ...extra,
});
export const LIBRARY_SONGS = [
  song('demo-musica', 0, 'Quiet Town'),
  song('demo-musica', 1, 'Quiet Town (instrumental)', { instrumental: true, lyrics: '', audio_seconds: 52 }),
  song('morning-light', 0, 'Morning Light', { bpm: 120, audio_seconds: 36 }),
];
export const library = (ok = () => true, clientOf = () => 'embedded') => ({
  ratings: {},
  playlists: [],
  songs: LIBRARY_SONGS.filter((s) => ok(s.project)).map((s) => ({ ...s, client: clientOf(s.project) })),
});

export const stats = (runs) => {
  const done = runs.filter((r) => !['queued', 'running'].includes(r.state));
  const sec = (r) => (r.started_at && r.finished_at ? Math.max(1, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000)) : 0);
  const point = (r) => ({ id: r.id, project: r.project, state: r.state, created_at: r.created_at, seconds: sec(r), result_available: true, mode: r.mode });
  const byState = {};
  for (const r of done) byState[r.state] = (byState[r.state] ?? 0) + 1;
  const total = done.reduce((a, r) => a + sec(r), 0);
  const ok = byState.succeeded ?? 0;
  const projects = [...new Set(done.map((r) => r.project))];
  const now = new Date();
  return {
    period: { since: new Date(now - 30 * 864e5).toISOString(), until: now.toISOString() },
    totals: { runs: done.length, by_state: byState, success_rate: done.length ? ok / done.length : undefined, total_seconds: total },
    duration: { runs: done.length, mean_seconds: done.length ? total / done.length : undefined, total_seconds: total },
    by_day: done.length ? [{ date: now.toISOString().slice(0, 10), succeeded: ok, failed: done.length - ok, other: 0, seconds: total }] : [],
    phases: [],
    cache: { executed: done.length, reused: 0 },
    by_project: projects.map((p) => {
      const rs = done.filter((r) => r.project === p);
      return { name: p, runs: rs.length, seconds: rs.reduce((a, r) => a + sec(r), 0) };
    }),
    by_gpu: [],
    by_mode: [],
    // Who asked: the name a dashboard gave itself, `unknown` (an API request without one) or `embedded` (a project).
    by_client: Object.entries(
      done.reduce((acc, r) => {
        const name = r.client || (/^api-(gen|edit)-/.test(r.project) ? 'unknown' : 'embedded');
        (acc[name] ??= []).push(r);
        return acc;
      }, {}),
    ).map(([name, rs]) => ({ name, runs: rs.length, seconds: rs.reduce((a, r) => a + sec(r), 0) })),
    run_durations: done.map(point),
    slowest: done.map(point).sort((a, b) => b.seconds - a.seconds).slice(0, 5),
  };
};

export const runResources = () => ({
  interval_ms: 1000,
  truncated: false,
  gpus: [{ index: 0, total_mb: 12288, samples: [{ t_ms: 0, used_mb: 1200, util_pct: 5 }, { t_ms: 1000, used_mb: 7400, util_pct: 88 }] }],
  ram: { total_mb: 32768, samples: [{ t_ms: 0, used_mb: 9000 }, { t_ms: 1000, used_mb: 11000 }] },
  peaks: { vram: [{ gpu: 0, mb: 7400, pct: 60 }], ram: { mb: 11000, pct: 34 } },
});

export const monitoring = () => ({ tools: ['grafana', 'prometheus', 'loki', 'redis'].map((id) => ({ id, secret_set: false })) });

export const database = () => {
  const v = { driver: 'sqlite', password_set: false };
  return { saved: v, active: v, restart_required: false, server_name: 'simulado', servers: ['simulado'] };
};

// ---------------------------------------------------------------- generation options
// What `GET /api/generation/options` answers: the eleven ways of making a video (some this simulated machine cannot run, with
// the reason) and the models a picture can be retouched with. The limits here are also the ones the mock refuses by.
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
export const QUALITIES = ['draft', 'normal', 'high'];

const DURATION = { min: 2, max: 30, default: 5 };
const video = (id, name, description, engine, over = {}) => ({
  id,
  name,
  description,
  engine,
  available: true,
  clip_seconds: 4,
  duration: DURATION,
  audio: engine === 'minimax-h3' || engine === 'ltx-2.3',
  default: false,
  ...over,
});
// What each option takes besides the prompt (`inputs`): limits measured by the server for a 12 GB card. The mock lets
// `h3-ref` and `h3-ref-draft` run so the References tab can be tried without the card the real H3 needs.
const FRAMES = { start_image: true, end_image: true };
const START = { start_image: true, end_image: false };
const REFERENCES = { start_image: false, end_image: false, reference_images: { min: 1, max: 2 }, reference_videos: { max: 1, max_seconds: 2 }, reference_audios: { max: 1, max_seconds: 3 } };
const NO_H3 = 'MiniMax H3 does not fit this machine: it needs 14 GB of VRAM and 24 GB of RAM';
const NO_AD = 'the AnimateDiff motion module is not installed';

export const VIDEO_OPTIONS = [
  video('h3-full', 'MiniMax H3', 'The best quality: a picture or a prompt becomes a shot with its own sound. Slow.', 'minimax-h3', { inputs: FRAMES, available: false, reason: NO_H3, clip_seconds: 4.7 }),
  video('wan-high', 'Wan (high)', 'Wan 2.2 A14B: the best of the Wan family, much slower than the others.', 'wan', { inputs: START, estimate: 780, default: true }),
  video('ltx', 'LTX 2.3', 'A fast, good all-rounder that fits a 12 GB card; it can write the sound of the shot, speech included.', 'ltx-2.3', { inputs: FRAMES, estimate: 190, clip_seconds: 2 }),
  video('h3-draft', 'MiniMax H3 (draft)', 'MiniMax H3 with a turbo LoRA: much faster, a little less faithful. Good for trying a prompt.', 'minimax-h3', { inputs: FRAMES, available: false, reason: NO_H3, clip_seconds: 4.7 }),
  video('wan-medium', 'Wan (medium)', 'Wan 2.2 5B at 8-bit: a balance between quality and time.', 'wan', { inputs: START, estimate: 140 }),
  video('wan-low', 'Wan (low)', 'Wan 2.2 5B at 4-bit: the lightest Wan, for small cards.', 'wan', { inputs: START, estimate: 110 }),
  video('ad-high', 'AnimateDiff (high)', 'SD 1.5 with a motion module: the lightest way to move a picture, for very small cards; the result is rougher.', 'animatediff', { inputs: START, available: false, reason: NO_AD, clip_seconds: 6 }),
  video('ad-medium', 'AnimateDiff (medium)', 'SD 1.5 with a motion module: the lightest way to move a picture, for very small cards; the result is rougher.', 'animatediff', { inputs: START, available: false, reason: NO_AD, clip_seconds: 4 }),
  video('ad-low', 'AnimateDiff (low)', 'SD 1.5 with a motion module: the lightest way to move a picture, for very small cards; the result is rougher.', 'animatediff', { inputs: START, available: false, reason: NO_AD, clip_seconds: 2 }),
  video('h3-ref', 'MiniMax H3 (references)', 'MiniMax H3 guided by reference images, videos and audios instead of a start picture. Name the images <Picture 1>, <Picture 2>… in the prompt.', 'minimax-h3', { inputs: REFERENCES, clip_seconds: 4.7 }),
  video('h3-ref-draft', 'MiniMax H3 references (draft)', 'The references option with a turbo LoRA: much faster, a little less faithful.', 'minimax-h3', { inputs: REFERENCES, clip_seconds: 4.7 }),
];

const model = (id, name, description, kind, over = {}) => ({
  id,
  name,
  description,
  kind,
  available: true,
  strength: kind === 'img2img',
  negative_prompt: kind === 'img2img',
  max_variants: kind === 'img2img' ? 8 : 1,
  default: false,
  ...over,
});

export const IMAGE_MODELS = [
  model('image-edit-flux-kontext-q4', 'FLUX.1 Kontext', 'Changes the picture by its prompt, fast.', 'instruction', { default: true }),
  model('image-edit-qwen-image-edit-q4', 'Qwen-Image-Edit', 'Changes the picture by its prompt, precise and slower.', 'instruction', { available: false, reason: 'Qwen-Image-Edit is not installed' }),
  model('sdxl-juggernaut-xl-v9', 'Juggernaut XL v9', 'Starts from the picture with a strength: realistic photos.', 'img2img'),
  model('sd-1-5', 'Stable Diffusion 1.5', 'Starts from the picture with a strength: light and general.', 'img2img'),
];

export const generationOptions = () => ({ video: VIDEO_OPTIONS, image_models: IMAGE_MODELS, aspect_ratios: ASPECT_RATIOS, qualities: QUALITIES });

// The vocabulary of `GET /api/assist/music-tags` (the song form's tag chips and combinations), the same as the one the studio kit keeps for its
// in-memory adapter: without it the chips are empty and the form cannot be seen the way it looks against a real server.
export const musicTags = () => ({
  categories: [
    { id: 'genre', tags: ['pop', 'rock', 'jazz', 'electronic', 'classical', 'hip-hop', 'r&b', 'country', 'reggae', 'blues', 'folk', 'metal', 'punk', 'disco', 'funk', 'soul', 'indie', 'edm', 'house', 'techno', 'ambient', 'lo-fi', 'k-pop', 'j-pop', 'c-pop', 'latin', 'reggaeton', 'bossa nova'] },
    { id: 'mood', tags: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'melancholic', 'uplifting', 'dark', 'dreamy', 'aggressive', 'peaceful', 'nostalgic', 'hopeful', 'mysterious', 'playful', 'epic', 'chill', 'intense'] },
    { id: 'instrument', tags: ['piano', 'guitar', 'acoustic guitar', 'electric guitar', 'bass', 'drums', 'violin', 'cello', 'saxophone', 'trumpet', 'flute', 'synth', 'strings', 'orchestra', 'choir', '808', 'harp', 'organ', 'ukulele', 'harmonica'] },
    { id: 'tempo', tags: ['slow', 'moderate', 'fast', 'very fast', 'ballad', 'uptempo', 'mid-tempo', 'groovy'] },
    { id: 'vocal', tags: ['male vocal', 'female vocal', 'duet', 'rap', 'whisper', 'powerful vocals', 'falsetto', 'soprano', 'baritone', 'tenor', 'alto', 'harmonies', 'a cappella'] },
    { id: 'era', tags: ['80s', '90s', '2000s', 'modern', 'retro', 'vintage', '70s', '60s', 'futuristic'] },
    { id: 'production', tags: ['cinematic', 'hi-fi', 'acoustic', 'live', 'studio', 'raw', 'polished', 'minimalist', 'layered', 'atmospheric'] },
  ],
  combos: [
    { id: 'chill-lofi', name: 'Chill Lo-fi', tags: ['lo-fi', 'chill', 'piano', 'slow'] },
    { id: 'epic-cinematic', name: 'Epic Cinematic', tags: ['cinematic', 'epic', 'orchestra', 'strings'] },
    { id: 'upbeat-pop', name: 'Upbeat Pop', tags: ['pop', 'happy', 'energetic', 'female vocal'] },
    { id: 'dark-electronic', name: 'Dark Electronic', tags: ['electronic', 'dark', 'synth', 'modern'] },
    { id: 'acoustic-ballad', name: 'Acoustic Ballad', tags: ['acoustic', 'ballad', 'guitar', 'romantic'] },
    { id: 'retro-synthwave', name: 'Retro Synthwave', tags: ['80s', 'synth', 'electronic', 'retro'] },
    { id: 'jazz-cafe', name: 'Jazz Cafe', tags: ['jazz', 'piano', 'saxophone', 'calm'] },
    { id: 'hiphop-beat', name: 'Hip-Hop Beat', tags: ['hip-hop', '808', 'bass', 'rap'] },
    { id: 'rock-anthem', name: 'Rock Anthem', tags: ['rock', 'electric guitar', 'drums', 'powerful vocals'] },
    { id: 'ambient-meditation', name: 'Ambient Meditation', tags: ['ambient', 'peaceful', 'atmospheric', 'slow'] },
  ],
});

/**
 * What the server's dataset import makes of a file, in the two modes the studios use. The format is the server's: a JSON list of `[id, title, lora_info,
 * full_prompt]` tuples of strings, where `full_prompt` is the description followed by marker lines (`Lyrics:`, `Language:`, `BPM:`, `Duration:` and
 * `Key:` for music; `Dialogue:`, `Motion:`, `Seed:` for video). Answers null for what is not that (the server answers 422).
 */
export const readDataset = (content, mode) => {
  let rows;
  try {
    rows = JSON.parse(content);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || !rows.length || !rows.every((r) => Array.isArray(r) && r.length >= 4 && r.every((c) => typeof c === 'string'))) return null;
  const MARK = /^(Lyrics|Tags|Language|BPM|Duration|Key|Dialogue|Motion|Seed|Negative|Speed|Silence|Variants):\s*(.*)$/;
  const read = rows.map(([id, , , full]) => {
    const lines = full.split('\n');
    const marks = {};
    const text = [];
    for (const l of lines) {
      const m = MARK.exec(l.trim());
      if (m) marks[m[1].toLowerCase()] = m[2].trim();
      else if (l.trim()) text.push(l.trim());
    }
    const description = text.join(' ');
    // what the real server refuses: an entry with no text, and (for a video) a Dialogue line whose text is not between quotes
    const reject = !description ? 'entry yields an empty prompt' : mode === 'video' && marks.dialogue !== undefined && !/"[^"]+"/.test(marks.dialogue) ? 'Dialogue line without quoted text' : null;
    return { id, description, marks, reject };
  });
  const usable = read.filter((r) => !r.reject);
  const quiet = usable.filter((r) => !(mode === 'music' ? r.marks.lyrics : r.marks.dialogue)).length;
  const mapped = (r) => [`prompt ← ${r.description.length} chars`, ...Object.entries(r.marks).map(([k, v]) => `${k} ← ${v.slice(0, 40)}`)];
  const key = mode === 'music' ? 'tracks' : 'scenes';
  const yamlOf = (r) => `  - id: ${JSON.stringify(r.id)}\n    ${mode === 'music' ? 'prompt' : 'prompt'}: ${r.description}${mode === 'music' && r.marks.lyrics ? `\n    lyrics: ${r.marks.lyrics}` : ''}${mode === 'music' && r.marks.tags ? `\n    tags: ${r.marks.tags.split(',').map((t) => t.trim()).join(',')}` : ''}${mode === 'video' && r.marks.motion ? `\n    animate: true\n    motion_prompt: ${r.marks.motion}` : ''}${mode === 'video' && r.marks.dialogue ? `\n    tts_text: ${/"([^"]+)"/.exec(r.marks.dialogue)[1]}` : ''}`;
  return {
    yaml: `# Generated by \`orchestrator import --mode ${mode}\`.\n\nproject: imported\n\noutput:\n  mode: ${mode}\n\n${key}:\n${usable.map(yamlOf).join('\n')}\n`,
    report: `${read.map((r) => (r.reject ? `[${r.id}]\n  rejected: ${r.reject}` : `[${r.id}]\n${mapped(r).map((m) => `  mapped: ${m}`).join('\n')}`)).join('\n')}\nimported ${usable.length}, ${mode === 'music' ? 'instrumental' : 'silent'} ${quiet}, rejected ${read.length - usable.length}\n`,
    entries: read.map((r) => ({ id: r.id, mapped: r.reject ? [] : mapped(r), discarded: r.reject ? [r.reject] : null })),
    imported: usable.length,
    silent: mode === 'video' ? quiet : 0,
    instrumental: mode === 'music' ? quiet : 0,
    rejected: read.length - usable.length,
  };
};
