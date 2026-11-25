// The library of 3D models, simulated (`/api/models3d/...`), and the `.glb` models of a project's sources and of a piece of a music motion script.
//
// - Packs: the six CC0 packs of the server's list (a sample of each one's models, not the hundreds the real packs have) and the ones imported. An install is a
//   job settled by the clock (`MOCK_MODELS_MS` is its length, 2000 by default): `installing` with a growing `progress` (bytes of the zip, as the server counts them), then `installed`; `MOCK_MODELS_FAIL=<pack>`
//   makes that pack fail once (a repeat works). The zip of an import is not unpacked: its `.glb` names are read from the zip's own headers.
// - The catalog lists the models of the installed packs; the thumbnail is the placeholder picture, and the pack `kenney-retro-urban-kit` has none and
//   answers 503, as a pack with no preview does when Blender is missing.
// - A `.glb` is read the way the server reads it (header, JSON chunk): clips, triangles and the pictures it names. Copying a model of the library brings the pictures as `<pack>--<picture>`.
// - The pack `generated` is the models the engines made (`models3d-generation.mjs`): it exists once there is one, is removable like any pack, and an import over its id is a 409.
// State: `db.models3d` = { packs: { id: record }, projects: { id: { name: file } }, generated: [model], engines, installs, generations }; a piece keeps its own files in the record of the piece (see music-motion.mjs).
// The refusals are the contract's: `400` for a name that is not accepted or a file that is not a usable model, `404`, `409` for a taken name or a run, `413` over 32 MiB, `422` for a zip with no `.glb`.
import { readFileSync } from 'node:fs';
import { filesOf } from './blender-descriptions.mjs';
import { generationHandlers } from './models3d-generation.mjs';
import { makeSampleGlb } from './sample-model.mjs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const err = (status, code, message) => [status, { error: { code, message } }];
const PNG = () => readFileSync(resolve(here, 'assets/placeholder.png'));

export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_TRIANGLES = 500_000;
const PICTURE = /\.(png|jpe?g|webp)$/i;
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// ---------------------------------------------------------------- the packs the server lists
const CLIPS = [
  'static', 'idle', 'walk', 'sprint', 'jump', 'fall', 'crouch', 'sit', 'drive', 'die', 'pick-up', 'emote-yes', 'emote-no', 'holding-right', 'holding-left', 'holding-both',
  'holding-right-shoot', 'holding-left-shoot', 'holding-both-shoot', 'attack-melee-right', 'attack-melee-left', 'attack-kick-right', 'attack-kick-left', 'interact-right',
  'interact-left', 'wheelchair-sit', 'wheelchair-look-left', 'wheelchair-look-right', 'wheelchair-move-back', 'wheelchair-move-forward', 'wheelchair-move-left', 'wheelchair-move-right',
];
const letters = (n) => 'abcdefghijklmnopqrstuvwxyz'.slice(0, n).split('');
const model = (name, tags, { clips = [], triangles = 300, needs = ['colormap.png'] } = {}) => ({ name, tags, clips, triangles, needs });

