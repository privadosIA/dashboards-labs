// The video editing operations of the server, simulated: `GET /api/video-edits/options`, `POST/GET/DELETE /api/video-edits`
// and the library of motions `GET/POST/DELETE /api/motions`. The refusals are the contract's (same tools, same limits, from
// the same table as the options). The state of an edit is derived from the clock, like the generations: one step queued,
// eight running, then done, so nothing has to be cancelled when it is deleted. A prompt with `[fail]` ends failed.
// A motion is `processing` for four steps and then `ready`; a title with `[fail]` ends `failed`.
import { randomBytes } from 'node:crypto';
import { parseMultipart } from './generation.mjs';

const RUN_STEPS = 8;
const err = (status, code, message) => [status, { error: { code, message } }];
const invalid = (message) => err(422, 'validation_failed', message);

const num = (name, min, max, def, description) => ({ name, kind: 'number', min, max, default: def, description });
const choice = (name, values, def, description) => ({ name, kind: 'choice', values, default: def, description });

/** The tools in the contract's stable order. `available: false` ones carry the reason. */
export const VIDEO_EDIT_TOOLS = [
  { id: 'scale', name: 'Scale', description: 'Makes the video larger, keeping its sound', available: true, needs_image: false, settings: [choice('factor', [2, 4], 2, 'Times larger'), choice('engine', ['fast', 'quality'], 'fast', 'How it is scaled')] },
  { id: 'interpolate', name: 'Frame rate', description: 'Adds frames to move more smoothly', available: true, needs_image: false, settings: [choice('fps', [24, 30, 60], 30, 'Frames per second, above the video\'s own')] },
  { id: 'reframe', name: 'Reframe', description: 'Changes the aspect ratio by cropping or padding', available: true, needs_image: false, settings: [choice('aspect_ratio', ['16:9', '9:16', '1:1', '4:5'], '16:9'), choice('mode', ['crop', 'pad'], 'crop'), { name: 'color', kind: 'color', default: '#000000', description: 'The padding colour' }] },
  { id: 'remove-background', name: 'Remove background', description: 'Cuts the people out', available: true, needs_image: false, notes: ['only human silhouettes'], settings: [{ name: 'background', kind: 'color', default: '#00ff00' }, { name: 'alpha', kind: 'boolean', default: false, description: 'A WebM with transparency' }] },
  { id: 'depth', name: 'Depth', description: 'A video of the depth of the scene', available: false, reason: 'the depth model is not installed (simulated)', needs_image: false, settings: [] },
  { id: 'extend', name: 'Extend', description: 'Makes the video longer', available: true, needs_image: false, notes: ['the quality drops with each extension'], settings: [{ name: 'seconds', kind: 'integer', min: 2, max: 10, default: 4 }, { name: 'prompt', kind: 'string' }, choice('engine', ['minimax-h3', 'ltx'], 'minimax-h3')] },
  { id: 'motion-control', name: 'Motion Control', description: 'Moves the people of a picture like those of a video', available: true, needs_image: true, accepts_motion: true, notes: ['only human silhouettes', '33 frames'], settings: [{ name: 'prompt', kind: 'string' }, num('strength', 0.2, 1, 0.6), num('start', 0, 30, 0, 'Seconds into the motion')] },
];

