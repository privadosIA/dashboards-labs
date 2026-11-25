#!/usr/bin/env node
// Standalone mock of the `veritmo serve` HTTP API, so the dashboard can be
// developed without the Go server, GPUs or models.
//
//   node server.mjs [--spec openapi.yaml|URL] [--port 4667] [--latency 0] [--token T] [--persist file.json] [--speed 1]
//
// - Routes come from the OpenAPI contract of the server (--spec: a file, or the URL of a running server's
//   /api/openapi.json; by default contract/openapi.yaml of this repository).
// - Projects, their YAML, runs (with live SSE progress), settings, providers and
//   downloads are stateful in memory: POST/PUT/DELETE change what the next GET returns.
// - Every other endpoint answers with an example generated from its response schema,
//   so any screen renders; writes on those are accepted and echoed.
// - Pictures, videos and songs of a project (`.../artifacts/...`) are answered with small placeholder files.
// - Nothing here touches GPUs or models, and it needs no other part of the repository except the contract.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import * as fx from './fixtures.mjs';
import { generationHandlers } from './generation.mjs';
import { videoEditHandlers } from './video-edit.mjs';
import { motionPageHandlers } from './motion-pages.mjs';
import { blenderDescriptionHandlers, descriptionProblems, filesOf, isSceneName } from './blender-descriptions.mjs';
import { datasetAssistHandlers } from './dataset-assist.mjs';
import { musicMotionHandlers, PARTS, SAMPLE_VIDEO_FILE, isSampleVideo, seedSample } from './music-motion.mjs';
import { motionChoice, motionConfigProblem } from './motion-scenes.mjs';
import { pager, isPaged } from './listing.mjs';
import { databaseHandlers } from './database.mjs';
import { dataHandlers } from './data.mjs';
import { catalogHandlers } from './catalog.mjs';
import { musicBackendHandlers } from './music-backend.mjs';
import { modelsProblem, simulateModels, manifestOf, outFiles } from './models3d-project.mjs';
import { makeGlb, models3dHandlers } from './models3d.mjs';
import { readModelsDataset } from './models3d-dataset.mjs';
import { seedBulk } from './bulk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg('port', process.env.MOCK_PORT ?? 4667));
const HOST = arg('host', '127.0.0.1');
const LATENCY = Number(arg('latency', 0));
const TOKEN = arg('token', process.env.VERITMO_TOKEN || process.env.ORCHESTRATOR_TOKEN || '');
const PERSIST = arg('persist', '');
const SPEED = Number(arg('speed', 1)); // >1 = faster simulated runs

const SPEC = arg('spec', resolve(here, '../contract/openapi.yaml'));
const specText = /^https?:\/\//.test(SPEC) ? await (await fetch(SPEC)).text() : readFileSync(SPEC, 'utf8');
// JSON is YAML too, so the same loader reads the openapi.yaml and a server's /api/openapi.json.
export const spec = yaml.load(specText);

// ---------------------------------------------------------------- state
const db = {
  projects: { demo: fx.SEED_VIDEO, 'demo-musica': fx.SEED_MUSIC, 'demo-modelos': fx.SEED_MODELS },
  runs: [],
  downloads: [],
  settings: {},
  providers: [],
  generations: {}, // the video generations and the image edits of the generation API, apart from the projects
  edits: {},
  pieces: {}, // the music motion pieces, apart from the projects
  references: {}, // the music motion references and the styles made from them
  presets: {},
  drafts: {}, // the part drafts, and the parts approved from them (they join the catalog)
  parts: {},
  partTexts: {}, // the text of the approved or replaced parts, by name
};
if (PERSIST && existsSync(PERSIST)) Object.assign(db, JSON.parse(readFileSync(PERSIST, 'utf8')));
db.generations ??= {};
db.edits ??= {};
db.pieces ??= {};
db.references ??= {};
db.presets ??= {};
db.drafts ??= {};
db.parts ??= {};
db.partTexts ??= {};
if (process.env.MOCK_SAMPLE !== 'off') seedSample(db, fx.LIBRARY_SONGS); // MOCK_SAMPLE=off starts without the animation sample
// MOCK_BULK=<n> adds n generated projects, songs and part drafts (a seeded generator: the same data every time).
if (process.env.MOCK_BULK) {
  const n = Number(process.env.MOCK_BULK);
  if (Number.isInteger(n) && n >= 1) seedBulk(db, n);
  else console.warn(`MOCK_BULK=${process.env.MOCK_BULK}: ignored, it must be a whole number of 1 or more`);
}
const save = () => PERSIST && writeFileSync(PERSIST, JSON.stringify(db, null, 2));

