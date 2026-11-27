// The engines that make 3D models, the download of their weights and the generations (`/api/models3d/engines`, `.../installs`, `.../generations`).
//
// The mock keeps the state of a small service: each engine has its weights or not, and a container that is stopped, starting or running; a download of
// weights is a job that ends by the clock; a generation goes through queued, running (the picture, then the model) and done, and a model it made lands
// in the library's pack `generated`. The refusals copy the server's statuses and words (docs/MODEL_GENERATION.md).
//
// TripoSR and Stable Fast 3D run as a .NET service (the default, `service` + `weights`) or in the Docker container (`image` + `weights`, and Docker answering). Each engine has its own
// service (`running`); the backend of both is the one saved setting `model3d_backend`. The weights of Stable Fast 3D need the saved Hugging Face key, whatever the backend. How the machine looks is picked by `MOCK_MODEL3D`: unset
// (triposr's service and weights there, stopped; sf3d with no key), `bare` (the service but no weights, to see the install), `noservice` (neither), `running` (triposr already up) or
// `none` (a server with no 3D service: every route answers 503). `MOCK_DOCKER=0` is a machine where Docker does not answer, `MOCK_MODEL3D_HOST=1` an external service,
// `MOCK_INSTALL_FAIL=<part>` makes that part of an install fail once. `MOCK_MODEL3D_SF3D=ready` makes sf3d usable; `=key` saves its Hugging Face key and leaves its weights to install. `MOCK_NO_IMAGE_MODEL=1` is a machine with no image model; `MOCK_ADULT=1` a server that keeps adult content.

import { readClientPatch } from './clients.mjs';

const err = (status, code, message, reason) => [status, { error: { code, message, ...(reason ? { reason } : {}) } }];

const ENGINES = ['triposr', 'sf3d'];
const DETAILS = ['low', 'normal', 'high'];
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CLIENT = /^[a-z0-9-]{1,32}$/;
const PICTURE = /\.(png|jpe?g|webp)$/i;
const MAX_PICTURE = 20 * 1024 * 1024;
const VERSION = { triposr: 'triposr@3f1c9a2', sf3d: 'sf3d@8d41e07' };
/** What an engine reports as its version when the .NET service runs it. */
const VERSION_NET = { triposr: 'triposr-net@0.1.0', sf3d: 'sf3d-net@0.1.0' };
/** The licence of each engine as the plan describes it (`LicenceTerms`). sf3d's has an `id`: the install is refused until the request carries it as `accept_licence`, and the acceptance is recorded (`lib.accepted`). */
const LICENCES = {
  triposr: { name: 'MIT', url: 'https://huggingface.co/stabilityai/TripoSR', summary: 'Use, copy and change freely, keeping the notice.', commercial: 'yes' },
  sf3d: { id: 'stability-community', name: 'Stability AI Community License', url: 'https://huggingface.co/stabilityai/stable-fast-3d', summary: 'Free for personal use and for companies under a yearly revenue limit.', commercial: 'conditions' },
};
const WEIGHTS = {
  triposr: { files: ['triposr/config.yaml', 'triposr/model.ckpt'], bytes: 1_900_000_000, licence: 'MIT', gated: false, path: 'models/model3d/triposr' },
  sf3d: { files: ['sf3d/config.yaml', 'sf3d/model.safetensors', 'sf3d/160_tets.npz'], bytes: 3_900_000_000, licence: 'Stability AI Community License', gated: true, path: 'models/model3d/sf3d' },
};
const FREE_BYTES = 214_000_000_000;
const GB = 1e9;
const BACKENDS = ['dotnet', 'docker'];
const PARTS = ['service', 'image', 'weights'];
/** What each backend of an engine needs, in the order a person fixes it, and what each part takes on the disk. */
const NEEDS = { dotnet: ['service', 'weights'], docker: ['docker', 'image', 'gpu_runtime', 'weights'] };
/** The parts of an install by backend: the image (a `docker build`) is TripoSR's only; Stable Fast 3D's image is built by hand (`not_built`). */
const partsOf = (name, backend) => (backend === 'docker' ? (name === 'sf3d' ? ['weights'] : ['image', 'weights']) : ['service', 'weights']);
const SIZE = { triposr: { service: 0.3 * GB, image: 14 * GB, weights: 1.9 * GB }, sf3d: { service: 0.3 * GB, weights: 3.9 * GB } };
const REASON = { service: 'no_service', weights: 'no_weights', docker: 'no_docker', image: 'no_image', gpu_runtime: 'no_gpu_runtime' };
const DETAIL = { service: 'the .NET service is not published: run scripts/get-services.sh --only triposr', weights: 'the weights are not downloaded', docker: 'Docker does not answer', image: 'the Docker image is not built', gpu_runtime: 'Docker has no NVIDIA runtime' };

