// The descriptions of 3D scenes, simulated: `POST /api/projects/{id}/blender/descriptions` (a model writes one from an idea, or changes
// the stored one), `GET` and `PUT .../descriptions/{name}` (read and save by hand) and `POST .../descriptions/{name}/preview` (a frame, a
// placeholder PNG here). The model "writes" the example description of the server's tests (`assets/titulo.scene.json`, a data file);
// a change adjusts the camera's lens. The descriptions are kept in memory per project (a restart forgets them).
// The refusals are the contract's: `400` for a bad name, an empty or too long idea or seconds outside 0.5 to 600 (and, for a save, a
// description that does not pass, each fault named by its place in the JSON), `404` for a project or description that is not there,
// `422` for `[fail]` in the idea; a refused request leaves the stored description untouched.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const err = (status, code, message) => [status, { error: { code, message } }];

export const MAX_IDEA = 2000;
export const MIN_SECONDS = 0.5;
export const MAX_SECONDS = 600;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.scene\.json$/;
const BPM = 120;
/** The colours the design names, as the server resolves them (the mock has one design). */
const DESIGN = { bg: '#101418', fg: '#f2f2f2', accent: '#ff5a36' };

export const example = () => JSON.parse(readFileSync(resolve(here, 'assets/titulo.scene.json'), 'utf8'));

/** The description with every key in seconds and every colour `#rrggbb`, as the server's `resolved`. */
export function resolveDescription(node) {
  if (Array.isArray(node)) return node.map(resolveDescription);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'beat' && typeof v === 'number') out.t = (v * 60) / BPM;
    else if ((k === 'color' || k === 'fg' || k === 'bg') && typeof v === 'string' && DESIGN[v]) out[k] = DESIGN[v];
    else out[k] = resolveDescription(v);
  }
  return out;
}

/** What is wrong with a description, each fault by its place in the JSON (a simplification of the server's checks). */
export function descriptionProblems(description, seconds) {
  if (!description || typeof description !== 'object' || Array.isArray(description)) return ['description: must be a JSON object'];
  const problems = [];
  if (description.version !== 1) problems.push('version: must be 1');
  const checkKeys = (place, keys) => {
    (Array.isArray(keys) ? keys : []).forEach((key, j) => {
      const t = typeof key?.t === 'number' ? key.t : typeof key?.beat === 'number' ? (key.beat * 60) / BPM : undefined;
      if (key && 't' in key && 'beat' in key) problems.push(`${place}.keys[${j}]: give exactly one of t and beat`);
      else if (t === undefined) problems.push(`${place}.keys[${j}]: give one of t or beat`);
      else if (t < 0 || t > seconds) {
        const outside = `outside the scene (0 to ${seconds} s)`;
        problems.push('t' in key ? `${place}.keys[${j}].t: ${key.t} is ${outside}` : `${place}.keys[${j}].beat: beat ${key.beat} falls at ${t} s, ${outside}`);
      }
    });
  };
  if (description.camera) checkKeys('camera', description.camera.keys);
  (Array.isArray(description.objects) ? description.objects : []).forEach((o, i) => checkKeys(`objects[${i}]`, o?.keys));
  return problems;
}

/** The lens of the camera changes with what the request says; anything else leaves the description as it was. */
function revise(description, idea) {
  const next = structuredClone(description);
  const text = idea.toLowerCase();
  if (next.camera && typeof next.camera.lens === 'number') {
    if (/further|away|wider|wide|lejos|alej/.test(text)) next.camera.lens = Math.max(10, Math.round(next.camera.lens * 0.8));
    else if (/closer|zoom|near|cerca|acerc/.test(text)) next.camera.lens = Math.round(next.camera.lens * 1.25);
  }
  return next;
}

export function blenderDescriptionHandlers({ db }) {
  /** @type {Map<string, Record<string, any>>} */
  const stored = new Map();
  const of = (project) => {
    if (!stored.has(project)) stored.set(project, {});
    return stored.get(project);
  };
  const noProject = (id) => (db.projects[id] ? null : err(404, 'not_found', `project "${id}" not found`));
  const badName = (name) => (typeof name === 'string' && NAME.test(name) ? null : err(400, 'invalid_request', 'name: a plain file name ending in .scene.json'));
  const badSeconds = (seconds) =>
    typeof seconds === 'number' && seconds >= MIN_SECONDS && seconds <= MAX_SECONDS ? null : err(400, 'invalid_request', `seconds: from ${MIN_SECONDS} to ${MAX_SECONDS}`);
  const noDescription = (name) => err(404, 'not_found', `there is no description "${name}": write the scene first`);
  const view = (name, description) => ({ name, description, resolved: resolveDescription(description) });

  return {
    'POST /api/projects/{id}/blender/descriptions': ({ params, body }) => {
      const no = noProject(params.id);
      if (no) return no;
      const bad = badName(body?.name) ?? badSeconds(body?.seconds);
      if (bad) return bad;
      const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
      if (!idea) return err(400, 'invalid_request', 'idea: say what the scene shows');
      if (idea.length > MAX_IDEA) return err(400, 'invalid_request', `idea: at most ${MAX_IDEA} characters`);
      const files = of(params.id);
      if (body.revise === true && !files[body.name]) return noDescription(body.name);
      if (idea.includes('[fail]')) return err(422, 'validation_failed', 'no description that passes the checks after 3 attempts: objects[0].keys[1].t: 7 is outside the scene (simulated)');
      const description = body.revise === true ? revise(files[body.name], idea) : example();
      files[body.name] = description;
      return [200, { ...view(body.name, description), provider: 'mock', model: 'mock-model', attempts: 1 }];
    },
    'GET /api/projects/{id}/blender/descriptions/{name}': ({ params }) => {
      const no = noProject(params.id);
      if (no) return no;
      const description = of(params.id)[params.name];
      return description ? [200, view(params.name, description)] : noDescription(params.name);
    },
    'PUT /api/projects/{id}/blender/descriptions/{name}': ({ params, body }) => {
      const no = noProject(params.id);
      if (no) return no;
      const bad = badName(params.name) ?? badSeconds(body?.seconds);
      if (bad) return bad;
      const problems = descriptionProblems(body.description, body.seconds);
      if (problems.length) return err(400, 'invalid_request', problems.join('; '));
      of(params.id)[params.name] = body.description;
      return [200, view(params.name, body.description)];
    },
    'POST /api/projects/{id}/blender/descriptions/{name}/preview': ({ params, body }) => {
      const no = noProject(params.id);
      if (no) return no;
      if (!of(params.id)[params.name]) return noDescription(params.name);
      const bad = badSeconds(body?.seconds);
      if (bad) return bad;
      if (typeof body.t !== 'number' || body.t < 0) return err(400, 'invalid_request', 't: the second to draw, from 0');
      if (body.width !== undefined && !(Number.isInteger(body.width) && body.width > 0 && body.width <= 960)) return err(400, 'invalid_request', 'width: up to 960');
      return [200, readFileSync(resolve(here, 'assets/placeholder.png')), 'image/png'];
    },
  };
}