const parse = (text) => {
  try {
    return { value: yaml.load(text) ?? {}, error: '' };
  } catch (e) {
    return { value: null, error: String(e.message ?? e) };
  }
};
// An address as the server keeps it: with a scheme and the default port of the service.
const address = (text, port) => {
  const withScheme = /^https?:\/\//.test(text) ? text : `http://${text}`;
  return /:\d+$/.test(withScheme.replace(/^https?:\/\//, '')) ? withScheme : `${withScheme}:${port}`;
};
const isRemote = (addr) => !/^https?:\/\/(localhost|127\.[\d.]+|\[?::1\]?)(:|$)/.test(addr);

// GET /api/settings: the sample blocks with what has been saved laid over them (the shape the contract describes).
function settingsBody() {
  const saved = db.settings;
  const body = fx.settings();
  if (saved.ollama_host) {
    const host = address(saved.ollama_host, 11434);
    body.ollama = { host, source: 'setting', remote: isRemote(host), saved: host };
  }
  if (saved.browser) body.browser.saved = saved.browser;
  if (saved.motion_model) body.motion_model.saved = saved.motion_model;
  if (typeof saved.music_motion?.review_drafts === 'boolean') body.music_motion = { review_drafts: saved.music_motion.review_drafts };
  // how TripoSR runs (the .NET service by default, or the Docker container): only a server with a 3D service has the block
  if (process.env.MOCK_MODEL3D === 'none') delete body.model3d;
  else body.model3d = models3d.settingsBlock();
  for (const [block, port] of [['heartmula', 8787], ['diffrhythm2', 8788]]) {
    const host = saved[`${block}_host`] ? address(saved[`${block}_host`], port) : '';
    const remote = host ? isRemote(host) : false;
    body[block] = { saved: host, token_set: !!saved[`${block}_token`], remote, consented: host ? !remote || saved[`${block}_accept`] === true : false, source: host ? 'setting' : 'default', ...musicBackend.settingsBlock(block) };
  }
  return body;
}
const modeOf = (cfg) => cfg?.output?.mode ?? 'video';
// Who made a project: the `client:` of its scenes.yaml, `embedded` when it has none (the mock has no managed projects).
const CLIENT_RE = /^[a-z0-9-]{1,32}$/;
const clientOf = (id) => {
  const c = parse(db.projects[id]).value?.client;
  return typeof c === 'string' && CLIENT_RE.test(c) ? c : 'embedded';
};
// ?managed=include and ?client=a,b as the server reads them: anything else is a 400 (null when fine, else the answer).
const listQuery = (query) => {
  const m = query.get('managed');
  if (m !== null && m !== 'include') return err(400, 'invalid_request', 'managed: the only value is include');
  const c = query.get('client');
  if (c !== null && !c.split(',').every((n) => CLIENT_RE.test(n))) return err(400, 'invalid_request', 'client: a list of client names (or embedded, unknown) separated by commas');
  return null;
};
const wanted = (query) => {
  const c = query.get('client');
  const set = c === null ? null : new Set(c.split(','));
  return (id) => !set || set.has(clientOf(id));
};
// The summary of a project as the server builds it: id, name, mode and scene_count are always there (an unreadable project
// has the last three empty or 0), track_count only when the project has tracks.
const summary = (id) => {
  const { value, error } = parse(db.projects[id]);
  if (!value) return { id, name: '', mode: '', scene_count: 0, client: 'embedded', invalid: true, error };
  const s = { id, name: value.project ?? value.name ?? id, mode: modeOf(value), scene_count: (value.scenes ?? []).length, client: clientOf(id) };
  const tracks = (value.tracks ?? []).length;
  if (tracks) s.track_count = tracks;
  if (typeof value.adult === 'boolean') s.adult = value.adult;
  return s;
};

// ---------------------------------------------------------------- runs + SSE
const listeners = new Map(); // runId -> Set<res>
const timers = new Map(); // runId -> timeout handles
const ts = () => new Date().toISOString();
const sse = (res, event, data) => res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);
const emit = (run, ev) => {
  run.events.push(ev);
  for (const res of listeners.get(run.id) ?? []) sse(res, null, ev);
};
const setState = (run, state, extra = {}) => {
  run.state = state;
  if (state !== 'queued' && state !== 'running') run.finished_at = ts();
  Object.assign(run, extra);
  for (const res of listeners.get(run.id) ?? []) {
    sse(res, 'run-state', { id: run.id, state, ...extra });
    if (state !== 'queued' && state !== 'running') {
      res.write('event: stream-end\ndata: {}\n\n');
      res.end();
    }
  }
  save();
};
const publicRun = ({ events, ...r }) => r;

function simulate(run) {
  const cfg = parse(db.projects[run.project]).value ?? {};
  if (modeOf(cfg) === 'models3d') {
    return simulateModels(run, cfg, { db, ts, emit, setState, timers, step: 600 / SPEED, engineProblem: (name) => models3d.engineProblem(name), addGenerated: (info) => models3d.addGenerated(info), dropGenerated: (project, entry) => models3d.dropGenerated(project, entry) });
  }
  const music = modeOf(cfg) === 'music';
  const items = (music ? cfg.tracks : cfg.scenes) ?? [];
  const phases = music ? ['compose', 'synth', 'export'] : ['tts', 'render', 'clip'];
  const step = 600 / SPEED;
  let t = 0;
  const at = (ms, fn) => {
    const h = setTimeout(fn, (t += ms));
    timers.get(run.id).push(h);
  };
  timers.set(run.id, []);
  at(step, () => {
    setState(run, 'running');
    run.started_at = ts();
    emit(run, { timestamp: ts(), type: 'pipeline_start' });
  });
  for (const it of items.filter((i) => !run.only || i.id === run.only)) {
    for (const phase of phases) {
      at(step, () => emit(run, { timestamp: ts(), type: 'phase_start', scene_id: it.id, phase }));
      at(step * 2, () =>
        emit(run, {
          timestamp: ts(),
          type: 'phase_end',
          scene_id: it.id,
          phase,
          duration_ms: Math.round(step * 2),
          artifact: `tmp/${phase}_${it.id}.bin`,
        }),
      );
    }
  }
  const out = `out/${run.project}.${music ? 'mp3' : 'mp4'}`;
  at(step, () => {
    emit(run, { timestamp: ts(), type: 'pipeline_end', duration_ms: Math.round(t), artifact: out });
    setState(run, 'succeeded', { artifact: out });
  });
}

// ---------------------------------------------------------------- explicit handlers
const err = (status, code, message) => [status, { error: { code, message } }];
const noProject = (id) => err(404, 'not_found', `project "${id}" not found`);
/** The `descriptions` of an import as the contract takes them: plain `.scene.json` names, at most 20 files and 1 MB in all (`400` otherwise). */
const badDescriptions = (descriptions) => {
  if (descriptions === undefined) return null;
  if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) return err(400, 'invalid_request', 'descriptions: an object of files by name');
  const names = Object.keys(descriptions);
  if (names.length > 20) return err(400, 'invalid_request', 'descriptions: at most 20 files');
  const wrong = names.find((n) => !isSceneName(n));
  if (wrong) return err(400, 'invalid_request', `descriptions: "${wrong}" is not a plain .scene.json name`);
  if (Buffer.byteLength(JSON.stringify(descriptions)) > 1024 * 1024) return err(400, 'invalid_request', 'descriptions: at most 1 MB in all');
  return null;
};