/** The models of each pack the mock keeps (a sample), by pack id. */
const MODELS = {
  'kenney-mini-characters': [
    ...letters(6).map((l) => model(`character-female-${l}`, ['character', 'people', 'female'], { clips: CLIPS, triangles: 880 + l.charCodeAt(0) })),
    ...letters(6).map((l) => model(`character-male-${l}`, ['character', 'people', 'male'], { clips: CLIPS, triangles: 940 + l.charCodeAt(0) })),
    model('character-robot', ['character', 'robot'], { clips: CLIPS, triangles: 1004 }),
    model('character-zombie', ['character', 'zombie'], { clips: CLIPS, triangles: 912 }),
    model('character-knight', ['character', 'knight'], { clips: CLIPS, triangles: 986 }),
  ],
  'kenney-blocky-characters': letters(6).map((l) => model(`character-${l}`, ['character', 'blocky'], { clips: CLIPS.slice(0, 27), triangles: 480, needs: [`texture-${l}.png`] })),
  'kenney-furniture-kit': ['table', 'chair', 'lampSquareFloor', 'bookcaseOpen', 'bedDouble', 'sofa', 'desk', 'rugRound', 'pottedPlant', 'kitchenStove', 'televisionModern', 'cabinetBed'].map((n) => model(n, ['furniture', 'prop'], { triangles: 210 })),
  'kenney-food-kit': ['pizza', 'burger', 'cheese', 'croissant', 'apple', 'banana', 'sushi-salmon', 'cake', 'cup', 'bottle-ketchup'].map((n) => model(n, ['food', 'prop'], { triangles: 160 })),
  'kenney-retro-urban-kit': ['building-a', 'building-b', 'road-straight', 'road-corner', 'streetlight', 'car-sedan', 'car-taxi', 'tree-large'].map((n) => model(n, ['urban', 'building', 'prop'], { triangles: 420 })),
  'kenney-platformer-kit': [
    model('chest', ['platformer', 'prop'], { clips: ['open', 'close'], triangles: 380 }),
    model('door-rotate', ['platformer', 'prop'], { clips: ['open'], triangles: 150 }),
    model('trap-spikes', ['platformer', 'trap'], { clips: ['extend', 'retract'], triangles: 260 }),
    model('lever', ['platformer', 'prop'], { clips: ['pull'], triangles: 120 }),
    model('character-oobi', ['platformer', 'character'], { clips: CLIPS.slice(0, 25), triangles: 700 }),
    ...['block-grass', 'block-snow', 'platform', 'coin-gold', 'flag'].map((n) => model(n, ['platformer', 'prop'], { triangles: 90 })),
  ],
};

const PACKS = [
  { id: 'kenney-mini-characters', name: 'Mini Characters', size_bytes: 4_900_000, description: 'Characters with 32 animations each: people, a robot, a zombie, a knight.', page: 'kenney.nl/assets/mini-characters' },
  { id: 'kenney-blocky-characters', name: 'Blocky Characters', size_bytes: 3_100_000, description: 'Blocky characters with 27 animations and their own texture.', page: 'kenney.nl/assets/blocky-characters' },
  { id: 'kenney-furniture-kit', name: 'Furniture Kit', size_bytes: 5_600_000, description: 'Furniture and decoration.', page: 'kenney.nl/assets/furniture-kit' },
  { id: 'kenney-food-kit', name: 'Food Kit', size_bytes: 4_800_000, description: 'Food and kitchen things.', page: 'kenney.nl/assets/food-kit' },
  { id: 'kenney-retro-urban-kit', name: 'Retro Urban Kit', size_bytes: 4_200_000, description: 'Pieces to build a retro street.', page: 'kenney.nl/assets/retro-urban-kit' },
  { id: 'kenney-platformer-kit', name: 'Platformer Kit', size_bytes: 4_400_000, description: 'Pieces of a platformer level, some animated, and characters.', page: 'kenney.nl/assets/platformer-kit' },
].map((p) => ({ ...p, author: 'Kenney', licence: 'CC0', attribution: false, source: 'catalog', page: `https://${p.page}`, version: '1.0' }));

/** The pack that has no preview pictures: its thumbnails answer 503. */
export const NO_PREVIEW_PACK = 'kenney-retro-urban-kit';

// ---------------------------------------------------------------- reading a .glb
const lastName = (uri) => uri.replaceAll('\\', '/').split('/').pop();

/** What the server reads of a binary glTF: its clips, its triangles and the pictures it names. `{ ok: false, message }` for a file that is not a usable model. */
export function parseGlb(buffer) {
  const bad = (message) => ({ ok: false, message });
  if (!buffer || buffer.length < 20 || buffer.toString('latin1', 0, 4) !== 'glTF') return bad('not a binary glTF: it does not start with the glTF header');
  if (buffer.readUInt32LE(4) !== 2) return bad('only version 2 of glTF is read');
  const length = buffer.readUInt32LE(12);
  if (buffer.toString('latin1', 16, 20) !== 'JSON' || 20 + length > buffer.length) return bad('the first chunk is not the JSON of the model');
  let json;
  try {
    json = JSON.parse(buffer.toString('utf8', 20, 20 + length));
  } catch {
    return bad('the JSON chunk of the model cannot be read');
  }
  const clips = (json.animations ?? []).map((a, i) => a.name ?? `animation-${i}`);
  const accessors = json.accessors ?? [];
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const at = prim.indices ?? prim.attributes?.POSITION;
      triangles += Math.floor((accessors[at]?.count ?? 0) / 3);
    }
  }
  const needs = [];
  for (const image of json.images ?? []) {
    if (typeof image.uri !== 'string') continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(image.uri) || image.uri.startsWith('/') || image.uri.includes('\\') || image.uri.split('/').includes('..')) return bad(`the picture "${image.uri}" is not accepted: an address with a scheme, an absolute path, a backslash or ".." refuses the model`);
    if (!needs.includes(lastName(image.uri))) needs.push(lastName(image.uri));
  }
  if ((json.buffers ?? []).some((b) => typeof b.uri === 'string')) return bad('a data buffer in another file refuses the model');
  if (triangles > MAX_TRIANGLES) return bad(`the model has ${triangles} triangles, over the ${MAX_TRIANGLES} a file may have`);
  return { ok: true, clips, triangles, needs };
}

