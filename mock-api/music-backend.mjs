// How the two music generators that have a Python container (HeartMuLa and DiffRhythm2) run on this machine, simulated: the backend of each one
// (`dotnet`, the .NET service, or `docker`, the Python container), what each backend has and lacks, the start and stop of what runs, and the installs
// of what is missing as jobs the page follows (plan without `confirm`, a job with it, its list, read, cancel and events).
// State: `db.musicBackend[engine]` = { service, image, weights, running: null | { backend, since, gpu, ready_at } } and `db.musicInstalls`.
// What the mock has from the start: the .NET services and the built images, and no weights, so that there is something to download (the owner's real machine has everything).
// `MOCK_DOCKER=0` simulates a server that cannot use Docker (a Compose server: `no_docker`), `MOCK_INSTALL_MS` the time of each part, `MOCK_DISK_FREE_GB`
// the free disk, `MOCK_INSTALL_FAIL=<part>` makes that part fail once (a repeat does what is missing).
import { randomBytes } from 'node:crypto';

const err = (status, code, message, reason) => [status, { error: { code, message, ...(reason ? { reason } : {}) } }];

export const ENGINES = ['heartmula', 'diffrhythm2'];
const PORT = { heartmula: 8787, diffrhythm2: 8788, clap: 8789 };
const GB = 1e9;
/** What each part takes on the disk (approximate, as the contract says), by engine. */
const SIZE = {
  heartmula: { service: 0.4 * GB, image: 14.2 * GB, weights: 21 * GB },
  diffrhythm2: { service: 0.4 * GB, image: 14 * GB, weights: 9.5 * GB },
};
const LICENSES = { diffrhythm2: ['CC-BY-NC-4.0 (MuQ-MuLan, the style encoder: non-commercial use only)'] };
/** The order a person fixes what is missing, per backend, and the reason code of each. */
const NEEDS = { dotnet: ['service', 'weights'], docker: ['docker', 'image', 'weights', 'gpu_runtime'] };
const REASON = { service: 'no_service', weights: 'no_weights', docker: 'no_docker', image: 'no_image', gpu_runtime: 'no_gpu_runtime' };
const DETAIL = {
  service: 'the .NET service is not installed',
  weights: 'the weights are not downloaded',
  docker: 'Docker does not answer',
  image: 'the Docker image is not built',
  gpu_runtime: 'Docker has no NVIDIA runtime',
};
const PARTS_FOR = { dotnet: ['service', 'weights'], docker: ['image', 'weights'] };
const ORDER = ['service', 'image', 'weights'];
const BACKENDS = ['dotnet', 'docker'];