/** What makes a confirm with 3D scenes `422` (and creates nothing): a description that does not pass, one no scene names, or a scene naming a file that is neither given nor already stored. */
const unsatisfiedScenes = (text, given) => {
  let named = [];
  try {
    const doc = yaml.load(text);
    named = [...(Array.isArray(doc?.scenes) ? doc.scenes : []), ...(Array.isArray(doc?.graphics) ? doc.graphics : [])].map((s) => s?.blender?.build).filter((n) => typeof n === 'string');
  } catch {
    return null;
  }
  for (const [name, d] of Object.entries(given)) {
    const problems = descriptionProblems(d, 5);
    if (problems.length) return err(422, 'validation_failed', `description ${name} does not pass: ${problems.join('; ')}`);
    if (!named.includes(name)) return err(422, 'validation_failed', `description ${name} is not named by any scene`);
  }
  const missing = named.find((n) => !given[n]);
  return missing ? err(422, 'validation_failed', `a scene names ${missing}, which is not in descriptions`) : null;
};

const RUN_MODES = ['video', 'images', 'music', 'models3d', 'animation'];
/** The modes a request asks for (`mode=video,models3d`), or a 400 that lists them. */
const modesOf = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const asked = raw.split(',').map((m) => m.trim());
  const bad = asked.find((m) => !RUN_MODES.includes(m));
  return bad === undefined ? new Set(asked) : { problem: err(400, 'invalid_request', `mode: "${bad}" is not a mode: ${RUN_MODES.slice(0, -1).join(', ')} or ${RUN_MODES.at(-1)}`) };
};
/** The mode of a run: its own, or its project's; the runs of a music-motion piece are the animations. */
const runModeOf = (r) => (r.project.startsWith('api-mm-') ? 'animation' : r.mode || modeOf(parse(db.projects[r.project] ?? '').value));

const badId = (id) => typeof id !== 'string' || !/^[\w][\w.-]*$/.test(id);