/** A small binary glTF for tests and for the mock's own fixtures: `clips` are animation names, `pictures` the textures it names. */
export function makeGlb({ clips = [], triangles = 12, pictures = [] } = {}) {
  const json = {
    asset: { version: '2.0' },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: triangles * 3 }, { count: triangles * 3 }],
    animations: clips.map((name) => ({ name })),
    images: pictures.map((uri) => ({ uri })),
  };
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4) text += ' ';
  const body = Buffer.from(text);
  const out = Buffer.alloc(20 + body.length);
  out.write('glTF', 0, 'latin1');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(body.length, 12);
  out.write('JSON', 16, 'latin1');
  body.copy(out, 20);
  return out;
}

// ---------------------------------------------------------------- the files of a place (a project's sources or a piece)
/** How a file is listed: a model with what was read of it, a picture with its size. `pictureKind` is what the place calls a picture (`image` in a project, `picture` in a piece). */
export const viewOf = (name, file, pictureKind) => ({
  name,
  kind: file.kind === 'model' ? 'model' : pictureKind,
  size: file.size,
  ...(file.kind === 'model' ? { clips: file.clips, triangles: file.triangles, needs: file.needs } : {}),
});
export const listOf = (files, pictureKind) => Object.keys(files).sort().map((n) => viewOf(n, files[n], pictureKind));

/** Puts a `.glb` or a picture in the files of a place. `409` for a name that exists: nothing is replaced. */
export function putFile(files, name, buffer) {
  if (!PLAIN.test(name) || !(/\.glb$/i.test(name) || PICTURE.test(name))) return err(400, 'invalid_request', `name: "${name}" is not accepted; use a plain name ending in .glb, .png, .jpg, .jpeg or .webp`);
  if (buffer && buffer.length > MAX_BYTES) return err(413, 'too_large', 'the file is larger than 32 MiB');
  if (files[name]) return err(409, 'conflict', `"${name}" already exists: a file is never replaced`);
  if (/\.glb$/i.test(name)) {
    const read = parseGlb(buffer);
    if (!read.ok) return err(400, 'invalid_request', `${name}: ${read.message}`);
    files[name] = { kind: 'model', size: buffer.length, clips: read.clips, triangles: read.triangles, needs: read.needs };
  } else {
    files[name] = { kind: 'picture', size: buffer?.length ?? 0 };
  }
  return [201, { name }];
}

/** The scenes of a script that place a model: ids of the 3D pieces whose description has an object `{type: "model", file}` that is `name`, or a model that needs the picture `name`. */
export function placedBy(files, name, script) {
  const users = (file) => file === name || (files[file]?.kind === 'model' && files[file].needs.includes(name));
  const out = [];
  for (const piece of script?.pieces ?? []) {
    const objects = piece.blender?.description?.objects ?? [];
    if (objects.some((o) => o?.type === 'model' && typeof o.file === 'string' && users(o.file))) out.push(piece.id);
  }
  return out;
}

