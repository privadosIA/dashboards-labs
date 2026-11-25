// The projects of the mode `models3d`: what their `scenes.yaml` may hold, what a run of one makes and what it leaves behind (docs/MODEL_GENERATION.md, SCENES_YAML.md "Models 3D mode").
//
// A project of this mode declares `models:` (and no scenes and no tracks). A run goes through its entries one after the other: for each model the picture (phase `render`, left out for an entry with its own
// picture and for a model that is already made) and the model (phase `model3d`). It leaves `out/<project>/<file>.glb` and `out/<project>/manifest.json` (kept here, in `db.models3dOut`) and copies each model into the
// library's pack `generated` with the project and the entry. A model has a key (the picture, the engine and its version, the detail and the seed): a run that finds the same key and its file makes nothing, so changing one
// prompt makes only that entry again. A run never starts the 3D container: an engine that cannot be used fails the run with its reason.
import { createHash } from 'node:crypto';

const ENGINES = ['triposr', 'sf3d'];
const DETAILS = ['low', 'normal', 'high'];
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PICTURE = /\.(png|jpe?g|webp)$/i;
const VERSION = { triposr: 'triposr@3f1c9a2', sf3d: 'sf3d@8d41e07' };

/** What is wrong with the models of a configuration, in the server's words; `null` when nothing is. */
export function modelsProblem(cfg) {
  const mode = cfg?.output?.mode ?? 'video';
  const has = (k) => cfg?.[k] !== undefined && cfg?.[k] !== null;
  if (mode !== 'models3d') {
    if (has('models')) return 'models: only valid in output.mode models3d';
    if (cfg?.defaults?.models3d !== undefined) return 'defaults.models3d: only valid in output.mode models3d';
    return null;
  }
  if ((cfg.scenes ?? []).length > 0) return 'scenes: a project of the mode models3d has no scenes (it declares models)';
  if ((cfg.tracks ?? []).length > 0) return 'tracks: a project of the mode models3d has no tracks (it declares models)';
  const d = cfg.defaults?.models3d;
  if (d !== undefined) {
    if (!d || typeof d !== 'object') return 'defaults.models3d: must be an object with an engine and a detail';
    if (d.engine !== undefined && !ENGINES.includes(d.engine)) return 'defaults.models3d.engine: triposr or sf3d';
    if (d.detail !== undefined && !DETAILS.includes(d.detail)) return 'defaults.models3d.detail: low, normal or high';
  }
  if (cfg.models === undefined || cfg.models === null) return null;
  if (!Array.isArray(cfg.models)) return 'models: must be a list';
  const seen = new Set();
  for (const [i, m] of cfg.models.entries()) {
    const at = `models[${i}]`;
    if (!m || typeof m !== 'object') return `${at}: must be an entry with an id and a prompt or an image`;
    if (typeof m.id !== 'string' || !ID.test(m.id)) return `${at}.id: a plain lower-case name (letters, digits, ".", "_", "-", up to 64)`;
    if (seen.has(m.id)) return `${at}.id: "${m.id}" is used by another entry`;
    seen.add(m.id);
    const hasPrompt = m.prompt !== undefined;
    const hasImage = m.image !== undefined;
    if (hasPrompt && hasImage) return `${at}: give a prompt or an image, not both`;
    if (!hasPrompt && !hasImage) return `${at}: give a prompt or an image`;
    if (hasPrompt && (typeof m.prompt !== 'string' || !m.prompt.trim())) return `${at}.prompt: must be a text that is not empty`;
    if (hasPrompt && m.prompt.length > 1000) return `${at}.prompt: at most 1000 characters`;
    if (hasImage && (typeof m.image !== 'string' || !PICTURE.test(m.image) || m.image.includes('/'))) return `${at}.image: the name of a .png, .jpg, .jpeg or .webp file of the sources`;
    if (m.engine !== undefined && !ENGINES.includes(m.engine)) return `${at}.engine: triposr or sf3d`;
    if (m.detail !== undefined && !DETAILS.includes(m.detail)) return `${at}.detail: low, normal or high`;
    if (m.variants !== undefined && (!Number.isInteger(m.variants) || m.variants < 1 || m.variants > 4)) return `${at}.variants: a whole number from 1 to 4`;
    if (m.seed !== undefined && !Number.isInteger(m.seed)) return `${at}.seed: a whole number`;
    if (m.adult !== undefined && typeof m.adult !== 'boolean') return `${at}.adult: true or false`;
  }
  return null;
}

const hashOf = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex');
const seedOf = (text) => parseInt(hashOf(text).slice(0, 6), 16);