const REASONS = {
  not_running: (e) => `everything is there but the ${e} service is stopped`,
  key_missing: () => 'no Hugging Face key is saved: save the key of an account that accepted the licence of stabilityai/stable-fast-3d',
};

/** Reads the fields of a `multipart/form-data` body: the text parts and the file part named `image` (name and bytes). */
export function multipart(body) {
  const type = body?.type ?? '';
  const boundary = /boundary=("?)([^";]+)\1/.exec(type)?.[2];
  if (!boundary || !body?.buffer) return null;
  const fields = {};
  let image = null;
  const parts = body.buffer.toString('latin1').split(`--${boundary}`);
  for (const part of parts.slice(1)) {
    if (part.startsWith('--')) break;
    const cut = part.indexOf('\r\n\r\n');
    if (cut < 0) continue;
    const head = part.slice(0, cut);
    const value = part.slice(cut + 4).replace(/\r\n$/, '');
    const name = /name="([^"]*)"/.exec(head)?.[1];
    if (!name) continue;
    const file = /filename="([^"]*)"/.exec(head)?.[1];
    if (file !== undefined) image = { name: file, size: Buffer.byteLength(value, 'latin1') };
    else fields[name] = Buffer.from(value, 'latin1').toString('utf8');
  }
  return { fields, image };
}

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'model';

