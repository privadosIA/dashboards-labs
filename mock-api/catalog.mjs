// The records the server keeps that a person edits one by one, simulated: the prompt presets, the providers with the
// routing of the tasks to them, and the blocks of HyperFrames. A write changes the next read and the documented errors
// answer (`403` for a bundled preset, `409` naming the task that still uses a provider, `404`). State: `db.prompts` (by
// id), `db.providers` (the saved ones; the built-in `ollama` comes from the fixtures), `db.routing` (task → provider id),
// `db.acknowledged` (remote providers the person accepted) and `db.blocks` (by name).
import { randomBytes } from 'node:crypto';
import * as fx from './fixtures.mjs';

const err = (status, code, message) => [status, { error: { code, message } }];
const slug = (text, max) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max);
const isRemote = (url) => !/^https?:\/\/(localhost|127\.[\d.]+|\[?::1\]?)(:|\/|$)/.test(url);

const KINDS = ['image', 'video', 'motion', 'music', 'animation', 'model3d'];
const MAX_PROMPT = 2000;
const MAX_TAGS = 20;

const SEED_PROMPTS = [
  { id: 'bundled-neon-street', kind: 'image', title: 'Neon street at night', prompt: 'a rainy neon street at night, reflections on the asphalt, cinematic', tags: ['city', 'night', 'neon'], source: 'hf:prompt-dataset', licence: 'CC0-1.0', own: false, created_at: '2026-10-01T09:00:00Z' },
  { id: 'bundled-slow-pan', kind: 'video', title: 'Slow pan over a valley', prompt: 'a slow pan over a green valley at sunrise, mist between the hills', tags: ['landscape', 'sunrise'], source: 'hf:prompt-dataset', licence: 'CC0-1.0', own: false, created_at: '2026-10-02T09:00:00Z' },
  { id: 'mine-dream-pop', kind: 'music', title: 'Dream pop, soft', prompt: 'dream pop, soft female vocal, slow tempo, warm synths', tags: ['pop', 'dream'], source: 'user', own: true, created_at: '2026-11-03T09:00:00Z' },
];

const SEED_BLOCKS = [
  { name: 'lower-third', title: 'Lower third', description: 'A name and a role that slide in at the bottom', tags: ['title', 'text'], license: 'Apache-2.0', width: 1920, height: 1080, duration: 4, state: 'ok', origin: { url: 'https://registry.example/hyperframes/lower-third', version: '1.2.0' }, thumbnail: '/api/hyperframes/blocks/lower-third/thumbnail' },
  { name: 'confetti-burst', title: 'Confetti burst', description: 'Confetti that falls from the top', tags: ['celebration'], license: 'MIT', width: 1920, height: 1080, duration: 3, state: 'needs-files', problems: ['the registry lists files it does not ship: confetti.js'], origin: { url: 'https://registry.example/hyperframes/confetti-burst' }, thumbnail: '/api/hyperframes/blocks/confetti-burst/thumbnail' },
  { name: 'grid-wipe', title: 'Grid wipe', description: 'A transition made of squares', tags: ['transition'], license: 'Apache-2.0 AND MIT', width: 1920, height: 1080, duration: 2, state: 'ok', kind: 'component', family: 'transitions', origin: { url: 'https://registry.example/hyperframes/grid-wipe', version: '0.9.1' }, thumbnail: '/api/hyperframes/blocks/grid-wipe/thumbnail' },
  { name: 'broken-demo', title: 'A demo that fails', description: 'Its checks fail', tags: ['demo'], license: 'MIT', width: 1280, height: 720, duration: 5, state: 'failed', problems: ['the demo throws at 1.2 s (simulated)'], origin: { url: 'https://registry.example/hyperframes/broken-demo' }, thumbnail: '/api/hyperframes/blocks/broken-demo/thumbnail' },
];

