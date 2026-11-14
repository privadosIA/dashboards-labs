// The generation operations of the server, simulated: `GET /api/generation/options`, `POST/GET/DELETE /api/generations`
// and `POST/GET/DELETE /api/image-edits`. The refusals are the server's (same limits, from the same fixtures as the
// options). The state of a generation is derived from the clock: one step queued, eight running, then done, so nothing
// has to be cancelled when it is deleted and a restarted mock keeps counting. A prompt with `[fail]` ends failed.
import { randomBytes } from 'node:crypto';
import * as fx from './fixtures.mjs';

const RUN_STEPS = 8;
const err = (status, code, message) => [status, { error: { code, message } }];
const invalid = (message) => err(422, 'validation_failed', message);
const unavailable = (message) => err(503, 'unavailable', message);

/** The `request` JSON and the `image` file of a multipart body; null when the body is not one. */
export function parseMultipart(buffer, contentType, fileField = 'image') {
  const boundary = /boundary=("?)([^";]+)\1/.exec(contentType ?? '')?.[2];
  if (!boundary || !buffer) return null;
  const fields = {};
  const files = [];
  let image = null;
  const parts = buffer.toString('latin1').split(`--${boundary}`).slice(1, -1);
  for (const part of parts) {
    const cut = part.indexOf('\r\n\r\n');
    if (cut < 0) continue;
    const head = part.slice(0, cut);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    const body = part.slice(cut + 4).replace(/\r\n$/, '');
    const file = filename !== undefined ? { field: name, filename, size: body.length, contentType: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? '' } : null;
    if (file) files.push(file);
    if (name === fileField && file) image = file;
    else if (name && !file) fields[name] = Buffer.from(body, 'latin1').toString('utf8');
  }
  return { fields, image, files };
}

/** The JSON request and the picture of a body that was sent as JSON or as multipart. */
function readRequest(body) {
  if (body === undefined) return { request: {}, image: null, files: [] };
  if (body?.buffer) {
    const multipart = parseMultipart(body.buffer, body.type);
    if (!multipart) return { error: err(400, 'invalid_request', 'invalid multipart body') };
    try {
      return { request: multipart.fields.request ? JSON.parse(multipart.fields.request) : {}, image: multipart.image, files: multipart.files };
    } catch {
      return { error: err(400, 'invalid_request', 'invalid JSON in the request part') };
    }
  }
  if (body === null || typeof body !== 'object') return { error: err(400, 'invalid_request', 'invalid JSON body') };
  return { request: body, image: null, files: [] };
}

const extension = (name) => (/\.(png|jpe?g|webp)$/i.exec(name ?? '') ?? [])[0]?.toLowerCase();

// The input parts of a generation: their kind in `Generation.inputs`, what each accepts, and the order they are reported in.
const INPUT_PARTS = {
  image: { kind: 'start_image', accepts: /\.(png|jpe?g|webp)$/i, said: '.png, .jpg, .jpeg or .webp' },
  end_image: { kind: 'end_image', accepts: /\.(png|jpe?g|webp)$/i, said: '.png, .jpg, .jpeg or .webp' },
  reference_images: { kind: 'reference_image', accepts: /\.(png|jpe?g|webp)$/i, said: '.png, .jpg, .jpeg or .webp' },
  reference_videos: { kind: 'reference_video', accepts: /\.(mp4|mov|webm|mkv)$/i, said: '.mp4, .mov, .webm or .mkv' },
  reference_audios: { kind: 'reference_audio', accepts: /\.(mp3|wav|m4a|aac|ogg|flac)$/i, said: '.mp3, .wav, .m4a, .aac, .ogg or .flac' },
};
const REFERENCE_LIMITS = { reference_images: 'reference_images', reference_videos: 'reference_videos', reference_audios: 'reference_audios' };