export function musicBackendHandlers({ db, save, ts, speed = 1 }) {
  const dockerOk = () => process.env.MOCK_DOCKER !== '0';
  const stepMs = () => Number(process.env.MOCK_INSTALL_MS ?? 1500) / speed;
  const freeBytes = () => Number(process.env.MOCK_DISK_FREE_GB ?? 400) * GB;

  db.musicBackend ??= {};
  for (const e of ENGINES) db.musicBackend[e] ??= { service: true, image: true, weights: false, running: null };
  // LAION-CLAP has only the .NET service: no backend, no install.
  db.musicBackend.clap ??= { service: true, image: false, weights: true, running: null };
  db.musicInstalls ??= [];
  let failNext = process.env.MOCK_INSTALL_FAIL || '';
  const state = (engine) => db.musicBackend[engine];
  const saved = (engine) => db.settings?.[`${engine}_backend`];
  const backendOf = (engine) => saved(engine) ?? 'dotnet';
  const hostOf = (engine) => db.settings?.[`${engine}_host`] ?? '';
  const installs = db.musicInstalls;
  const running = (id) => installs.find((i) => i.id === id);
  const installing = () => installs.find((i) => i.state === 'running');

  /** Whether the part is there, for an engine: `docker` and `gpu_runtime` are the machine's, the others are the engine's own. */
  const has = (engine, part) => (part === 'docker' || part === 'gpu_runtime' ? dockerOk() : state(engine)[part] === true);
  const missing = (engine, backend) => NEEDS[backend].filter((p) => !has(engine, p));
  const needBytes = (engine, parts) => parts.filter((p) => SIZE[engine][p]).reduce((sum, p) => sum + SIZE[engine][p], 0);

  /** `BackendStatus` for one backend of an engine. */
  function backendStatus(engine, backend) {
    const lacks = missing(engine, backend);
    if (!lacks.length) return { available: true };
    const need = needBytes(engine, lacks);
    return { available: false, missing: lacks, reason: REASON[lacks[0]], detail: DETAIL[lacks[0]], ...(need ? { need_bytes: Math.round(need) } : {}) };
  }

  /** The state of what runs, settled by the clock: a start is `starting` until its time has passed. */
  function container(engine) {
    const run = state(engine).running;
    if (!run) return { state: 'stopped' };
    const settled = Date.now() >= run.ready_at;
    return { state: settled ? 'running' : 'starting', gpu: run.gpu, port: PORT[engine], since: run.since };
  }

  /** One entry of `GET /api/music/engines`: what can be used now, and what each backend has. */
  function engineEntry(engine) {
    const backends = Object.fromEntries(BACKENDS.map((b) => [b, backendStatus(engine, b)]));
    if (hostOf(engine)) return { available: true, mode: 'external', version: '1', container: { state: 'stopped' }, backends };
    const status = backends[backendOf(engine)];
    const c = container(engine);
    if (!status.available) return { available: false, mode: 'local', reason: status.reason, detail: status.detail, missing: status.missing, version: '1', container: c, backends };
    if (c.state !== 'running') return { available: false, mode: 'local', reason: 'not_running', detail: `the ${engine} service is not running: start it from the Environment screen`, version: '1', container: c, backends };
    return { available: true, mode: 'local', version: '1', container: c, backends };
  }

  /** LAION-CLAP: it hears the sound of an audio, runs only as the .NET service, and is started and stopped like the generators. */
  function clapEntry() {
    const c = container('clap');
    if (c.state === 'running') return { available: true, mode: 'local', version: '1', container: c };
    return { available: false, mode: 'local', reason: 'not_running', detail: 'the LAION-CLAP service is not running: start it from the Environment screen', version: '1', container: c };
  }

  /** The two blocks of the settings that carry the backend. */
  const settingsBlock = (engine) => ({ backend: backendOf(engine), backend_source: saved(engine) ? 'setting' : 'default' });

  /** What `PUT /api/settings` checks of the backend keys (`null` when they are fine); on success the engine that ran on the old backend is stopped. */
  function checkSettings(body) {
    for (const engine of ENGINES) {
      const key = `${engine}_backend`;
      if (!(key in (body ?? {}))) continue;
      const value = body[key];
      if (typeof value !== 'string' || (value !== '' && !BACKENDS.includes(value))) return err(422, 'validation_failed', `${key}: dotnet, docker or empty`);
      if (value === 'docker' && !dockerOk()) return err(422, 'validation_failed', 'Docker does not answer on this machine', 'no_docker');
      const run = state(engine).running;
      if (run && Date.now() < run.ready_at) return err(409, 'conflict', `${engine} is starting: wait for it to be ready`);
    }
    return null;
  }
  /** After a change of backend: what ran on the old one is stopped. */
  function afterSettings(before, body) {
    for (const engine of ENGINES) {
      const key = `${engine}_backend`;
      if (key in (body ?? {}) && (body[key] || 'dotnet') !== (before[engine] || 'dotnet')) state(engine).running = null;
    }
  }
  const backendsBefore = () => Object.fromEntries(ENGINES.map((e) => [e, saved(e) ?? '']));

  // ------------------------------------------------------------ start and stop
  const startEngine = ({ params, body }) => {
    const engine = params.engine;
    if (engine === 'clap') {
      state('clap').running = { backend: 'dotnet', gpu: 0, since: ts(), ready_at: Date.now() + Math.max(400, stepMs() / 2) };
      save();
      return [202, { container: container('clap') }];
    }
    if (!ENGINES.includes(engine)) return [202, { container: { state: 'running', port: 8790, since: ts() } }];
    if (hostOf(engine)) return err(409, 'conflict', `an address is saved for ${engine}: it is an external service and is not started from here`);
    const status = backendStatus(engine, backendOf(engine));
    if (!status.available) return err(422, 'validation_failed', `${engine} cannot be started: ${status.detail}`, status.reason);
    const gpu = Number.isInteger(body?.gpu) ? body.gpu : 1;
    state(engine).running = { backend: backendOf(engine), gpu, since: ts(), ready_at: Date.now() + Math.max(400, stepMs() / 2) };
    save();
    return [202, { container: container(engine) }];
  };
  const stopEngine = ({ params }) => {
    const engine = params.engine;
    if (engine === 'clap') {
      state('clap').running = null;
      save();
      return [200, { container: { state: 'stopped' } }];
    }
    if (!ENGINES.includes(engine)) return [200, { container: { state: 'stopped' } }];
    if (hostOf(engine)) return err(409, 'conflict', `an address is saved for ${engine}: it is an external service`);
    state(engine).running = null;
    save();
    return [200, { container: { state: 'stopped' } }];
  };

  // ------------------------------------------------------------ the installs
  const gb = (n) => `${(n / GB).toFixed(1)} GB`;

  /** The plan of an install: only what is missing, in order, with the sizes, the licences and the disk. `null` plus the error when it cannot be made. */
  function plan(engine, body) {
    const backend = body?.backend ?? backendOf(engine);
    if (!BACKENDS.includes(backend)) return { error: err(422, 'validation_failed', 'backend: dotnet or docker') };
    if (backend === 'docker' && !dockerOk()) return { error: err(422, 'validation_failed', 'Docker does not answer on this machine: it is not installed from here', 'no_docker') };
    const asked = body?.parts;
    if (asked !== undefined) {
      const bad = (Array.isArray(asked) ? asked : []).find((p) => !PARTS_FOR[backend].includes(p));
      if (!Array.isArray(asked) || bad !== undefined) return { error: err(422, 'validation_failed', `parts: ${PARTS_FOR[backend].join(' and ')} for ${backend}${bad ? `, not ${bad}` : ''}`) };
    }
    const lacking = ORDER.filter((p) => PARTS_FOR[backend].includes(p) && !has(engine, p) && (asked === undefined || asked.includes(p)));
    const parts = lacking.map((part) => ({ part, need_bytes: Math.round(SIZE[engine][part]), ...(part === 'weights' && LICENSES[engine] ? { licenses: LICENSES[engine] } : {}) }));
    const total = parts.reduce((s, p) => s + p.need_bytes, 0);
    const free = freeBytes();
    const disk = parts.length ? [{ path: '/var/lib/veritmo', parts: parts.map((p) => p.part), need_bytes: total, free_bytes: Math.round(free), sufficient: free >= total }] : [];
    return { backend, value: { engine, backend, parts, total_bytes: total, disk, confirm_required: parts.length > 0 } };
  }

  const view = (job) => ({ id: job.id, engine: job.engine, backend: job.backend, state: job.state, parts: job.parts.map((p) => ({ ...p })), ...(job.error ? { error: job.error } : {}), created_at: job.created_at, ...(job.finished_at ? { finished_at: job.finished_at } : {}) });
  const listeners = new Map();
  const send = (job, event, data) => {
    job.events.push({ event, data });
    for (const res of listeners.get(job.id) ?? []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const end = (job) => {
    for (const res of listeners.get(job.id) ?? []) {
      res.write('event: stream-end\ndata: {}\n\n');
      res.end();
    }
    listeners.delete(job.id);
  };
  const finish = (job, state, error) => {
    job.state = state;
    job.finished_at = ts();
    if (error) job.error = error;
    send(job, 'state', view(job));
    end(job);
    save();
  };

  /** Runs the parts one after the other by the clock; a part that is already there when its turn comes is `skipped`. */
  function runJob(job) {
    const next = () => {
      if (job.state !== 'running') return;
      const part = job.parts.find((p) => p.state === 'pending');
      if (!part) return finish(job, 'done');
      if (has(job.engine, part.part)) {
        part.state = 'skipped';
        send(job, 'log', { line: `${part.part}: already there` });
        send(job, 'state', view(job));
        return next();
      }
      part.state = 'running';
      send(job, 'state', view(job));
      const lines = { service: ['get-services.sh: fetching the service', 'unpacking into bin/services'], image: ['docker build docker/' + job.engine, 'Step 1/9: FROM nvidia/cuda', 'Step 9/9: COPY server.py', 'Successfully built the image'], weights: ['fetching the weights', 'checking the files'] }[part.part];
      const per = Math.max(60, stepMs() / (lines.length + 1));
      let i = 0;
      job.timer = setTimeout(function tick() {
        if (job.state !== 'running') return;
        if (i < lines.length) {
          send(job, 'log', { line: lines[i++] });
          job.timer = setTimeout(tick, per);
          return;
        }
        if (failNext === part.part) {
          failNext = '';
          part.state = 'failed';
          part.error = `${part.part}: the program exited with status 1`;
          return finish(job, 'failed', part.error);
        }
        state(job.engine)[part.part] = true;
        part.state = 'done';
        send(job, 'state', view(job));
        save();
        next();
      }, per);
    };
    next();
  }

  const handlers = {
    'POST /api/music/engines/{engine}/start': startEngine,
    'POST /api/music/engines/{engine}/stop': stopEngine,
    'POST /api/music/engines/{engine}/install': ({ params, body }) => {
      const engine = params.engine;
      if (!ENGINES.includes(engine)) return err(404, 'not_found', `${engine} has no container to install`);
      const made = plan(engine, body);
      if (made.error) return made.error;
      const confirm = body?.confirm === true;
      const status = container(engine);
      if (confirm || made.value.parts.length === 0) {
        if (status.state !== 'stopped' && !hostOf(engine)) return err(409, 'conflict', `${engine} is running: stop it before installing`);
        if (installing()) return err(409, 'conflict', `another install is running (${installing().id})`);
      }
      if (!confirm) return [200, made.value];
      if (made.value.parts.length === 0) return err(409, 'conflict', `nothing is missing for ${engine} with ${made.backend}`);
      const d = made.value.disk[0];
      if (!d.sufficient) return err(422, 'validation_failed', `the disk lacks ${gb(d.need_bytes - d.free_bytes)} for this install`, 'no_disk');
      const job = { id: `install-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, engine, backend: made.backend, state: 'running', parts: made.value.parts.map((p) => ({ ...p, state: 'pending' })), created_at: ts(), events: [] };
      installs.unshift(job);
      send(job, 'state', view(job));
      setTimeout(() => runJob(job), 0);
      return [202, { install: view(job) }];
    },
    'GET /api/music/installs': () => [200, { installs: installs.map(view) }],
    'GET /api/music/installs/{id}': ({ params }) => {
      const job = running(params.id);
      return job ? [200, { install: view(job) }] : err(404, 'not_found', `install "${params.id}" not found`);
    },
    'POST /api/music/installs/{id}/cancel': ({ params }) => {
      const job = running(params.id);
      if (!job) return err(404, 'not_found', `install "${params.id}" not found`);
      if (job.state === 'running') {
        clearTimeout(job.timer);
        // the part that was running is `cancelled` (as the server does); the ones that came after stay `pending` and the ones that ended stay as they are
        for (const p of job.parts) if (p.state === 'running') p.state = 'cancelled';
        finish(job, 'cancelled');
      }
      return [200, { install: view(job) }];
    },
  };

  /** The events of a job on an open response: what happened so far, then what comes until it ends. */
  function stream(job, res) {
    for (const { event, data } of job.events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (job.state !== 'running') {
      res.write('event: stream-end\ndata: {}\n\n');
      return res.end();
    }
    if (!listeners.has(job.id)) listeners.set(job.id, new Set());
    listeners.get(job.id).add(res);
    res.on('close', () => listeners.get(job.id)?.delete(res));
  }

  return { handlers, engineEntry, clapEntry, settingsBlock, checkSettings, afterSettings, backendsBefore, find: running, stream, ENGINES };
}