const hasActiveRun = (id) => db.runs.some((r) => r.project === id && ['queued', 'running'].includes(r.state));
// What the database keeps: versions of a definition, the song library with its stars and the playlists.
const musicBackend = musicBackendHandlers({ db, save, ts, speed: SPEED });
const database = databaseHandlers({ db, save, ts, parse, summary, clientOf, listQuery, wanted, hasActiveRun });
const { recordVersion } = database;
// The library of 3D models and the models of a project's sources (the piece's own are in music-motion.mjs).
const models3d = models3dHandlers({ db, save, speed: SPEED, fallback: (method, path) => generic(method, path), hasActiveRun });

const handlers = {
  'GET /api/health': () => [200, { status: 'ok' }],
  'GET /api/openapi.json': () => [200, spec],
  'POST /api/auth/ticket': () => [200, { ticket: randomBytes(12).toString('hex'), expiresAt: new Date(Date.now() + 6e5).toISOString() }],

  'GET /api/projects': ({ query, page }) => listQuery(query) ?? page(Object.keys(db.projects).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).filter(wanted(query)).map(summary), { search: ['id', 'name'], by: { updated_at: (p) => db.updated?.[p.id] ?? '' } }),
  'POST /api/projects': ({ body }) => {
    if (badId(body?.id)) return err(400, 'invalid_request', 'invalid project id');
    if (db.projects[body.id]) return err(409, 'conflict', `project "${body.id}" already exists`);
    if (body.client !== undefined && !(typeof body.client === 'string' && CLIENT_RE.test(body.client))) return err(422, 'unprocessable', 'client: not a valid client name');
    db.updated[body.id] = ts();
    db.projects[body.id] = `project: ${body.id}\n${body.client ? `client: ${body.client}\n` : ''}output:\n  mode: video\n  file: out/${body.id}.mp4\nscenes:\n  - id: scene1\n    prompt: Escena de ejemplo\n    tts_text: Hola.\n`;
    save();
    return [201, { id: body.id }];
  },
  'DELETE /api/projects/{id}': ({ params }) => {
    const managed = { 'api-gen-': 'generations', 'api-edit-': 'image-edits', 'api-vid-': 'video-edits' };
    const prefix = Object.keys(managed).find((p) => params.id.startsWith(p));
    if (prefix) return err(400, 'invalid_request', `a managed project is not deleted here: DELETE /api/${managed[prefix]}/${params.id}`);
    if (!db.projects[params.id]) return noProject(params.id);
    if (hasActiveRun(params.id)) return err(409, 'conflict', 'project has an active run');
    delete db.projects[params.id];
    save();
    return [204];
  },
  'POST /api/projects/{id}/duplicate': ({ params, body }) => {
    if (!db.projects[params.id]) return noProject(params.id);
    if (badId(body?.new_id)) return err(400, 'invalid_request', 'invalid new_id');
    if (db.projects[body.new_id]) return err(409, 'conflict', `project "${body.new_id}" already exists`);
    db.projects[body.new_id] = db.projects[params.id];
    db.updated[body.new_id] = ts();
    save();
    return [201, { id: body.new_id }];
  },
  'GET /api/projects/{id}/config': ({ params }) => {
    const text = db.projects[params.id];
    if (text === undefined) return noProject(params.id);
    const { value, error } = parse(text);
    // The real server answers its normalized struct: `defaults` is always an object, and so are the lists.
    if (value) {
      value.defaults ??= {};
      if (modeOf(value) === 'music') value.tracks ??= [];
      else if (modeOf(value) === 'models3d') value.models ??= [];
      else value.scenes ??= [];
    }
    return [200, value ? { yaml: text, parsed: value, valid: true } : { yaml: text, valid: false, error }];
  },
  'PUT /api/projects/{id}/config': ({ params, body }) => {
    if (!db.projects[params.id]) return noProject(params.id);
    if (typeof body?.yaml !== 'string') return err(400, 'invalid_request', 'yaml is required');
    const { value, error } = parse(body.yaml);
    if (!value || typeof value !== 'object') return err(422, 'validation_failed', `config: ${error || 'not a mapping'}`);
    const motion = motionConfigProblem(value, [...PARTS, ...Object.values(db.parts)]);
    if (motion) return err(422, 'validation_failed', `config: ${motion}`);
    const models = modelsProblem(value);
    if (models) return err(422, 'validation_failed', `config: ${models}`);
    recordVersion(params.id, db.projects[params.id], body.yaml, 'save');
    db.projects[params.id] = body.yaml;
    save();
    return [200, { saved: true, warnings: [], removed_clips: [] }];
  },

  'POST /api/projects/{id}/runs': ({ params, body }) => {
    if (!db.projects[params.id]) return noProject(params.id);
    const { error, value: launched } = parse(db.projects[params.id]);
    if (error) return err(422, 'validation_failed', error);
    const modelsIssue = modelsProblem(launched);
    if (modelsIssue) return err(422, 'validation_failed', `config: ${modelsIssue}`);
    const busy = db.runs.filter((r) => ['queued', 'running'].includes(r.state));
    const run = {
      id: randomUUID().slice(0, 8),
      project: params.id,
      state: 'queued',
      gpu: body?.gpu ?? '0',
      keep_tmp: !!body?.keep_tmp,
      force: !!body?.force,
      only: body?.only || undefined,
      vram_warn_mb: body?.vram_warn_mb ?? 2048,
      mode: body?.mode ?? modeOf(parse(db.projects[params.id]).value),
      created_at: ts(),
      result_available: true,
      events: [],
    };
    db.runs.unshift(run);
    // one run at a time, like a single GPU: queued runs start when the previous one ends
    if (busy.length === 0) simulate(run);
    else run.waiting = true;
    save();
    return [202, { run: publicRun(run), queue_position: busy.length, warnings: [] }];
  },
  'GET /api/runs': ({ query }) => {
    let list = db.runs;
    const modes = modesOf(query.get('mode'));
    if (modes?.problem) return modes.problem;
    if (modes) list = list.filter((r) => modes.has(runModeOf(r)));
    if (query.get('project')) list = list.filter((r) => r.project === query.get('project'));
    const limit = Number(query.get('limit')) || list.length;
    return [200, list.slice(0, limit).map(publicRun)];
  },
  'GET /api/runs/{id}': ({ params }) => {
    const r = db.runs.find((x) => x.id === params.id);
    return r ? [200, { run: publicRun(r), queue_position: 0 }] : err(404, 'not_found', 'run not found');
  },
  'DELETE /api/runs/{id}': ({ params }) => {
    const i = db.runs.findIndex((x) => x.id === params.id);
    if (i < 0) return err(404, 'not_found', 'run not found');
    if (['queued', 'running'].includes(db.runs[i].state)) return err(409, 'conflict', 'run is active');
    db.runs.splice(i, 1);
    save();
    return [204];
  },
  'POST /api/runs/{id}/cancel': ({ params }) => {
    const r = db.runs.find((x) => x.id === params.id);
    if (!r) return err(404, 'not_found', 'run not found');
    if (!['queued', 'running'].includes(r.state)) return err(409, 'conflict', 'run already finished');
    (timers.get(r.id) ?? []).forEach(clearTimeout);
    setState(r, 'cancelled');
    return [200, { run: publicRun(r) }];
  },
  'POST /api/runs/delete': ({ body }) => {
    const ids = new Set(body?.ids ?? []);
    const before = db.runs.length;
    db.runs = db.runs.filter((r) => !ids.has(r.id) || ['queued', 'running'].includes(r.state));
    save();
    return [200, { deleted: before - db.runs.length }];
  },

  'GET /api/settings': () => [200, settingsBody()],
  'PUT /api/settings': ({ body }) => {
    // db.settings keeps what the person saved, under the names of the request; the answer is built from it.
    // An empty text removes a setting, as on the server.
    const refused = musicBackend.checkSettings(body) ?? models3d.checkSettings(body);
    if (refused) return refused;
    const before = musicBackend.backendsBefore();
    const modelBackendBefore = db.settings.model3d_backend;
    for (const [key, value] of Object.entries(body ?? {})) {
      if (value === '' || value === null) delete db.settings[key];
      else db.settings[key] = value;
    }
    musicBackend.afterSettings(before, body);
    models3d.afterSettings(modelBackendBefore, body);
    save();
    return [200, settingsBody()];
  },
  'GET /api/environment': () => [200, fx.environment()],
  'GET /api/music/engines': () => {
    const base = fx.engines();
    for (const engine of musicBackend.ENGINES) base.engines[engine] = musicBackend.engineEntry(engine);
    base.engines.clap = musicBackend.clapEntry();
    return [200, base];
  },
  ...musicBackend.handlers,
  'GET /api/models/availability': () => [200, fx.availability()],
  'GET /api/assist/music-tags': () => [200, fx.musicTags()],
  // The dataset import (a JSON list of entries, or an HTML page with a list), read the way the server does for its two modes: the preview creates nothing,
  // the confirm creates the project and never overwrites an id.
  'POST /api/import/preview': ({ body }) => {
    const bad = badDescriptions(body?.descriptions);
    if (bad) return bad;
    if (body?.mode === 'models3d') {
      const models = readModelsDataset(String(body?.content ?? ''), { adultKept: process.env.MOCK_ADULT === '1' });
      if (models === null) return err(422, 'unprocessable', 'the file is not a JSON or HTML dataset');
      return models.refused ?? [200, models];
    }
    const read = fx.readDataset(String(body?.content ?? ''), body?.mode === 'music' ? 'music' : body?.mode === 'motion' ? 'motion' : 'video', body?.descriptions ?? {});
    return read ? [200, read] : err(422, 'unprocessable', 'the file is not a JSON or HTML dataset');
  },
  'POST /api/import/confirm': ({ body }) => {
    if (badId(body?.id)) return err(400, 'invalid_request', 'invalid project id');
    if (typeof body?.yaml !== 'string' || !body.yaml.trim()) return err(400, 'invalid_request', 'yaml is required');
    // as the real server: a scene that asks to animate needs the animation engine of the defaults, which the draft of an import leaves for the person to fill in
    const animated = /^ {2}- id: "?([^"\n]+)"?\n(?:(?! {2}- id:).*\n)*? {4}animate: true/m.exec(body.yaml);
    if (animated && !/^defaults:\n(?: {2}.*\n)*? {2}animate:/m.test(body.yaml)) return err(422, 'validation_failed', `config: scene "${animated[1]}" has animate: true but defaults.animate is not set`);
    if (db.projects[body.id]) return err(409, 'conflict', `project "${body.id}" already exists`);
    const imported = parse(body.yaml).value;
    const modelsIssue = imported ? modelsProblem(imported) : null;
    if (modelsIssue) return err(422, 'validation_failed', `config: ${modelsIssue}`);
    // a picture an entry names has to be in the project's sources, which an import cannot carry: a new project is refused with it
    const missingPicture = (imported?.models ?? []).findIndex((m) => typeof m?.image === 'string');
    if (missingPicture >= 0) return err(422, 'validation_failed', `config: models[${missingPicture}].image: "${imported.models[missingPicture].image}" is not in the project's sources`);
    // the 3D scenes the YAML names: written to sources/ before it is validated, and nothing is created when one does not pass
    const badFiles = badDescriptions(body.descriptions) ?? unsatisfiedScenes(body.yaml, body.descriptions ?? {});
    if (badFiles) return badFiles;
    if (body.descriptions) Object.assign(filesOf(body.id), body.descriptions);
    db.projects[body.id] = body.yaml;
    db.updated[body.id] = ts();
    save();
    return [201, { id: body.id }];
  },
  'GET /api/assets': () => [200, fx.assets()],
  'GET /api/assets/catalog': () => [200, fx.catalog()],
  'GET /api/downloads': () => [200, { downloads: db.downloads }],
  'GET /api/storage': ({ query }) => listQuery(query) ?? [200, fx.storage(Object.keys(db.projects).filter(wanted(query)), clientOf)],
  'GET /api/projects/{id}/storage': () => [200, fx.projectStorage()],
  'GET /api/stats': ({ query }) => {
    const modes = modesOf(query.get('mode'));
    if (modes?.problem) return modes.problem;
    return [200, fx.stats(modes ? db.runs.filter((r) => modes.has(runModeOf(r))) : db.runs)];
  },
  'GET /api/runs/{id}/resources': () => [200, fx.runResources()],
  'GET /api/settings/monitoring': () => [200, fx.monitoring()],
  'GET /api/settings/database': () => [200, fx.database()],
  ...database.handlers,
  ...dataHandlers({ db, save, ts, speed: SPEED }).handlers,
  ...catalogHandlers({ db, save, ts }).handlers,
  ...generationHandlers({ db, save, ts, speed: SPEED }),
  ...videoEditHandlers({ db, save, ts, speed: SPEED }),
  ...motionPageHandlers({ db }),
  ...blenderDescriptionHandlers({ db }),
  ...datasetAssistHandlers({ db }),
  ...models3d.handlers,
  ...musicMotionHandlers({ db, save, ts, speed: SPEED, models3d }),
};