const PRESETS = {
  anthropic: { name: 'Anthropic', type: 'openai', base_url: 'https://api.anthropic.com/v1', text_model: 'claude-sonnet-5-5', vision_model: 'claude-sonnet-5-5' },
  gemini: { name: 'Gemini', type: 'openai', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', text_model: 'gemini-2.5-flash', vision_model: 'gemini-2.5-flash' },
  openrouter: { name: 'OpenRouter', type: 'openai', base_url: 'https://openrouter.ai/api/v1', text_model: 'openai/gpt-4o-mini', vision_model: 'openai/gpt-4o-mini' },
  openai: { name: 'OpenAI', type: 'openai', base_url: 'https://api.openai.com/v1', text_model: 'gpt-4o-mini', vision_model: 'gpt-4o-mini' },
};

export function catalogHandlers({ db, save, ts }) {
  if (!db.prompts) db.prompts = Object.fromEntries(SEED_PROMPTS.map((p) => [p.id, p]));
  db.providers ??= [];
  db.routing ??= {};
  db.acknowledged ??= [];
  if (!db.blocks) db.blocks = Object.fromEntries(SEED_BLOCKS.map((b) => [b.name, b]));

  // ------------------------------------------------------------ prompts
  /** A preset as a request writes it, checked as the server does (`400` for a bad value). */
  function readPreset(body, current) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: err(400, 'invalid_request', 'invalid JSON body') };
    const kind = body.kind ?? current?.kind;
    if (!KINDS.includes(kind)) return { error: err(400, 'invalid_request', `kind: one of ${KINDS.join(', ')}`) };
    if (current && body.kind !== undefined && body.kind !== current.kind) return { error: err(400, 'invalid_request', 'kind cannot be changed') };
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return { error: err(400, 'invalid_request', 'prompt is required') };
    if (body.prompt.length > MAX_PROMPT) return { error: err(400, 'invalid_request', `prompt: up to ${MAX_PROMPT} characters`) };
    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 200)) return { error: err(400, 'invalid_request', 'title: up to 200 characters') };
    const tags = body.tags ?? [];
    if (!Array.isArray(tags) || tags.length > MAX_TAGS || tags.some((t) => typeof t !== 'string')) return { error: err(400, 'invalid_request', `tags: up to ${MAX_TAGS} texts`) };
    const out = { kind, prompt: body.prompt, tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] };
    for (const key of ['title', 'negative', 'engine', 'language']) if (typeof body[key] === 'string' && body[key]) out[key] = body[key];
    if (typeof body.nsfw === 'boolean') out.nsfw = body.nsfw;
    return { value: out };
  }
  const noPrompt = (id) => err(404, 'not_found', `prompt "${id}" not found`);
  const bestMatch = (p, q) => (String(p.title ?? '').toLowerCase().includes(q) ? 3 : p.tags.some((t) => t.includes(q)) ? 2 : 1);

  // ------------------------------------------------------------ providers and routing
  const builtin = () => fx.providers().providers[0];
  const providerView = (p) => {
    const { key, ...view } = p;
    return { ...view, builtin: false, remote: isRemote(p.base_url), key_set: !!p.key_set, lists_models: p.lists_models ?? true };
  };
  const allProviders = () => [builtin(), ...db.providers.map(providerView)];
  const providerOf = (id) => allProviders().find((p) => p.id === id);
  const noProvider = (id) => err(404, 'not_found', `provider "${id}" not found`);
  const tasksOn = (id) => Object.entries(db.routing).filter(([, p]) => p === id).map(([task]) => task);
  function routingView() {
    const base = fx.routing();
    for (const task of Object.keys(base.routing)) {
      const p = db.routing[task] && providerOf(db.routing[task]);
      if (p) base.routing[task] = { provider: p.id, name: p.name, remote: p.remote, consented: !p.remote || db.acknowledged.includes(p.id), model: p.text_model };
    }
    if (db.maxCalls) base.max_calls = db.maxCalls;
    return base;
  }
  function readProvider(body, current) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: err(400, 'invalid_request', 'invalid JSON body') };
    let given = body;
    if (!current && body.preset !== undefined) {
      const preset = PRESETS[body.preset];
      if (!preset) return { error: err(400, 'invalid_request', `preset: unknown; the known ones are ${Object.keys(PRESETS).join(', ')}`) };
      given = { ...preset, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
    }
    const merged = { ...current, ...given };
    if (!current && !(merged.name && merged.type && merged.base_url)) return { error: err(400, 'invalid_request', 'without a preset, name, type and base_url are required') };
    if (merged.name !== undefined && (typeof merged.name !== 'string' || !merged.name.trim() || merged.name.length > 60)) return { error: err(400, 'invalid_request', 'name: 1 to 60 characters') };
    if (!['ollama', 'openai'].includes(merged.type)) return { error: err(400, 'invalid_request', 'type: ollama or openai') };
    if (typeof merged.base_url !== 'string' || !/^https?:\/\/[^\s?#@]+$/.test(merged.base_url)) return { error: err(400, 'invalid_request', 'base_url: an http or https address with no credentials, query or fragment') };
    for (const key of ['text_model', 'vision_model']) if (merged[key] !== undefined && (typeof merged[key] !== 'string' || merged[key].length > 200)) return { error: err(400, 'invalid_request', `${key}: up to 200 characters`) };
    if (body.key !== undefined && (typeof body.key !== 'string' || body.key.length > 500 || /\s/.test(body.key))) return { error: err(400, 'invalid_request', 'key: up to 500 characters, no spaces') };
    const out = { id: current?.id, name: merged.name.trim(), type: merged.type, base_url: merged.base_url.replace(/\/$/, ''), text_model: merged.text_model ?? '', vision_model: merged.vision_model ?? '', lists_models: merged.lists_models ?? true };
    if (merged.preset) out.preset = merged.preset;
    // an absent key leaves it, an empty one removes it, any other saves it (the mock keeps only that there is one)
    out.key_set = body.key === undefined ? !!current?.key_set : body.key !== '';
    if (current?.base_url !== out.base_url) {
      // a change of address forgets the acknowledgement and the last test, as the contract says for `tested_at`
      db.acknowledged = db.acknowledged.filter((id) => id !== current?.id);
    }
    return { value: out };
  }

  // ------------------------------------------------------------ blocks
  const blockView = ({ detail, ...b }) => b;
  const noBlock = (name) => err(404, 'not_found', `block "${name}" not found`);

  const handlers = {
    'GET /api/prompts': ({ query, page }) => {
      const kind = query.get('kind');
      if (kind !== null && !KINDS.includes(kind)) return err(400, 'invalid_request', `kind: one of ${KINDS.join(', ')}`);
      const tags = query.get('tags') ? query.get('tags').split(',').map((t) => t.trim().toLowerCase()) : [];
      const items = Object.values(db.prompts).filter((p) => (!kind || p.kind === kind) && tags.every((t) => (p.tags ?? []).includes(t)));
      const own = (p) => ({ ...p, tags: p.tags ?? [] });
      return page(items.map(own), {
        always: true,
        limitDefault: 50,
        limitMax: 200,
        search: ['title', 'prompt', (p) => p.tags.join(' ')],
        rank: bestMatch,
        fallback: { field: 'created_at', reverse: true },
        wrap: (list, total) => ({ items: list, total }),
      });
    },
    'POST /api/prompts': ({ body }) => {
      const r = readPreset(body);
      if (r.error) return r.error;
      const id = `own-${randomBytes(4).toString('hex')}`;
      const preset = { id, ...r.value, source: 'user', own: true, created_at: ts() };
      db.prompts[id] = preset;
      save();
      return [201, preset];
    },
    'GET /api/prompts/{id}': ({ params }) => (db.prompts[params.id] ? [200, { ...db.prompts[params.id], tags: db.prompts[params.id].tags ?? [] }] : noPrompt(params.id)),
    'PUT /api/prompts/{id}': ({ params, body }) => {
      const current = db.prompts[params.id];
      if (!current) return noPrompt(params.id);
      if (!current.own) return err(403, 'forbidden', 'a bundled preset is read-only');
      const r = readPreset(body, current);
      if (r.error) return r.error;
      // its id, origin and date stay
      const next = { id: current.id, source: current.source, created_at: current.created_at, own: true, ...r.value };
      db.prompts[params.id] = next;
      save();
      return [200, next];
    },
    'DELETE /api/prompts/{id}': ({ params }) => {
      const current = db.prompts[params.id];
      if (!current) return noPrompt(params.id);
      if (!current.own) return err(403, 'forbidden', 'a bundled preset is read-only');
      delete db.prompts[params.id];
      save();
      return [204];
    },

    'GET /api/providers': () => [200, { providers: allProviders() }],
    'POST /api/providers': ({ body }) => {
      const r = readProvider(body);
      if (r.error) return r.error;
      const id = (typeof body.id === 'string' && body.id) || slug(r.value.name, 40);
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) return err(400, 'invalid_request', 'id: lowercase letters, digits and hyphens, up to 40');
      if (providerOf(id)) return err(400, 'invalid_request', `provider "${id}" already exists`);
      db.providers.push({ ...r.value, id });
      save();
      return [201, providerOf(id)];
    },
    'GET /api/providers/{id}': ({ params }) => {
      const p = providerOf(params.id);
      return p ? [200, p] : noProvider(params.id);
    },
    'PUT /api/providers/{id}': ({ params, body }) => {
      const current = providerOf(params.id);
      if (!current) return noProvider(params.id);
      if (current.builtin) return err(400, 'invalid_request', 'the built-in provider is not edited here: change the Ollama setting');
      const saved = db.providers.find((p) => p.id === params.id);
      const r = readProvider(body, { ...saved, id: params.id });
      if (r.error) return r.error;
      Object.assign(saved, r.value);
      save();
      return [200, providerOf(params.id)];
    },
    'DELETE /api/providers/{id}': ({ params }) => {
      const current = providerOf(params.id);
      if (!current) return noProvider(params.id);
      if (current.builtin) return err(400, 'invalid_request', 'the built-in provider cannot be deleted');
      const tasks = tasksOn(params.id);
      if (tasks.length) return err(409, 'conflict', `provider "${params.id}" is used by the task ${tasks.join(', ')}: route it elsewhere first`);
      db.providers = db.providers.filter((p) => p.id !== params.id);
      db.acknowledged = db.acknowledged.filter((id) => id !== params.id);
      save();
      return [204];
    },
    'POST /api/providers/{id}/acknowledge': ({ params }) => {
      const current = providerOf(params.id);
      if (!current) return noProvider(params.id);
      if (!db.acknowledged.includes(params.id)) db.acknowledged.push(params.id);
      save();
      return [200, providerOf(params.id)];
    },
    'GET /api/routing': () => [200, routingView()],
    'PUT /api/routing': ({ body }) => {
      if (!body || typeof body !== 'object') return err(400, 'invalid_request', 'invalid JSON body');
      const tasks = Object.keys(fx.routing().routing);
      const wanted = body.routing ?? {};
      for (const [task, id] of Object.entries(wanted)) {
        if (!tasks.includes(task)) return err(400, 'invalid_request', `no task "${task}"; they are ${tasks.join(', ')}`);
        const p = providerOf(id);
        if (!p) return err(400, 'invalid_request', `no provider "${id}"`);
        if (p.remote && !body.acknowledge_remote && !db.acknowledged.includes(id)) return err(400, 'consent_required', `"${id}" is remote: its ${task} data would leave this computer; acknowledge it first`);
      }
      if (body.max_calls !== undefined && !(Number.isInteger(body.max_calls) && body.max_calls >= 1)) return err(400, 'invalid_request', 'max_calls: a whole number, 1 or more');
      for (const [task, id] of Object.entries(wanted)) {
        if (id === 'ollama') delete db.routing[task];
        else db.routing[task] = id;
        if (body.acknowledge_remote && providerOf(id)?.remote && !db.acknowledged.includes(id)) db.acknowledged.push(id);
      }
      if (body.max_calls !== undefined) db.maxCalls = body.max_calls;
      save();
      return [200, routingView()];
    },

    'GET /api/hyperframes/blocks': ({ query, page }) => {
      const tag = query.get('tag');
      const state = query.get('state');
      const kind = query.get('kind');
      const family = query.get('family');
      const items = Object.values(db.blocks)
        .map(blockView)
        .filter((b) => (!tag || (b.tags ?? []).includes(tag)) && (!state || b.state === state) && (!kind || (kind === 'block' ? !b.kind : b.kind === kind)) && (!family || b.family === family));
      return page(items, {
        search: ['name', 'title', 'description', (b) => (b.tags ?? []).join(' ')],
        wrap: (list, total, all) => {
          const states = {};
          for (const b of all) states[b.state] = (states[b.state] ?? 0) + 1;
          return { blocks: list, total, states, libs_installed: true };
        },
      });
    },
    'GET /api/hyperframes/blocks/{name}': ({ params }) => {
      const b = db.blocks[params.name];
      return b ? [200, { ...blockView(b), html: `<!doctype html><html><body><div id="stage">${b.title}</div></body></html>`, files: ['index.html'], licenses: [{ file: 'LICENSE', text: `${b.license ?? 'MIT'} (simulated)` }], variables: [] }] : noBlock(params.name);
    },
    'DELETE /api/hyperframes/blocks/{name}': ({ params }) => {
      if (!db.blocks[params.name]) return noBlock(params.name);
      delete db.blocks[params.name];
      save();
      return [204];
    },
  };
  return { handlers };
}
