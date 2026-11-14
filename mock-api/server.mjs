#!/usr/bin/env node
// Standalone mock of the `orchestrator serve` HTTP API, so the dashboard can be
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
import { musicMotionHandlers, PARTS, SAMPLE_VIDEO_FILE, isSampleVideo, seedSample } from './music-motion.mjs';
import { motionChoice, motionConfigProblem } from './motion-scenes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg('port', process.env.MOCK_PORT ?? 4667));
const HOST = arg('host', '127.0.0.1');
const LATENCY = Number(arg('latency', 0));
const TOKEN = arg('token', process.env.ORCHESTRATOR_TOKEN ?? '');
const PERSIST = arg('persist', '');
const SPEED = Number(arg('speed', 1)); // >1 = faster simulated runs

const SPEC = arg('spec', resolve(here, '../contract/openapi.yaml'));
const specText = /^https?:\/\//.test(SPEC) ? await (await fetch(SPEC)).text() : readFileSync(SPEC, 'utf8');
// JSON is YAML too, so the same loader reads the openapi.yaml and a server's /api/openapi.json.
export const spec = yaml.load(specText);

// ---------------------------------------------------------------- state
const db = {
  projects: { demo: fx.SEED_VIDEO, 'demo-musica': fx.SEED_MUSIC },
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
  for (const [block, port] of [['heartmula', 8787], ['diffrhythm2', 8788]]) {
    const host = saved[`${block}_host`] ? address(saved[`${block}_host`], port) : '';
    const remote = host ? isRemote(host) : false;
    body[block] = { saved: host, token_set: !!saved[`${block}_token`], remote, consented: host ? !remote || saved[`${block}_accept`] === true : false };
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
const badId = (id) => typeof id !== 'string' || !/^[\w][\w.-]*$/.test(id);

const handlers = {
  'GET /api/health': () => [200, { status: 'ok' }],
  'GET /api/openapi.json': () => [200, spec],
  'POST /api/auth/ticket': () => [200, { ticket: randomBytes(12).toString('hex'), expiresAt: new Date(Date.now() + 6e5).toISOString() }],

  'GET /api/projects': ({ query }) => listQuery(query) ?? [200, Object.keys(db.projects).sort().filter(wanted(query)).map(summary)],
  'POST /api/projects': ({ body }) => {
    if (badId(body?.id)) return err(400, 'invalid_request', 'invalid project id');
    if (db.projects[body.id]) return err(409, 'conflict', `project "${body.id}" already exists`);
    if (body.client !== undefined && !(typeof body.client === 'string' && CLIENT_RE.test(body.client))) return err(422, 'unprocessable', 'client: not a valid client name');
    db.projects[body.id] = `project: ${body.id}\n${body.client ? `client: ${body.client}\n` : ''}output:\n  mode: video\n  file: out/${body.id}.mp4\nscenes:\n  - id: scene1\n    prompt: Escena de ejemplo\n    tts_text: Hola.\n`;
    save();
    return [201, { id: body.id }];
  },
  'DELETE /api/projects/{id}': ({ params }) => {
    const managed = { 'api-gen-': 'generations', 'api-edit-': 'image-edits', 'api-vid-': 'video-edits' };
    const prefix = Object.keys(managed).find((p) => params.id.startsWith(p));
    if (prefix) return err(400, 'invalid_request', `a managed project is not deleted here: DELETE /api/${managed[prefix]}/${params.id}`);
    if (!db.projects[params.id]) return noProject(params.id);
    if (db.runs.some((r) => r.project === params.id && ['queued', 'running'].includes(r.state))) return err(409, 'conflict', 'project has an active run');
    delete db.projects[params.id];
    save();
    return [204];
  },
  'POST /api/projects/{id}/duplicate': ({ params, body }) => {
    if (!db.projects[params.id]) return noProject(params.id);
    if (badId(body?.new_id)) return err(400, 'invalid_request', 'invalid new_id');
    if (db.projects[body.new_id]) return err(409, 'conflict', `project "${body.new_id}" already exists`);
    db.projects[body.new_id] = db.projects[params.id];
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
    db.projects[params.id] = body.yaml;
    save();
    return [200, { saved: true, warnings: [], removed_clips: [] }];
  },

  'POST /api/projects/{id}/runs': ({ params, body }) => {
    if (!db.projects[params.id]) return noProject(params.id);
    const { error } = parse(db.projects[params.id]);
    if (error) return err(422, 'validation_failed', error);
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
    for (const [key, value] of Object.entries(body ?? {})) {
      if (value === '' || value === null) delete db.settings[key];
      else db.settings[key] = value;
    }
    save();
    return [200, settingsBody()];
  },
  'GET /api/environment': () => [200, fx.environment()],
  'GET /api/music/engines': () => [200, fx.engines()],
  'GET /api/routing': () => [200, fx.routing()],
  'GET /api/models/availability': () => [200, fx.availability()],
  'GET /api/assist/music-tags': () => [200, fx.musicTags()],
  // The dataset import (a JSON list of entries, or an HTML page with a list), read the way the server does for its two modes: the preview creates nothing,
  // the confirm creates the project and never overwrites an id.
  'POST /api/import/preview': ({ body }) => {
    const read = fx.readDataset(String(body?.content ?? ''), body?.mode === 'music' ? 'music' : 'video');
    return read ? [200, read] : err(422, 'unprocessable', 'the file is not a JSON or HTML dataset');
  },
  'POST /api/import/confirm': ({ body }) => {
    if (badId(body?.id)) return err(400, 'invalid_request', 'invalid project id');
    if (typeof body?.yaml !== 'string' || !body.yaml.trim()) return err(400, 'invalid_request', 'yaml is required');
    // as the real server: a scene that asks to animate needs the animation engine of the defaults, which the draft of an import leaves for the person to fill in
    const animated = /^ {2}- id: "?([^"\n]+)"?\n(?:(?! {2}- id:).*\n)*? {4}animate: true/m.exec(body.yaml);
    if (animated && !/^defaults:\n(?: {2}.*\n)*? {2}animate:/m.test(body.yaml)) return err(422, 'validation_failed', `config: scene "${animated[1]}" has animate: true but defaults.animate is not set`);
    if (db.projects[body.id]) return err(409, 'conflict', `project "${body.id}" already exists`);
    db.projects[body.id] = body.yaml;
    save();
    return [201, { id: body.id }];
  },
  'GET /api/providers': () => [200, fx.providers()],
  'GET /api/assets': () => [200, fx.assets()],
  'GET /api/assets/catalog': () => [200, fx.catalog()],
  'GET /api/downloads': () => [200, { downloads: db.downloads }],
  'GET /api/storage': ({ query }) => listQuery(query) ?? [200, fx.storage(Object.keys(db.projects).filter(wanted(query)), clientOf)],
  'GET /api/projects/{id}/storage': () => [200, fx.projectStorage()],
  'GET /api/library': ({ query }) => listQuery(query) ?? [200, fx.library(wanted(query), clientOf)],
  'GET /api/stats': () => [200, fx.stats(db.runs)],
  'GET /api/runs/{id}/resources': () => [200, fx.runResources()],
  'GET /api/settings/monitoring': () => [200, fx.monitoring()],
  'GET /api/settings/database': () => [200, fx.database()],
  ...generationHandlers({ db, save, ts, speed: SPEED }),
  ...videoEditHandlers({ db, save, ts, speed: SPEED }),
  ...musicMotionHandlers({ db, save, ts, speed: SPEED }),
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
  const codes = Object.keys(op?.responses ?? {}).filter((c) => c.startsWith('2')).sort();
  const code = codes[0] ?? '200';
  const res = resolveRef(op?.responses?.[code]);
  const json = res?.content?.['application/json']?.schema;
  return json ? example(json) : undefined;
}
function generic(method, path) {
  const op = spec.paths[path]?.[method.toLowerCase()];
  const codes = Object.keys(op?.responses ?? {}).filter((c) => c.startsWith('2')).sort();
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
function match(pathname) {
  for (const r of routes) {
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
  const url = new URL(req.url, 'http://x');
  const log = (code) => console.log(`${req.method} ${url.pathname}${url.search} -> ${code}`);
  const send = (status, body, type = 'application/json') => {
    log(status);
    if (body === undefined) return res.writeHead(status).end();
    res.writeHead(status, { 'Content-Type': type });
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
    const ok = req.headers.authorization === `Bearer ${TOKEN}` || !!url.searchParams.get('ticket');
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

  // What the model chose for a scene made with `auto`: the record exists once a run of the project has ended.
  const choice = hit.path.endsWith('/artifacts/{path}') ? /^\/api\/projects\/([^/]+)\/artifacts\/motion\/([^/]+)\.choice\.json$/.exec(url.pathname) : null;
  if (choice) {
    const [, projectId, sceneId] = choice;
    const made = db.projects[projectId] !== undefined && db.runs.some((r) => r.project === projectId && r.state === 'succeeded') ? motionChoice(parse(db.projects[projectId]).value, decodeURIComponent(sceneId)) : null;
    return made ? send(200, made) : send(...err(404, 'not_found', 'no record of a choice for that scene'));
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
  const out = h ? h({ params: hit.params, query: url.searchParams, body }) : generic(req.method, hit.path);
  send(...out);
}).listen(PORT, HOST, () => {
  console.log(`mock orchestrator API on http://${HOST}:${PORT}  (${Object.keys(spec.paths).length} paths from openapi.yaml)`);
  console.log(`projects: ${Object.keys(db.projects).join(', ')}${TOKEN ? '  [token required]' : ''}${PERSIST ? `  [persist: ${PERSIST}]` : ''}`);
});