// Queued runs start as soon as the active one ends (checked every 300 ms).
setInterval(() => {
  if (db.runs.some((r) => r.state === 'running' || (r.state === 'queued' && !r.waiting))) return;
  const next = [...db.runs].reverse().find((r) => r.state === 'queued' && r.waiting);
  if (next) {
    next.waiting = false;
    simulate(next);
  }
}, 300).unref();

// ---------------------------------------------------------------- generic responses from the spec
const resolveRef = (s) => {
  let guard = 0;
  while (s?.$ref && guard++ < 20) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
function example(schema, depth = 0) {
  const s = resolveRef(schema);
  if (!s || depth > 5) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => example(x, depth + 1)));
  if (s.oneOf || s.anyOf) return example((s.oneOf ?? s.anyOf)[0], depth + 1);
  switch (s.type) {
    case 'string':
      return s.format === 'date-time' ? ts() : '';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    default: {
      const out = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = example(v, depth + 1);
      return out;
    }
  }
}
function genFor(method, path) {
  const op = spec.paths[path]?.[method.toLowerCase()];
  const codes = Object.keys(op?.responses ?? {}).filter((c) => c.startsWith('2')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const code = codes[0] ?? '200';
  const res = resolveRef(op?.responses?.[code]);
  const json = res?.content?.['application/json']?.schema;
  return json ? example(json) : undefined;
}
function generic(method, path) {
  const op = spec.paths[path]?.[method.toLowerCase()];
  const codes = Object.keys(op?.responses ?? {}).filter((c) => c.startsWith('2')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const code = Number(codes[0] ?? 200);
  const res = resolveRef(op.responses?.[codes[0]]);
  if (res?.content?.['text/event-stream']) return [200, '', 'text/event-stream'];
  const body = genFor(method, path);
  return body === undefined ? [code] : [code, body];
}

// ---------------------------------------------------------------- routing
const routes = Object.keys(spec.paths).map((p) => {
  const names = [];
  const re = new RegExp('^' + p.replace(/\{(\w+)\}/g, (_, n) => (names.push(n), '([^/]+)')).replace(/\/\{path\}$/, '') + '$');
  return { path: p, re, names, wildcard: p.endsWith('{path}') };
});
// A path with a literal segment wins over one with a parameter in its place (`/sources/model` over `/sources/{name}`), whatever the order of the contract.
const specific = [...routes].sort((a, b) => Number(a.wildcard) - Number(b.wildcard) || (a.names.length > b.names.length ? 1 : a.names.length < b.names.length ? -1 : 0));
function match(pathname) {
  for (const r of specific) {
    if (r.wildcard) {
      const base = r.path.replace('{path}', '').replace(/\{(\w+)\}/g, '([^/]+)');
      const m = new RegExp('^' + base + '(.+)$').exec(pathname);
      if (m) {
        const names = [...r.path.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
        return { path: r.path, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
      }
      continue;
    }
    const m = r.re.exec(pathname);
    if (m) return { path: r.path, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  // A browser dashboard on another origin reads the page headers and the name of a download only if they are exposed.
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, Link, Content-Disposition');
};
const readBody = (req) =>
  new Promise((ok) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const type = req.headers['content-type'] ?? '';
      if (type.includes('json')) {
        try {
          return ok(JSON.parse(raw.toString() || 'null'));
        } catch {
          return ok(undefined);
        }
      }
      ok(raw.length ? { raw: raw.toString('latin1'), buffer: raw, type } : undefined);
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, 'http://x'); // NOSONAR: only a base to parse the path and the query; nothing is requested
  const log = (code) => console.log(`${req.method} ${url.pathname}${url.search} -> ${code}`);
  const send = (status, body, type = 'application/json', headers = {}) => {
    log(status);
    if (body === undefined) return res.writeHead(status, headers).end();
    res.writeHead(status, { 'Content-Type': type, ...headers });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  if (!url.pathname.startsWith('/api/')) return send(404, ...err(404, 'not_found', 'mock server only serves /api').slice(1));
  if (LATENCY) await sleep(LATENCY);

  const hit = match(url.pathname);
  if (!hit) return send(...err(404, 'not_found', `no such endpoint: ${url.pathname}`));
  const op = spec.paths[hit.path][req.method.toLowerCase()];
  if (!op) return send(...err(405, 'method_not_allowed', `${req.method} not allowed on ${hit.path}`));

  const open = url.pathname === '/api/health' || (op.security && op.security.length === 0);
  if (TOKEN && !open) {
    // a ticket replaces the token only on the routes whose contract lists it (`security: - ticket: []`), as the real server does
    const ticketOk = !!url.searchParams.get('ticket') && (op.security ?? []).some((s) => 'ticket' in s);
    const ok = req.headers.authorization === `Bearer ${TOKEN}` || ticketOk;
    if (!ok) return send(...err(401, 'unauthorized', 'missing or invalid token'));
  }

  // SSE of a run
  if (req.method === 'GET' && hit.path === '/api/runs/{id}/events') {
    const run = db.runs.find((r) => r.id === hit.params.id);
    if (!run) return send(...err(404, 'not_found', 'run not found'));
    log('200 (sse)');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    for (const ev of run.events) sse(res, null, ev);
    sse(res, 'run-state', { id: run.id, state: run.state, ...(run.artifact ? { artifact: run.artifact } : {}) });
    if (run.state !== 'queued' && run.state !== 'running') {
      res.write('event: stream-end\ndata: {}\n\n');
      return res.end();
    }
    if (!listeners.has(run.id)) listeners.set(run.id, new Set());
    listeners.get(run.id).add(res);
    req.on('close', () => listeners.get(run.id)?.delete(res));
    return;
  }

  // SSE of an install of a music engine
  if (req.method === 'GET' && hit.path === '/api/music/installs/{id}/events') {
    const job = musicBackend.find(hit.params.id);
    if (!job) return send(...err(404, 'not_found', `install "${hit.params.id}" not found`));
    log('200 (sse)');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    return musicBackend.stream(job, res);
  }

  // What the model chose for a scene made with `auto`: the record exists once a run of the project has ended.
  const choice = hit.path.endsWith('/artifacts/{path}') ? /^\/api\/projects\/([^/]+)\/artifacts\/motion\/([^/]+)\.choice\.json$/.exec(url.pathname) : null;
  if (choice) {
    const [, projectId, sceneId] = choice;
    const made = db.projects[projectId] !== undefined && db.runs.some((r) => r.project === projectId && r.state === 'succeeded') ? motionChoice(parse(db.projects[projectId]).value, decodeURIComponent(sceneId)) : null;
    return made ? send(200, made) : send(...err(404, 'not_found', 'no record of a choice for that scene'));
  }

  // The 3D scene a generation of the option blender was made from: its description, as the input the generation lists.
  const scene = hit.path.endsWith('/artifacts/{path}') ? /^\/api\/projects\/([^/]+)\/artifacts\/sources\/[^/]+\.scene\.json$/.exec(url.pathname) : null;
  if (scene && db.generations[scene[1]]?.scene) return send(200, db.generations[scene[1]].scene);

  // What a run of a 3D models project left: the models and the manifest of `out/<project>/`.
  const made = hit.path.endsWith('/artifacts/{path}') ? /^\/api\/projects\/([^/]+)\/artifacts\/out\/([^/]+)\/([^/]+)$/.exec(url.pathname) : null;
  if (made && outFiles(db, made[1]).includes(decodeURIComponent(made[3])) && made[1] === made[2]) {
    const name = decodeURIComponent(made[3]);
    if (name === 'manifest.json') return send(200, manifestOf(db, made[1]));
    const model = db.models3dOut[made[1]].models.find((m) => m.file.endsWith(`/${name}`));
    const data = makeGlb({ triangles: Math.min(model.triangles, 5000) });
    log(200);
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': data.length, 'Content-Disposition': `attachment; filename="${name}"` });
    return res.end(data);
  }

  if (hit.path.endsWith('/artifacts/{path}')) {
    const ext = (url.pathname.match(/\.([a-z0-9]+)$/i) ?? [])[1]?.toLowerCase() ?? '';
    const file = { png: 'png', jpg: 'png', jpeg: 'png', webp: 'png', gif: 'png', mp4: 'mp4', webm: 'mp4', mov: 'mp4', mp3: 'mp3', wav: 'mp3', ogg: 'mp3', flac: 'mp3', m4a: 'mp3' }[ext];
    if (!file) return send(...err(404, 'not_found', 'the mock server only has placeholder pictures, videos and songs'));
    const type = { png: 'image/png', mp4: 'video/mp4', mp3: 'audio/mpeg' }[file];
    // The finished pieces of the animation dataset play the sample video; every other video is the placeholder.
    const data = isSampleVideo(url.pathname) ? readFileSync(SAMPLE_VIDEO_FILE) : readFileSync(resolve(here, `assets/placeholder.${file}`));
    log(200);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Accept-Ranges': 'none' });
    return res.end(data);
  }

  // The preview of a motion of the library is a small video: the placeholder one, once the motion exists.
  if (hit.path === '/api/motions/{id}/preview') {
    if (!db.motions?.[hit.params.id]) return send(...err(404, 'not_found', `motion "${hit.params.id}" not found`));
    const data = readFileSync(resolve(here, 'assets/placeholder.mp4'));
    log(200);
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': data.length, 'Accept-Ranges': 'none' });
    return res.end(data);
  }

  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : undefined;
  const h = handlers[`${req.method} ${hit.path}`];
  const page = pager(spec, op, url);
  let out = h ? await h({ params: hit.params, query: url.searchParams, body, page, url, headers: req.headers }) : generic(req.method, hit.path);
  // A list the mock has no data for answers an empty page (validated, with its headers) when it was asked for one.
  if (!h && req.method === 'GET' && isPaged(spec, op) && Array.isArray(out[1])) out = page(out[1]);
  send(...out);
}).listen(PORT, HOST, () => {
  console.log(`mock Veritmo API on http://${HOST}:${PORT}  (${Object.keys(spec.paths).length} paths from openapi.yaml)`);
  console.log(`projects: ${Object.keys(db.projects).join(', ')}${TOKEN ? '  [token required]' : ''}${PERSIST ? `  [persist: ${PERSIST}]` : ''}`);
});

// Stopped by a signal, the mock leaves through `process.exit`: that is when Node writes the coverage of this process, and the tests start the
// mock as a child, so without it everything they run here would count as untested.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