/** The refusal of the input parts for an option, or the inputs the generation reports. Said as the server says: the part and what is accepted. */
function checkInputs(option, files) {
  const inputs = option.inputs ?? { start_image: true, end_image: false };
  const by = (part) => files.filter((f) => f.field === part);
  for (const f of files) {
    const part = INPUT_PARTS[f.field];
    if (!part) continue;
    if (!part.accepts.test(f.filename)) return { error: invalid(`${f.field}: "${f.filename}" must be a ${part.said} file`) };
  }
  if (by('image').length && !inputs.start_image) return { error: invalid(`image: option ${option.id} does not take a start picture`) };
  if (by('end_image').length && !inputs.end_image) return { error: invalid(`end_image: option ${option.id} does not take an end picture: only options whose inputs say end_image: true do`) };
  if (by('end_image').length && !by('image').length) return { error: invalid('end_image: an end picture needs the start picture (image)') };
  const references = Object.keys(REFERENCE_LIMITS).filter((p) => by(p).length);
  const takes = Object.keys(REFERENCE_LIMITS).some((p) => inputs[p]?.max > 0);
  if (references.length && !takes) return { error: invalid(`${references[0]}: option ${option.id} does not take references`) };
  if (takes && (by('image').length || by('end_image').length)) return { error: invalid('image: references cannot be mixed with image or end_image') };
  for (const part of Object.keys(REFERENCE_LIMITS)) {
    const max = inputs[part]?.max ?? 0;
    if (by(part).length > max) return { error: invalid(`${part}: ${by(part).length} sent and option ${option.id} accepts at most ${max}`) };
  }
  if (takes && by('reference_images').length < (inputs.reference_images?.min ?? 1)) return { error: invalid(`reference_images: at least ${inputs.reference_images?.min ?? 1} reference picture is needed`) };
  return {};
}

/** The inputs a generation reports, the start picture first and then the rest in the order they were sent. */
const inputsOfFiles = (id, files) =>
  files
    .filter((f) => INPUT_PARTS[f.field])
    .map((f) => ({ kind: INPUT_PARTS[f.field].kind, name: f.filename, address: `/api/projects/${id}/artifacts/sources/${f.filename}` }));