// ---------------------------------------------------------------- the library
export function models3dHandlers({ db, save, speed = 1, fallback, hasActiveRun }) {
  const lib = (db.models3d ??= { packs: {}, projects: {} });
  lib.packs ??= {};
  lib.projects ??= {};
  lib.generated ??= [];
  const installMs = () => Number(process.env.MOCK_MODELS_MS ?? 2000) / speed;
  let failNext = process.env.MOCK_MODELS_FAIL || '';

  const listed = (id) => PACKS.find((p) => p.id === id);
  const adultKept = () => process.env.MOCK_ADULT === '1';
  /** The models an engine made that the catalog may show: the ones marked adult only where the server keeps adult content. */
  const shownGenerated = () => lib.generated.filter((m) => !m.adult || adultKept());
  const generatedPack = () => ({
    id: 'generated',
    name: 'Generated models',
    author: '',
    licence: 'the engine of each model',
    attribution: false,
    source: 'generated',
    size_bytes: lib.generated.length * 90_000,
    tags: [],
    state: 'installed',
    models: shownGenerated().length,
  });
  /** The state of a pack as the clock leaves it: an install past its time is installed (or failed, once, when the environment says so). */
  function settle(id) {
    const rec = lib.packs[id];
    if (rec?.state !== 'installing') return rec;
    const elapsed = Date.now() - rec.startedAt;
    if (elapsed < installMs()) return rec;
    if (failNext === id) {
      failNext = '';
      return Object.assign(rec, { state: 'failed', error: 'the pack changed: its SHA-256 is not the one that was checked, and nothing was installed (simulated)' });
    }
    return Object.assign(rec, { state: 'installed', finishedAt: Date.now() });
  }
  const modelsOf = (id) => (lib.packs[id]?.imported ? lib.packs[id].imported : (MODELS[id] ?? []));
  /** `ModelPack` for a pack of the list or an imported one. */
  function view(id) {
    if (id === 'generated') return lib.generated.length ? generatedPack() : null;
    const rec = settle(id);
    const base = listed(id) ?? rec?.meta;
    if (!base) return null;
    const state = rec?.state ?? 'available';
    const out = { ...base, tags: [...new Set(modelsOf(id).flatMap((m) => m.tags))].slice(0, 6), state, models: state === 'installed' ? modelsOf(id).length : 0 };
    if (state === 'failed') out.error = rec.error;
    if (state === 'installing') out.progress = { done: Math.min(base.size_bytes - 1, Math.floor(((Date.now() - rec.startedAt) / installMs()) * base.size_bytes)), total: base.size_bytes };
    if (rec?.skipped?.length) out.skipped = rec.skipped;
    return out;
  }
  const allIds = () => [...PACKS.map((p) => p.id), ...Object.keys(lib.packs).filter((id) => lib.packs[id].meta && !listed(id)), ...(lib.generated.length ? ['generated'] : [])];
  const known = (id) => listed(id) ?? lib.packs[id]?.meta ?? (id === 'generated' && lib.generated.length ? generatedPack() : undefined);

  /** `LibraryModel` of every model of the installed packs. */
  const catalogOf = () =>
    allIds().flatMap((id) => {
      if (id === 'generated') return shownGenerated().map(({ detail, ...m }) => (void detail, m));
      const pack = view(id);
      if (pack?.state !== 'installed') return [];
      return modelsOf(id).map((m) => ({ id: `${id}/${m.name}`, pack: id, name: m.name, tags: m.tags, clips: m.clips, triangles: m.triangles, needs: m.needs, licence: pack.licence, author: pack.author, attribution: pack.attribution, source: pack.source }));
    });
  const modelOf = (from) => catalogOf().find((m) => m.id === from);

  /** Copies a model of the library into the files of a place (what `POST .../sources/model` and `POST .../pieces/{id}/models` do): `200` when it is already there, `409` for another file of that name. */
  function copyInto(files, body) {
    if (!body || typeof body !== 'object' || typeof body.from !== 'string' || !body.from.includes('/')) return err(400, 'invalid_request', 'from: say the model as <pack>/<model>');
    const found = modelOf(body.from);
    if (!found) return err(404, 'not_found', `the library has no model "${body.from}" (is its pack installed?)`);
    const name = body.name ?? `${found.name}.glb`;
    if (!PLAIN.test(name) || !/\.glb$/i.test(name)) return err(400, 'invalid_request', 'name: a plain file name ending in .glb');
    const pictures = found.needs.map((n) => `${found.pack}--${n}`);
    const same = files[name]?.from === body.from;
    if (files[name] && !same) return err(409, 'conflict', `"${name}" is already in the sources and is another file: nothing was written`);
    for (const p of pictures) files[p] ??= { kind: 'picture', size: 4096, from: body.from };
    if (same) return [200, { name, pictures }];
    files[name] = { kind: 'model', size: 60_000 + found.triangles * 40, clips: found.clips, triangles: found.triangles, needs: pictures, from: body.from };
    return [201, { name, pictures }];
  }

  const projectFiles = (id) => (lib.projects[id] ??= {});
  const missingProject = (db0, id) => (db0.projects[id] === undefined ? err(404, 'not_found', `project "${id}" not found`) : null);
  const zipNames = (buffer) => [...new Set([...buffer.toString('latin1').matchAll(/([A-Za-z0-9][\w .()-]*\.glb)/gi)].map((m) => m[1]))];

  const handlers = {
    'GET /api/models3d/packs': () => [200, { packs: allIds().map(view) }],
    'GET /api/models3d/packs/{id}': ({ params }) => {
      const pack = known(params.id) ? view(params.id) : null;
      return pack ? [200, pack] : err(404, 'not_found', `pack "${params.id}" not found`);
    },
    'POST /api/models3d/packs/{id}/install': ({ params }) => {
      const base = listed(params.id);
      if (!base) return err(404, 'not_found', `pack "${params.id}" is not in the list`);
      const state = view(params.id).state;
      if (state === 'installed' || state === 'installing') return err(409, 'conflict', `pack "${params.id}" is already ${state}`);
      lib.packs[params.id] = { state: 'installing', startedAt: Date.now() };
      save();
      return [202, view(params.id)];
    },
    'POST /api/models3d/packs/{id}/cancel': ({ params }) => {
      if (!known(params.id)) return err(404, 'not_found', `pack "${params.id}" not found`);
      if (view(params.id).state !== 'installing') return err(409, 'conflict', `pack "${params.id}" is not being installed`);
      delete lib.packs[params.id];
      save();
      return [200, view(params.id)];
    },
    'DELETE /api/models3d/packs/{id}': ({ params }) => {
      if (!known(params.id)) return err(404, 'not_found', `pack "${params.id}" not found`);
      if (params.id === 'generated') lib.generated = [];
      else if (view(params.id).state === 'installing') return err(409, 'conflict', `pack "${params.id}" is being installed: cancel it first`);
      delete lib.packs[params.id];
      save();
      return [204];
    },
    'POST /api/models3d/packs/import': ({ query, body }) => {
      const id = query.get('id') ?? '';
      if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) return err(400, 'invalid_request', 'id: lower case letters, digits and hyphens, up to 48');
      const licence = (query.get('licence') ?? '').trim();
      if (!licence) return err(400, 'invalid_request', 'licence: say what the pack allows; it is required');
      if (!body?.buffer || body.buffer.length < 4 || body.buffer.toString('latin1', 0, 2) !== 'PK') return err(400, 'invalid_request', 'the body is not a zip');
      if (known(id)) return err(409, 'conflict', `pack id "${id}" is already in use`);
      const names = zipNames(body.buffer);
      if (!names.length) return err(422, 'validation_failed', 'the zip has no .glb model: nothing was imported');
      const meta = {
        id,
        name: query.get('name') || id,
        author: query.get('author') ?? '',
        licence,
        attribution: !/^cc0|creative commons zero/i.test(licence),
        source: 'user',
        ...(query.get('source_url') ? { page: query.get('source_url') } : {}),
        size_bytes: body.buffer.length,
      };
      lib.packs[id] = { state: 'installed', meta, imported: names.map((n) => model(n.replace(/\.glb$/i, '').split('/').pop(), ['imported'], { needs: [] })) };
      save();
      return [201, view(id)];
    },

    'GET /api/models3d/models': ({ query, page }) => {
      let list = catalogOf();
      if (query.get('pack')) list = list.filter((m) => m.pack === query.get('pack'));
      if (query.get('tag')) list = list.filter((m) => m.tags.includes(query.get('tag')));
      if (query.get('has_clips') === 'true') list = list.filter((m) => m.clips.length > 0);
      if (query.get('source')) {
        if (!['catalog', 'user', 'generated'].includes(query.get('source'))) return err(400, 'invalid_request', 'source: catalog, user or generated');
        list = list.filter((m) => m.source === query.get('source'));
      }
      if (query.get('engine')) {
        if (!['triposr', 'sf3d'].includes(query.get('engine'))) return err(400, 'invalid_request', 'engine: triposr or sf3d');
        list = list.filter((m) => m.engine === query.get('engine'));
      }
      if (query.get('project')) list = list.filter((m) => m.project === query.get('project'));
      return page(list, { search: ['name', (m) => m.tags.join(' '), (m) => m.prompt ?? ''], natural: true, always: true, wrap: (items, total, all) => ({ models: items, total: all.length }) });
    },
    'GET /api/models3d/models/{pack}/{name}': ({ params }) => {
      const found = modelOf(`${params.pack}/${params.name}`);
      return found ? [200, found] : err(404, 'not_found', `model "${params.pack}/${params.name}" not found`);
    },
    'GET /api/models3d/models/{pack}/{name}/thumbnail': ({ params }) => {
      if (!modelOf(`${params.pack}/${params.name}`)) return err(404, 'not_found', `model "${params.pack}/${params.name}" not found`);
      if (params.pack === NO_PREVIEW_PACK) return err(503, 'blender_missing', 'the model has no preview picture and Blender is not installed: install Blender 4.2 or later to draw one');
      return [200, PNG(), 'image/png'];
    },
    // The file of a model (`GET .../file`): a sample `.glb` with the model's clips and about its triangles. `MOCK_MODEL_FILE=missing` is a server that does not serve it (404).
    'GET /api/models3d/models/{pack}/{name}/file': ({ params, headers }) => modelFile(params.pack, params.name, headers ?? {}),

    // The sources of a project: what the mock had (an example list), and the models and pictures kept here.
    'GET /api/projects/{id}/sources': (ctx) => {
      const [status, base] = fallback('GET', '/api/projects/{id}/sources');
      return [status, { ...base, sources: [...(base?.sources ?? []), ...Object.entries(projectFiles(ctx.params.id)).map(([name, f]) => ({ ...viewOf(name, f, 'image'), modified: new Date().toISOString() }))] }];
    },
    'PUT /api/projects/{id}/sources/{name}': (ctx) => {
      const { params, query, body } = ctx;
      const missing = missingProject(db, params.id);
      if (missing) return missing;
      const model_ = /\.glb$/i.test(params.name);
      if (!model_) {
        // what the mock always did; a plain picture upload is also kept, so that a model's `needs` can be answered
        if (PICTURE.test(params.name) && !query.get('as') && !projectFiles(params.id)[params.name]) projectFiles(params.id)[params.name] = { kind: 'picture', size: body?.buffer?.length ?? 0 };
        return fallback('PUT', '/api/projects/{id}/sources/{name}');
      }
      if (hasActiveRun(params.id)) return err(409, 'conflict', `project "${params.id}" has a run queued or active`);
      const out = putFile(projectFiles(params.id), params.name, body?.buffer);
      if (out[0] === 201) save();
      return out;
    },
    'DELETE /api/projects/{id}/sources/{name}': ({ params }) => {
      const files = projectFiles(params.id);
      if (!files[params.name]) return fallback('DELETE', '/api/projects/{id}/sources/{name}');
      // a model a scene's description places is kept, and so is the picture of a model that is placed
      const scene = Object.entries(filesOf(params.id)).find(([, d]) => (d?.objects ?? []).some((o) => o?.type === 'model' && (o.file === params.name || files[o.file]?.needs?.includes(params.name))));
      if (scene) return err(409, 'conflict', `the scene ${scene[0]} places ${params.name}: take it out of the scene first`);
      delete files[params.name];
      save();
      return [204];
    },
    'POST /api/projects/{id}/sources/model': ({ params, body }) => {
      const missing = missingProject(db, params.id);
      if (missing) return missing;
      if (hasActiveRun(params.id)) return err(409, 'conflict', `project "${params.id}" has a run queued or active`);
      const out = copyInto(projectFiles(params.id), body);
      if (out[0] === 201) save();
      return out;
    },
  };
  /** A model that a project's run made again replaces the one that entry had: the library never holds two versions of one entry. */
  function dropGenerated(project, entry) {
    lib.generated = lib.generated.filter((m) => !(m.project === project && m.entry === entry));
  }

  /** A model an engine made: it joins the pack `generated`; a name another project took gets a number. */
  function addGenerated(info) {
    const triangles = info.triangles ?? 21_000 + Math.floor(((info.name.length * 977) % 24_000));
    const taken = new Set(lib.generated.map((m) => m.name));
    let unique = info.name;
    for (let n = 2; taken.has(unique); n++) unique = `${info.name}-${n}`;
    info = { ...info, name: unique };
    const record = {
      id: `generated/${info.name}`,
      pack: 'generated',
      name: info.name,
      tags: [],
      clips: [],
      triangles,
      needs: [],
      licence: info.engine === 'sf3d' ? 'Stability AI Community License' : 'MIT',
      author: info.engine === 'sf3d' ? 'Stable Fast 3D' : 'TripoSR',
      attribution: info.engine === 'sf3d',
      prompt: info.prompt,
      engine: info.engine,
      engine_version: info.engine_version,
      generated_at: new Date().toISOString(),
      source: 'generated',
      project: info.project,
      entry: info.entry,
      detail: info.detail,
      ...(info.adult ? { adult: true } : {}),
    };
    lib.generated.push(record);
    save();
    return record;
  }
  const generation = generationHandlers({ db, lib, save, speed, addGenerated, generatedNames: () => lib.generated.map((m) => m.name) });
  Object.assign(handlers, generation.handlers);
  const sampleCache = new Map();
  /**
   * The file of a model of the library: a sample with its `triangles` and `clips`, an `ETag` (`If-None-Match` is a `304`) and a `Range` of one part of the bytes (`206`), as the contract says.
   * `MOCK_MODEL_FILE=missing` is a server that does not serve the file: `404` for every model.
   */
  function modelFile(pack, name, request) {
    const found = modelOf(`${pack}/${name}`);
    if (!found || process.env.MOCK_MODEL_FILE === 'missing') return err(404, 'not_found', `model "${pack}/${name}" has no file here`);
    const key = `${found.id}:${found.triangles}:${found.clips.join(',')}`;
    if (!sampleCache.has(key)) sampleCache.set(key, makeSampleGlb({ triangles: Math.min(found.triangles, 20_000), clips: found.clips.slice(0, 8) }));
    const file = sampleCache.get(key);
    const etag = `"${createHash('sha1').update(file).digest('hex').slice(0, 16)}"`;
    const headers = { ETag: etag, 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes' };
    if (request['if-none-match'] === etag) return [304, undefined, undefined, headers];
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] === '' ? Math.max(0, file.length - Number(range[2])) : Number(range[1]);
      const end = range[1] === '' || range[2] === '' ? file.length - 1 : Math.min(Number(range[2]), file.length - 1);
      if (start <= end && start < file.length) return [206, file.subarray(start, end + 1), 'model/gltf-binary', { ...headers, 'Content-Range': `bytes ${start}-${end}/${file.length}` }];
    }
    return [200, file, 'model/gltf-binary', headers];
  }

  // `MOCK_PRELOADED_LIBRARY=1` (the public demo) starts with two packs installed and three models an engine made, so the 3D library is full when it opens.
  if (process.env.MOCK_PRELOADED_LIBRARY === '1' && Object.keys(lib.packs).length === 0 && lib.generated.length === 0) {
    for (const id of ['kenney-furniture-kit', 'kenney-mini-characters']) lib.packs[id] = { state: 'installed', finishedAt: Date.now() };
    for (const [name, prompt] of [['wooden-chest', 'a wooden treasure chest with iron bands'], ['red-sailboat', 'a small red sailboat'], ['potted-cactus', 'a cartoon cactus in a clay pot']]) {
      addGenerated({ name, prompt, engine: 'triposr', engine_version: 'TripoSR 0.1', detail: 'normal', project: `demo-${name}`, entry: name });
    }
  }

  return { handlers, modelFile, copyInto, projectFiles, view, addGenerated, dropGenerated, engineProblem: generation.engineProblem, settingsBlock: generation.settingsBlock, checkSettings: generation.checkSettings, afterSettings: generation.afterSettings };
}