export function generationHandlers({ db, lib, save, speed = 1, addGenerated, generatedNames }) {
  lib.engines ??= null;
  lib.installs ??= {};
  lib.generations ??= {};
  const mode = () => process.env.MOCK_MODEL3D ?? '';
  const noService = () => mode() === 'none';
  const unavailable503 = () => err(503, 'unavailable', 'this server has no 3D service set up');
  const clock = (ms) => ms / speed;
  const startMs = () => clock(Number(process.env.MOCK_MODEL3D_START_MS ?? 1500));
  const installMs = () => clock(Number(process.env.MOCK_MODELS_MS ?? 2000) * 1.5);
  const queuedMs = () => clock(300);
  const pictureMs = () => clock(Number(process.env.MOCK_MODEL3D_PICTURE_MS ?? 1200));
  const modelMs = () => clock(Number(process.env.MOCK_MODEL3D_MODEL_MS ?? 1500));

  const dockerOk = () => process.env.MOCK_DOCKER !== '0';
  const external = () => process.env.MOCK_MODEL3D_HOST === '1';

  /** The state of the engines, made the first time it is asked: what each has (`service`, `image`, `weights`) and its own service (`running`). */
  function state() {
    if (!lib.engines || lib.engines.container) {
      const m = mode();
      // MOCK_MODEL3D_SF3D: `ready` has Stable Fast 3D complete; `key` has the Hugging Face key saved and the weights still to install (what an install needs to be asked for).
      const sfMode = process.env.MOCK_MODEL3D_SF3D;
      const sf = sfMode === 'ready';
      const key = sf || sfMode === 'key';
      lib.engines = {
        triposr: { service: m !== 'noservice', image: true, weights: m !== 'bare' && m !== 'noservice', key: true, running: m === 'running' ? { since: new Date().toISOString(), ready_at: 0 } : null },
        sf3d: { service: m !== 'noservice', image: true, weights: sf, key, running: null },
      };
    }
    return lib.engines;
  }
  /** The backend the engines run on: the one saved setting, for both (the .NET service by default). */
  const backendOf = () => db.settings?.model3d_backend ?? 'dotnet';
  const backendsOf = () => BACKENDS;
  const has = (name, part) => (part === 'docker' || part === 'gpu_runtime' ? dockerOk() : state()[name][part] === true);
  const lacks = (name, backend) => NEEDS[backend].filter((p) => !has(name, p));
  const bytesOf = (name, parts) => parts.filter((p) => SIZE[name][p]).reduce((sum, p) => sum + SIZE[name][p], 0);

  /** `BackendStatus` of one backend of an engine. */
  function backendStatus(name, backend) {
    const missing = lacks(name, backend);
    if (!missing.length) return { available: true };
    const need = bytesOf(name, missing);
    return { available: false, missing, reason: REASON[missing[0]], detail: DETAIL[missing[0]], ...(need ? { need_bytes: Math.round(need) } : {}) };
  }

  /** The state of an engine's own service, settled by the clock. */
  function containerOf(name) {
    const run = state()[name].running;
    if (!run) return { state: 'stopped' };
    return { state: Date.now() >= run.ready_at ? 'running' : 'starting', gpu: 0, port: name === 'sf3d' ? 8791 : 8790, since: run.since };
  }

  /** `EngineAvailability` of one engine. */
  function engineView(name) {
    const container = containerOf(name);
    const backends = Object.fromEntries(backendsOf(name).map((b) => [b, backendStatus(name, b)]));
    if (external()) return { available: true, mode: 'external', version: '1', container: { state: 'stopped' }, backends };
    const e = state()[name];
    const status = backends[backendOf(name)];
    if (name === 'sf3d' && !e.key) return { available: false, mode: 'local', reason: 'key_missing', detail: REASONS.key_missing(), container, backends };
    if (!status.available) return { available: false, mode: 'local', reason: status.reason, detail: status.detail, missing: status.missing, version: '1', container, backends };
    if (container.state !== 'running') return { available: false, mode: 'local', reason: 'not_running', detail: container.state === 'starting' ? `the ${name} service is starting` : REASONS.not_running(name), container, backends };
    return { available: true, mode: 'local', version: backendOf(name) === 'dotnet' ? VERSION_NET[name] : VERSION[name], container, backends };
  }
  const refusal = (name) => {
    const v = engineView(name);
    return v.available ? null : err(503, 'unavailable', `engine "${name}" cannot be used now: ${v.reason}${v.detail ? ` (${v.detail})` : ''}`, v.reason);
  };
  const unknown = (name) => (ENGINES.includes(name) ? null : err(404, 'not_found', `engine "${name}" is not known`));

  /** The block `model3d` of `GET /api/settings`. */
  const settingsBlock = () => ({ backend: backendOf('triposr'), backend_source: db.settings?.model3d_backend ? 'setting' : 'default' });

  /** What `PUT /api/settings` checks of `model3d_backend` (`null` when it is fine); the engine that ran on the old backend is stopped by `afterSettings`. */
  function checkSettings(body) {
    if (!body || !('model3d_backend' in body)) return null;
    const value = body.model3d_backend;
    if (typeof value !== 'string' || (value !== '' && !BACKENDS.includes(value))) return err(422, 'validation_failed', 'model3d_backend: dotnet, docker or empty');
    if (value === 'docker' && !dockerOk()) return err(422, 'validation_failed', 'Docker does not answer on this machine', 'no_docker');
    if (external()) return err(409, 'conflict', 'MODEL3D_HOST names a service elsewhere: its backend is managed where it runs');
    const starting = ENGINES.find((n) => state()[n].running && Date.now() < state()[n].running.ready_at);
    if (starting) return err(409, 'conflict', `${starting} is starting: wait for it to be ready`);
    return null;
  }
  function afterSettings(before, body) {
    if (body && 'model3d_backend' in body && (body.model3d_backend || 'dotnet') !== (before || 'dotnet')) for (const n of ENGINES) state()[n].running = null;
  }

  // --- the install of what an engine lacks ---
  const gb = (n) => `${(n / GB).toFixed(1)} GB`;
  /** The plan: the backend, the parts it would run (those missing, in order, among those asked) and what they take; `{ error }` when it cannot be made. */
  /** The licence of an engine as the plan says it: `accepted` appears only where an acceptance is required, and is true once one was recorded. */
  function termsOf(name) {
    const terms = LICENCES[name];
    return terms.id ? { ...terms, accepted: !!lib.accepted?.[terms.id] } : terms;
  }
  function plan(name, body) {
    const backend = body?.backend ?? backendOf(name);
    if (!BACKENDS.includes(backend)) return { error: err(422, 'validation_failed', 'backend: dotnet or docker') };
    if (backend === 'docker' && !dockerOk()) return { error: err(422, 'validation_failed', 'Docker does not answer on this machine: it is not installed from here', 'no_docker') };
    const asked = body?.parts;
    if (asked !== undefined) {
      const bad = (Array.isArray(asked) ? asked : []).find((p) => !partsOf(name, backend).includes(p));
      if (!Array.isArray(asked) || bad !== undefined) return { error: err(422, 'validation_failed', `parts: ${partsOf(name, backend).join(' and ')} for ${backend}${bad ? `, not ${bad}` : ''}`) };
    }
    const parts = PARTS.filter((p) => partsOf(name, backend).includes(p) && !has(name, p) && (asked === undefined || asked.includes(p)));
    // the weights of sf3d need the saved key, for the .NET service too: refused before anything is downloaded
    if (name === 'sf3d' && parts.includes('weights') && !state().sf3d.key) return { error: err(422, 'validation_failed', 'engine "sf3d" cannot be installed now: key_missing', 'key_missing') };
    const w = WEIGHTS[name];
    const bytes = bytesOf(name, parts);
    return { backend, parts, value: { engine: name, backend, parts, missing: parts.includes('weights') ? w.files : [], bytes: Math.round(bytes), licence: termsOf(name), gated: w.gated, path: w.path, free_bytes: FREE_BYTES } };
  }

  /** The job as the clock leaves it: a part after the other, each with its lines; the part that failed ends it (`MOCK_INSTALL_FAIL=<part>` makes one fail once). */
  let failNext = process.env.MOCK_INSTALL_FAIL || '';
  const LINES = { service: ['get-services.sh: fetching the triposr service', 'unpacking into bin/services'], image: ['docker build docker/model3d', 'Step 9/9: COPY server.py', 'Successfully built the image'], weights: ['fetching the weights', 'checking the files'] };
  function settleInstall(job) {
    if (job.state !== 'running') return job;
    const per = installMs() / Math.max(1, job.parts.length);
    const elapsed = Date.now() - job.startedAt;
    const at = Math.min(job.parts.length, Math.floor(elapsed / per));
    for (let i = job.done ?? 0; i < at; i++) {
      const part = job.parts[i];
      if (failNext === part) {
        failNext = '';
        return Object.assign(job, { state: 'failed', part, error: `${part}: the program exited with status 1`, finished_at: new Date().toISOString(), done: i });
      }
      state()[job.engine][part] = true;
      job.done = i + 1;
    }
    job.part = job.parts[at];
    job.log = job.parts.slice(0, at + 1).flatMap((p) => LINES[p]).slice(0, 40);
    if (at >= job.parts.length) Object.assign(job, { state: 'done', part: undefined, finished_at: new Date().toISOString() });
    return job;
  }
  const installView = (job) => {
    settleInstall(job);
    const { startedAt, done, ...rest } = job;
    void startedAt;
    void done;
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  };
  const running = () => Object.values(lib.installs).some((j) => settleInstall(j).state === 'running');

  // --- the generations ---
  function settleGeneration(rec) {
    if (rec.state === 'cancelled' || rec.state === 'failed' || rec.state === 'done') return rec;
    const elapsed = Date.now() - rec.startedAt;
    const picture = rec.hasPrompt ? pictureMs() : 0;
    if (elapsed < queuedMs()) return Object.assign(rec, { state: 'queued', step: undefined });
    if (elapsed < queuedMs() + picture) return Object.assign(rec, { state: 'running', step: 'picture' });
    if (elapsed < queuedMs() + picture + modelMs()) return Object.assign(rec, { state: 'running', step: 'model' });
    if (/\bfail\b/i.test(rec.prompt ?? '')) return Object.assign(rec, { state: 'failed', step: undefined, error: 'the engine ran out of memory making the model (simulated)', finished_at: new Date().toISOString() });
    const names = generatedNames();
    let name = rec.name;
    for (let n = 2; names.includes(name); n++) name = `${rec.name}-${n}`;
    const made = addGenerated({
      name,
      prompt: rec.prompt ?? rec.picture,
      engine: rec.engine,
      engine_version: VERSION[rec.engine],
      detail: rec.detail,
      project: rec.id,
      entry: name,
      adult: rec.adult,
    });
    return Object.assign(rec, { state: 'done', step: undefined, model: made.id, finished_at: new Date().toISOString() });
  }
  const generationView = (rec) => {
    settleGeneration(rec);
    const { startedAt, hasPrompt, picture, adult, ...rest } = rec;
    void startedAt;
    void hasPrompt;
    void picture;
    void adult;
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  };
  const idStamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14).replace(/^(\d{8})/, '$1-');

  const handlers = {
    'GET /api/models3d/engines': () => {
      if (noService()) return unavailable503();
      return [200, { engines: Object.fromEntries(ENGINES.map((n) => [n, engineView(n)])) }];
    },
    'POST /api/models3d/engines/{engine}/start': ({ params }) => {
      if (noService()) return unavailable503();
      const bad = unknown(params.engine);
      if (bad) return bad;
      if (external()) return err(409, 'conflict', 'MODEL3D_HOST names a service elsewhere: it is managed where it runs');
      const v = engineView(params.engine);
      if (!v.available && v.reason !== 'not_running') return err(409, 'conflict', `engine "${params.engine}" cannot be used yet: ${v.reason}`, v.reason);
      const e = state()[params.engine];
      if (!e.running) {
        e.running = { since: new Date().toISOString(), ready_at: Date.now() + startMs() };
        save();
      }
      return [200, { container: containerOf(params.engine) }];
    },
    'POST /api/models3d/engines/{engine}/stop': ({ params }) => {
      if (noService()) return unavailable503();
      const bad = unknown(params.engine);
      if (bad) return bad;
      if (external()) return err(409, 'conflict', 'MODEL3D_HOST names a service elsewhere: it is managed where it runs');
      state()[params.engine].running = null;
      save();
      return [200, { container: containerOf(params.engine) }];
    },
    'POST /api/models3d/engines/{engine}/install': ({ params, body }) => {
      if (noService()) return unavailable503();
      const bad = unknown(params.engine);
      if (bad) return bad;
      if (external()) return err(409, 'conflict', 'MODEL3D_HOST names a service elsewhere: it is managed where it runs');
      const name = params.engine;
      const made = plan(name, body);
      if (made.error) return made.error;
      if (made.parts.length === 0) return err(409, 'conflict', `nothing is missing for ${name} with the ${made.backend} backend`);
      if (running()) return err(409, 'conflict', 'another install is running');
      if (made.value.bytes > FREE_BYTES) return err(422, 'validation_failed', 'the disk has no room for this install', 'no_disk');
      if (body?.confirm !== true) return [200, { plan: made.value }];
      // An engine whose licence has an id is never installed on the strength of `confirm` alone: the person's acceptance has to come with it. The mock never accepts for anyone.
      const needed = LICENCES[name].id;
      if (needed && body?.accept_licence !== needed) return err(400, 'invalid_request', `the licence ${needed} (${LICENCES[name].name}, ${LICENCES[name].url}) has to be accepted: send accept_licence with that id after the person agreed`, 'licence_acceptance_required');
      if (needed) (lib.accepted ??= {})[needed] = { licence: needed, at: new Date().toISOString(), client: typeof body?.client === 'string' ? body.client : 'unknown' };
      const id = `m3d-install-${Date.now().toString(36)}`;
      lib.installs[id] = { id, engine: name, backend: made.backend, parts: made.parts, part: made.parts[0], state: 'running', log: [], created_at: new Date().toISOString(), startedAt: Date.now() };
      save();
      return [202, { install: installView(lib.installs[id]) }];
    },
    'GET /api/models3d/installs/{id}': ({ params }) => {
      if (noService()) return unavailable503();
      const job = lib.installs[params.id];
      return job ? [200, installView(job)] : err(404, 'not_found', `download "${params.id}" not found`);
    },
    'POST /api/models3d/installs/{id}/cancel': ({ params }) => {
      if (noService()) return unavailable503();
      const job = lib.installs[params.id];
      if (!job) return err(404, 'not_found', `download "${params.id}" not found`);
      if (settleInstall(job).state !== 'running') return err(409, 'conflict', `download "${params.id}" is not running`);
      Object.assign(job, { state: 'cancelled', error: 'cancelled', finished_at: new Date().toISOString() });
      save();
      return [200, installView(job)];
    },

    'GET /api/models3d/generations': ({ query, page }) => {
      if (noService()) return unavailable503();
      let list = Object.values(lib.generations).map(generationView).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      const clients = query.get('client');
      if (clients) {
        const want = clients.split(',').map((c) => c.trim());
        list = list.filter((g) => want.includes(g.client));
      }
      return page(list, { natural: true });
    },
    'POST /api/models3d/generations': ({ body }) => {
      if (noService()) return unavailable503();
      let input = body;
      let image = null;
      if (body && typeof body === 'object' && body.buffer) {
        const parsed = multipart(body);
        if (!parsed) return err(400, 'invalid_request', 'the body is not valid multipart/form-data');
        input = { ...parsed.fields, ...(parsed.fields.adult !== undefined ? { adult: parsed.fields.adult === 'true' } : {}) };
        image = parsed.image;
      }
      if (!input || typeof input !== 'object') return err(400, 'invalid_request', 'the body must be a JSON object or multipart/form-data');
      const hasPrompt = input.prompt !== undefined;
      if (hasPrompt && image) return err(400, 'invalid_request', 'prompt: give a text or a picture, not both');
      if (!hasPrompt && !image) return err(400, 'invalid_request', 'prompt: give a text or a picture');
      if (hasPrompt && (typeof input.prompt !== 'string' || !input.prompt.trim())) return err(400, 'invalid_request', 'prompt: must be a text that is not empty');
      if (hasPrompt && input.prompt.length > 1000) return err(400, 'invalid_request', 'prompt: at most 1000 characters');
      const engine = input.engine ?? 'triposr';
      if (!ENGINES.includes(engine)) return err(400, 'invalid_request', 'engine: triposr or sf3d');
      const detail = input.detail ?? 'normal';
      if (!DETAILS.includes(detail)) return err(400, 'invalid_request', 'detail: low, normal or high');
      if (input.name !== undefined && (typeof input.name !== 'string' || !NAME.test(input.name))) return err(400, 'invalid_request', 'name: a plain lower-case name (letters, digits, ".", "_", "-")');
      if (input.client !== undefined && (typeof input.client !== 'string' || !CLIENT.test(input.client))) return err(400, 'invalid_request', 'client: one to 32 lower-case letters, digits or hyphens');
      if (image) {
        if (!PICTURE.test(image.name)) return err(400, 'invalid_request', 'image: a .png, .jpg, .jpeg or .webp picture');
        if (image.size > MAX_PICTURE) return err(413, 'invalid_request', 'image: the picture is larger than 20 MB');
      }
      if (input.adult === true && process.env.MOCK_ADULT !== '1') return err(422, 'content_not_allowed', 'adult content is not kept on this server');
      const cannot = refusal(engine);
      if (cannot) return cannot;
      if (hasPrompt && process.env.MOCK_NO_IMAGE_MODEL === '1') return err(503, 'unavailable', 'no image model is installed on this machine: give a picture instead', 'no_image_model');
      const id = `api-m3d-${idStamp()}-${Math.random().toString(16).slice(2, 8)}`;
      const rec = {
        id,
        client: input.client ?? 'unknown',
        state: 'queued',
        ...(hasPrompt ? { prompt: input.prompt } : {}),
        engine,
        detail,
        name: input.name ?? slug(hasPrompt ? input.prompt : image.name.replace(/\.[^.]*$/, '')),
        created_at: new Date().toISOString(),
        run: `run-${id}`,
        startedAt: Date.now(),
        hasPrompt,
        picture: image?.name,
        adult: input.adult === true,
      };
      lib.generations[id] = rec;
      save();
      return [202, generationView(rec)];
    },
    'GET /api/models3d/generations/{id}': ({ params }) => {
      if (noService()) return unavailable503();
      const rec = lib.generations[params.id];
      return rec ? [200, generationView(rec)] : err(404, 'not_found', `generation "${params.id}" not found`);
    },
    'PATCH /api/models3d/generations/{id}': ({ params, body }) => {
      if (noService()) return unavailable503();
      const rec = lib.generations[params.id];
      if (!rec) return err(404, 'not_found', `generation "${params.id}" not found`);
      const read = readClientPatch(body);
      if (read.error) return read.error;
      if (['queued', 'running'].includes(settleGeneration(rec).state)) return err(409, 'conflict', `generation "${params.id}" has an active run`);
      rec.client = read.client;
      save();
      return [200, generationView(rec)];
    },
    'DELETE /api/models3d/generations/{id}': ({ params }) => {
      if (noService()) return unavailable503();
      if (!lib.generations[params.id]) return err(404, 'not_found', `generation "${params.id}" not found`);
      delete lib.generations[params.id];
      save();
      return [204];
    },
    'POST /api/models3d/generations/{id}/cancel': ({ params }) => {
      if (noService()) return unavailable503();
      const rec = lib.generations[params.id];
      if (!rec) return err(404, 'not_found', `generation "${params.id}" not found`);
      if (!['queued', 'running'].includes(settleGeneration(rec).state)) return err(409, 'conflict', `generation "${params.id}" is already ${rec.state}`);
      Object.assign(rec, { state: 'cancelled', step: undefined, finished_at: new Date().toISOString() });
      save();
      return [200, generationView(rec)];
    },
  };
  /** Why an engine cannot be used now, as a run reads it before it makes anything: `null` when it can. */
  function engineProblem(name) {
    if (noService()) return { reason: 'unavailable', detail: 'this server has no 3D service set up' };
    const v = engineView(name);
    return v.available ? null : { reason: v.reason, detail: v.detail };
  }

  return { handlers, engineProblem, settingsBlock, checkSettings, afterSettings };
}