export function generationHandlers({ db, save, ts, speed }) {
  const step = 600 / speed;
  let counter = Object.keys(db.generations).length + Object.keys(db.edits).length;
  const newId = (prefix) => `${prefix}${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;

  // queued for one step, running for RUN_STEPS and then done (or failed, when the request asked for it).
  function stateOf(rec) {
    const elapsed = Date.now() - Date.parse(rec.created_at);
    if (elapsed < step) return { state: 'queued', progress: 0 };
    const progress = Math.floor(((elapsed - step) / (step * RUN_STEPS)) * 100);
    if (progress < 100) return { state: 'running', progress: Math.min(99, progress) };
    return rec.fails ? { state: 'failed', progress: 99, error: 'the model ran out of memory (simulated)' } : { state: 'done', progress: 100 };
  }
  const size = (rec, st) => (st.state === 'done' ? rec.bytes : 0);

  // The name a dashboard gives itself (the pattern of the contract); a request without one is `unknown`.
  const CLIENT_PATTERN = /^[a-z0-9-]{1,32}$/;
  const clientOf = (req) => (req.client === undefined ? { name: 'unknown' } : typeof req.client === 'string' && CLIENT_PATTERN.test(req.client) ? { name: req.client } : { error: invalid(`client ${JSON.stringify(req.client)} is not a client name: use ^[a-z0-9-]{1,32}$, one to 32 lowercase letters, digits or hyphens`) });

  function generationView(rec) {
    const st = stateOf(rec);
    const v = { id: rec.id, state: st.state, progress: st.progress, request: rec.request, client: rec.request.client ?? 'unknown', run_id: rec.run_id, clip_seconds: rec.clip_seconds, created_at: rec.created_at, size_bytes: size(rec, st), inputs: rec.inputs ?? [] };
    if (rec.estimate) v.estimate = rec.estimate;
    if (st.state === 'done') v.video = `/api/projects/${rec.id}/artifacts/out/${rec.id}.mp4`;
    if (st.error) v.error = st.error;
    return v;
  }
  function editView(rec) {
    const st = stateOf(rec);
    const v = { id: rec.id, state: st.state, progress: st.progress, request: rec.request, client: rec.request.client ?? 'unknown', run_id: rec.run_id, created_at: rec.created_at, size_bytes: size(rec, st) };
    if (st.state === 'done') {
      v.results = Array.from({ length: rec.request.variants }, (_, i) => ({
        variant: i + 1,
        seed: rec.seed + i,
        image: `/api/projects/${rec.id}/artifacts/out/${rec.id}/imagen_1${rec.request.variants > 1 ? `_v${i + 1}` : ''}.png`,
      }));
    }
    if (st.error) v.error = st.error;
    return v;
  }
  const newest = (a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1);

  return {
    'GET /api/generation/options': () => [200, fx.generationOptions()],

    'POST /api/generations': ({ body }) => {
      const read = readRequest(body);
      if (read.error) return read.error;
      const req = { ...read.request };
      const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
      const source = req.reuse_inputs_of === undefined ? null : db.generations[req.reuse_inputs_of];
      if (req.reuse_inputs_of !== undefined) {
        if (read.files.length) return invalid('reuse_inputs_of: it cannot be sent together with input parts');
        if (!source) return invalid(`reuse_inputs_of: generation "${req.reuse_inputs_of}" does not exist`);
        if (!source.inputs?.length) return invalid(`reuse_inputs_of: generation "${req.reuse_inputs_of}" kept no inputs`);
      }
      const hasPicture = read.files.some((f) => f.field === 'image' || f.field === 'reference_images') || (source?.inputs ?? []).some((i) => i.kind === 'start_image' || i.kind === 'reference_image');
      if (!prompt && !hasPicture) return invalid('a prompt or a start picture is needed');
      if (prompt.length > 2000) return invalid('the prompt is longer than 2000 characters');
      const client = clientOf(req);
      if (client.error) return client.error;
      const option = req.option ? fx.VIDEO_OPTIONS.find((o) => o.id === req.option) : fx.VIDEO_OPTIONS.find((o) => o.default);
      if (!option) return invalid(`option "${req.option}" is unknown: use one of the identifiers of GET /api/generation/options`);
      if (!option.available) return unavailable(`option ${option.id} cannot run now: ${option.reason}`);
      const kept = source ? source.inputs.map((i) => ({ field: Object.keys(INPUT_PARTS).find((k) => INPUT_PARTS[k].kind === i.kind), filename: i.name })) : null;
      const checked = checkInputs(option, kept ?? read.files);
      if (checked.error) return checked.error;
      const resolved = { option: option.id, duration: req.duration || option.duration.default, aspect_ratio: req.aspect_ratio || '16:9', quality: req.quality || 'high' };
      if (prompt) resolved.prompt = prompt;
      if (req.audio) resolved.audio = true;
      if (typeof req.adult === 'boolean') resolved.adult = req.adult;
      if (req.reuse_inputs_of !== undefined) resolved.reuse_inputs_of = req.reuse_inputs_of;
      resolved.client = client.name;
      if (typeof resolved.duration !== 'number' || resolved.duration < option.duration.min || resolved.duration > option.duration.max) {
        return invalid(`duration ${resolved.duration} is outside what option ${option.id} accepts: from ${option.duration.min} to ${option.duration.max} seconds`);
      }
      if (!fx.ASPECT_RATIOS.includes(resolved.aspect_ratio)) return invalid(`aspect ratio "${resolved.aspect_ratio}" is not one of ${fx.ASPECT_RATIOS.join(', ')}`);
      if (!fx.QUALITIES.includes(resolved.quality)) return invalid(`quality "${resolved.quality}" is not one of ${fx.QUALITIES.join(', ')}`);
      if (resolved.audio && !option.audio) return invalid(`option ${option.id} cannot write audio: only MiniMax H3 and LTX 2.3 can`);
      const id = newId('api-gen-');
      const rec = {
        id,
        created_at: ts(),
        request: resolved,
        run_id: `run-mock-${++counter}`,
        clip_seconds: option.clip_seconds,
        estimate: option.estimate,
        fails: prompt.includes('[fail]'),
        bytes: Math.round(resolved.duration * 900_000),
        inputs: source ? source.inputs.map((i) => ({ ...i, address: i.address.replace(source.id, id) })) : inputsOfFiles(id, read.files),
      };
      db.generations[id] = rec;
      save();
      return [202, generationView(rec)];
    },
    'GET /api/generations': () => [200, Object.values(db.generations).sort(newest).map(generationView)],
    'GET /api/generations/{id}': ({ params }) => {
      const rec = db.generations[params.id];
      return rec ? [200, generationView(rec)] : err(404, 'not_found', `generation "${params.id}" not found`);
    },
    'DELETE /api/generations/{id}': ({ params }) => {
      if (!db.generations[params.id]) return err(404, 'not_found', `generation "${params.id}" not found`);
      delete db.generations[params.id];
      save();
      return [204];
    },

    'POST /api/image-edits': ({ body }) => {
      const read = readRequest(body);
      if (read.error) return read.error;
      if (!read.image) return invalid('the picture to edit is needed: send it as the image part of a multipart request');
      if (!extension(read.image.filename)) return invalid('the picture must be a .png, .jpg, .jpeg or .webp file');
      const req = { ...read.request };
      const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
      if (!prompt) return invalid('the prompt is blank: say what to do with the picture');
      const client = clientOf(req);
      if (client.error) return client.error;
      const model = req.model ? fx.IMAGE_MODELS.find((m) => m.id === req.model) : fx.IMAGE_MODELS.find((m) => m.default);
      if (!model) return invalid(`model "${req.model}" is unknown: use one of the identifiers of GET /api/generation/options`);
      if (!model.available) return unavailable(`model ${model.id} cannot run now: ${model.reason}`);
      if (req.strength !== undefined && !model.strength) return invalid(`model ${model.id} does not take a strength: it changes the picture by its prompt`);
      if (req.negative_prompt && !model.negative_prompt) return invalid(`model ${model.id} does not take a negative prompt`);
      if (req.strength !== undefined && !(req.strength > 0 && req.strength <= 1)) return invalid(`strength ${req.strength} is outside what is accepted: above 0 and at most 1`);
      const variants = req.variants ?? 1;
      if (!Number.isInteger(variants) || variants < 1 || variants > model.max_variants) return invalid(`variants ${variants} is outside what model ${model.id} makes: from 1 to ${model.max_variants}`);
      const resolved = { model: model.id, prompt, variants };
      if (req.negative_prompt) resolved.negative_prompt = req.negative_prompt;
      if (req.strength !== undefined) resolved.strength = req.strength;
      if (typeof req.adult === 'boolean') resolved.adult = req.adult;
      resolved.client = client.name;
      const id = newId('api-edit-');
      const rec = { id, created_at: ts(), request: resolved, run_id: `run-mock-${++counter}`, seed: 1000 + counter * 10, bytes: variants * 400_000 };
      db.edits[id] = rec;
      save();
      return [202, editView(rec)];
    },
    'GET /api/image-edits/{id}': ({ params }) => {
      const rec = db.edits[params.id];
      return rec ? [200, editView(rec)] : err(404, 'not_found', `image edit "${params.id}" not found`);
    },
    'DELETE /api/image-edits/{id}': ({ params }) => {
      if (!db.edits[params.id]) return err(404, 'not_found', `image edit "${params.id}" not found`);
      delete db.edits[params.id];
      save();
      return [204];
    },
  };
}