const VIDEO_EXT = /\.(mp4|mov|webm|mkv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const CLIENT_PATTERN = /^[a-z0-9-]{1,32}$/;

/** The settings of a request checked against the tool's table; null when they are fine, else the reason. */
function badSetting(tool, settings) {
  const known = new Map(tool.settings.map((s) => [s.name, s]));
  for (const [name, value] of Object.entries(settings)) {
    const s = known.get(name);
    if (!s) return `setting "${name}" is not accepted by ${tool.id}`;
    if (s.kind === 'choice' && !s.values.includes(value)) return `${name} ${JSON.stringify(value)} is not one of ${s.values.join(', ')}`;
    if (s.kind === 'integer' && !Number.isInteger(value)) return `${name} must be a whole number`;
    if ((s.kind === 'integer' || s.kind === 'number') && (typeof value !== 'number' || value < s.min || value > s.max)) return `${name} ${value} is outside ${s.min} to ${s.max}`;
    if (s.kind === 'boolean' && typeof value !== 'boolean') return `${name} must be true or false`;
    if (s.kind === 'color' && !/^#[0-9a-f]{6}$/i.test(String(value))) return `${name} must be a colour like #00ff00`;
  }
  return null;
}

export function videoEditHandlers({ db, save, ts, speed }) {
  db.videoEdits ??= {};
  db.motions ??= {};
  const step = 600 / speed;
  let counter = Object.keys(db.videoEdits).length;
  const newId = (prefix) => `${prefix}${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
  const newest = (a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1);

  function stateOf(rec) {
    const elapsed = Date.now() - Date.parse(rec.created_at);
    if (elapsed < step) return { state: 'queued', progress: 0 };
    const progress = Math.floor(((elapsed - step) / (step * RUN_STEPS)) * 100);
    if (progress < 100) return { state: 'running', progress: Math.min(99, progress) };
    return rec.fails ? { state: 'failed', progress: 99, error: 'the model ran out of memory (simulated)' } : { state: 'done', progress: 100 };
  }

  function resultOf(rec) {
    const { tool, settings = {} } = rec.request;
    const alpha = tool === 'remove-background' && settings.alpha === true;
    const factor = tool === 'scale' ? settings.factor ?? 2 : 1;
    const result = {
      video: `/api/projects/${rec.id}/artifacts/out/${rec.id}.${alpha ? 'webm' : 'mp4'}`,
      format: alpha ? 'webm' : 'mp4',
      has_audio: ['scale', 'reframe', 'remove-background'].includes(tool),
      width: 640 * factor,
      height: 360 * factor,
      fps: tool === 'interpolate' ? settings.fps ?? 30 : 24,
      duration: tool === 'extend' ? 5 + (settings.seconds ?? 4) : 5,
    };
    if (tool === 'scale') result.engine = settings.engine ?? 'fast';
    if (tool === 'extend') result.extended_times = 1;
    return result;
  }

  function editView(rec) {
    const st = stateOf(rec);
    const v = { id: rec.id, client: rec.request.client ?? 'unknown', tool: rec.request.tool, state: st.state, progress: st.progress, request: rec.request, run_id: rec.run_id, created_at: rec.created_at, size_bytes: st.state === 'done' ? rec.bytes : 0 };
    if (st.state === 'done') v.result = resultOf(rec);
    if (st.error) v.error = st.error;
    return v;
  }

  function motionView(rec) {
    const elapsed = Date.now() - Date.parse(rec.created_at);
    const state = elapsed < step * 4 ? 'processing' : rec.fails ? 'failed' : 'ready';
    const v = { id: rec.id, title: rec.title, tags: rec.tags, duration: rec.duration, people: rec.people, state, preview: `/api/motions/${rec.id}/preview` };
    if (state === 'failed') v.error = 'nobody appears in the video (simulated)';
    return v;
  }

  /** The request JSON and the files of a multipart body. */
  function readForm(body, files) {
    if (!body?.buffer) return { error: invalid('the request must be multipart/form-data with a request part') };
    const read = files.map((f) => parseMultipart(body.buffer, body.type, f));
    if (read.some((r) => !r)) return { error: err(400, 'invalid_request', 'invalid multipart body') };
    let request = {};
    try {
      if (read[0].fields.request) request = JSON.parse(read[0].fields.request);
    } catch {
      return { error: err(400, 'invalid_request', 'invalid JSON in the request part') };
    }
    return { request, files: Object.fromEntries(files.map((f, i) => [f, read[i].image])) };
  }

  return {
    'GET /api/video-edits/options': () => [200, { tools: VIDEO_EDIT_TOOLS }],

    'POST /api/video-edits': ({ body }) => {
      const read = readForm(body, ['video', 'image']);
      if (read.error) return read.error;
      const req = read.request;
      const tool = VIDEO_EDIT_TOOLS.find((t) => t.id === req.tool);
      if (!tool) return invalid(`tool "${req.tool}" is unknown: use one of the identifiers of GET /api/video-edits/options`);
      if (req.client !== undefined && !(typeof req.client === 'string' && CLIENT_PATTERN.test(req.client))) return invalid(`client ${JSON.stringify(req.client)} is not a client name: use ^[a-z0-9-]{1,32}$`);
      const { video, image } = read.files;
      if (req.motion !== undefined && tool.id !== 'motion-control') return invalid(`tool ${tool.id} does not take a motion`);
      if (req.motion !== undefined && video) return invalid('send a video or a motion, not both');
      if (req.motion === undefined && !video) return invalid('the video to edit is needed: send it as the video part of a multipart request');
      if (video && !VIDEO_EXT.test(video.filename)) return invalid('the video must be an .mp4, .mov, .webm or .mkv file');
      if (req.motion !== undefined) {
        const motion = db.motions[req.motion];
        if (!motion || motionView(motion).state !== 'ready') return invalid(`motion "${req.motion}" does not exist or is not ready`);
      }
      if (tool.needs_image && !image) return invalid(`tool ${tool.id} needs a reference picture: send it as the image part`);
      if (!tool.needs_image && image) return invalid(`tool ${tool.id} does not take a picture`);
      if (image && !IMAGE_EXT.test(image.filename)) return invalid('the picture must be a .png, .jpg, .jpeg or .webp file');
      const settings = req.settings ?? {};
      const bad = badSetting(tool, settings);
      if (bad) return invalid(bad);
      if (!tool.available) return err(503, 'unavailable', `tool ${tool.id} cannot run now: ${tool.reason}`);
      const resolved = { tool: tool.id, client: req.client ?? 'unknown' };
      if (Object.keys(settings).length) resolved.settings = settings;
      if (req.motion !== undefined) resolved.motion = req.motion;
      const id = newId('api-vid-');
      const rec = { id, created_at: ts(), request: resolved, run_id: `run-mock-${++counter}`, fails: String(settings.prompt ?? '').includes('[fail]'), bytes: 2_000_000 };
      db.videoEdits[id] = rec;
      save();
      return [202, editView(rec)];
    },
    'GET /api/video-edits': () => [200, Object.values(db.videoEdits).sort(newest).map(editView)],
    'GET /api/video-edits/{id}': ({ params }) => {
      const rec = db.videoEdits[params.id];
      return rec ? [200, editView(rec)] : err(404, 'not_found', `video edit "${params.id}" not found`);
    },
    'DELETE /api/video-edits/{id}': ({ params }) => {
      if (!db.videoEdits[params.id]) return err(404, 'not_found', `video edit "${params.id}" not found`);
      delete db.videoEdits[params.id];
      save();
      return [204];
    },

    'GET /api/motions': () => [200, Object.values(db.motions).sort(newest).map(motionView)],
    'POST /api/motions': ({ body }) => {
      const read = readForm(body, ['video']);
      if (read.error) return read.error;
      const req = read.request;
      const { video } = read.files;
      if (!video && !req.source) return invalid('send the video part or a source address');
      if (video && !VIDEO_EXT.test(video.filename)) return invalid('the video must be an .mp4, .mov, .webm or .mkv file');
      if (video && video.filename.includes('long')) return invalid('the video lasts more than 30 seconds');
      if (video && video.filename.includes('short')) return invalid('the video lasts less than 2.1 seconds');
      if (video && video.filename.includes('empty')) return invalid('nobody appears in the video');
      const id = newId('motion-');
      const fromAddress = typeof req.source === 'string' ? req.source.split('?')[0].split('/').filter(Boolean).pop() : undefined;
      const title = typeof req.title === 'string' && req.title ? req.title : (video?.filename ?? fromAddress ?? 'motion').replace(/\.[^.]+$/, '');
      const rec = { id, created_at: ts(), title, tags: Array.isArray(req.tags) ? req.tags : [], duration: 6, people: 1, fails: title.includes('[fail]') };
      db.motions[id] = rec;
      save();
      return [202, motionView(rec)];
    },
    'GET /api/motions/{id}': ({ params }) => {
      const rec = db.motions[params.id];
      return rec ? [200, motionView(rec)] : err(404, 'not_found', `motion "${params.id}" not found`);
    },
    'DELETE /api/motions/{id}': ({ params }) => {
      if (!db.motions[params.id]) return err(404, 'not_found', `motion "${params.id}" not found`);
      delete db.motions[params.id];
      save();
      return [204];
    },
    // The preview itself is a file: server.mjs answers it with the placeholder video once the motion exists.
    'GET /api/motions/{id}/preview': () => err(404, 'not_found', 'no preview'),
  };
}