/** The models a configuration asks for, one for each variant of each entry: file, seed, engine, detail, what the picture comes from and the key that says whether the model must be made again. */
export function planOf(cfg, only) {
  const defaults = cfg.defaults?.models3d ?? {};
  return (cfg.models ?? [])
    .filter((m) => !only || m.id === only)
    .flatMap((m) => {
      const engine = m.engine ?? defaults.engine ?? 'triposr';
      const detail = m.detail ?? defaults.detail ?? 'normal';
      const variants = m.image ? 1 : (m.variants ?? 1);
      const source = m.image ?? m.prompt;
      return Array.from({ length: variants }, (_, n) => {
        const seed = (m.seed ?? seedOf(source)) + n;
        const file = n === 0 ? `${m.id}.glb` : `${m.id}-${n + 1}.glb`;
        return { entry: m.id, variant: n, file, name: file.replace(/\.glb$/, ''), prompt: m.prompt, image: m.image, engine, detail, seed, adult: m.adult === true, key: hashOf(m.image ? `image:${m.image}` : `prompt:${m.prompt}`, engine, VERSION[engine], detail, seed) };
      });
    });
}

/**
 * Runs a project of this mode on the mock's clock. `ctx` carries what the server module owns: `db`, `ts`, `emit`, `setState`, `timers`, `step` (ms of a phase), `engineProblem(name)` (null or `{ reason, detail }`),
 * `addGenerated(info)` and `dropGenerated(project, entry)`.
 */
export function simulateModels(run, cfg, ctx) {
  const { db, ts, emit, setState, timers, step } = ctx;
  db.models3dOut ??= {};
  const out = (db.models3dOut[run.project] ??= { models: [] });
  const plan = planOf(cfg, run.only);
  const used = [...new Set(plan.map((p) => p.engine))];
  let t = 0;
  timers.set(run.id, []);
  const at = (ms, fn) => timers.get(run.id).push(setTimeout(fn, (t += ms)));

  at(step, () => {
    setState(run, 'running');
    run.started_at = ts();
    emit(run, { timestamp: ts(), type: 'pipeline_start' });
  });
  // the picture of a text is drawn with the project's image model, sampler and steps: without them the server's render fails at the first text
  const d = cfg.defaults ?? {};
  const firstText = plan.find((p) => p.prompt !== undefined);
  if (firstText && !((d.model || d.model_set) && d.sampler && d.steps)) {
    at(step, () => setState(run, 'failed', { error: `render failed: render: scene "${firstText.entry}": runner: sd -m ${d.model ?? ''} --sampling-method ${d.sampler ?? ''} --steps ${d.steps ?? 0}: exit status 1 (stderr: invalid sample method; set the image model, the sampler and the steps of the project)` }));
    return;
  }
  const blocked = used.map((e) => [e, ctx.engineProblem(e)]).find(([, p]) => p);
  if (blocked) {
    const [engine, why] = blocked;
    at(step, () => setState(run, 'failed', { error: `the 3D engine ${engine} cannot be used (${why.reason})${why.detail ? `: ${why.detail}` : ''}` }));
    return;
  }
  for (const item of plan) {
    const kept = out.models.find((m) => m.name === item.name);
    const made = kept?.key === item.key;
    for (const phase of ['render', 'model3d']) {
      // a phase that is not needed (the picture of an entry that brings its own, a model that is already made) is told as `skipped`
      if (made || (phase === 'render' && item.image !== undefined)) {
        at(step / 2, () => emit(run, { timestamp: ts(), type: 'skipped', scene_id: item.entry, phase }));
        continue;
      }
      at(step, () => emit(run, { timestamp: ts(), type: 'phase_start', scene_id: item.entry, phase }));
      at(step * 2, () => emit(run, { timestamp: ts(), type: 'phase_end', scene_id: item.entry, phase, duration_ms: Math.round(step * 2) }));
    }
    if (!made) {
      at(1, () => {
        const triangles = 21_000 + ((item.name.length * 977 + item.seed) % 24_000);
        const line = { entry: item.entry, variant: item.variant, name: item.name, file: `out/${run.project}/${item.file}`, ...(item.prompt ? { prompt: item.prompt } : { image: item.image }), engine: item.engine, engine_version: VERSION[item.engine], detail: item.detail, seed: item.seed, triangles, seconds: Math.round((step * 4) / 100) / 10, adult: item.adult || cfg.adult === true, key: item.key };
        out.models = [...out.models.filter((m) => m.name !== item.name), line];
        ctx.dropGenerated(run.project, item.name);
        ctx.addGenerated({ name: item.name, prompt: item.prompt ?? item.image, engine: item.engine, engine_version: VERSION[item.engine], detail: item.detail, project: run.project, entry: item.name, adult: line.adult, triangles });
      });
    }
  }
  const artifact = `out/${run.project}/manifest.json`;
  at(step, () => {
    emit(run, { timestamp: ts(), type: 'pipeline_end', duration_ms: Math.round(t), artifact });
    setState(run, 'succeeded', { artifact });
  });
}

/** The manifest of a project's output as the server writes it. */
export const manifestOf = (db, project) => (db.models3dOut?.[project] ? { project, mode: 'models3d', generated_at: new Date().toISOString(), models: db.models3dOut[project].models } : null);

/** The files in `out/<project>/`: the models and the manifest. */
export const outFiles = (db, project) => (db.models3dOut?.[project] ? ['manifest.json', ...db.models3dOut[project].models.map((m) => m.file.split('/').pop())] : []);
