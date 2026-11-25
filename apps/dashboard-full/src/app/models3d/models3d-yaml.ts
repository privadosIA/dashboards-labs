import { dump } from 'js-yaml';

import type { ModelEntry, ProjectConfig } from '../core/api.models';

/** Takes out what is empty, so that "let the server decide" survives the trip: an absent key is not an empty one. */
function prune<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
}

/** One entry as the file holds it: a text or a picture (never both), and only what was set. */
export function entryToYaml(e: ModelEntry): Record<string, unknown> {
  const hasPrompt = (e.prompt ?? '').trim() !== '';
  return prune({
    id: e.id,
    prompt: hasPrompt ? e.prompt : undefined,
    image: !hasPrompt ? e.image : undefined,
    engine: e.engine,
    detail: e.detail,
    variants: e.variants !== undefined && e.variants > 1 && !(e.image && !hasPrompt) ? e.variants : undefined,
    seed: e.seed,
    adult: e.adult === true ? true : undefined,
  });
}

/** Defaults that mean something only to a video or a song: a project of 3D models does not use them. */
const NOT_FOR_MODELS = new Set(['voice', 'voice_speaker', 'fps', 'animate', 'music', 'transition_seconds', 'transition', 'motion']);

/**
 * Serializes a project of the mode `models3d` back to `scenes.yaml`. Keys mirror the Go yaml tags; the keys of the images mode's defaults (the image model the prompts are drawn with) are kept as they came and the
 * ones that mean nothing at their zero value are left out; a project of this mode has no scenes and no tracks.
 */
export function toModelsYaml(cfg: ProjectConfig): string {
  const defaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg.defaults ?? {})) {
    if (NOT_FOR_MODELS.has(k) || v === undefined || v === null || (v as unknown) === '' || (v as unknown) === 0 || (v as unknown) === false) continue;
    if (k === 'models3d') {
      const d = prune({ ...(v as Record<string, unknown>) });
      if (Object.keys(d).length) defaults[k] = d;
    } else defaults[k] = v;
  }
  const doc = prune({
    project: cfg.project,
    adult: cfg.adult,
    output: prune({ mode: 'models3d', file: cfg.output?.file }),
    defaults: Object.keys(defaults).length ? defaults : undefined,
    models: (cfg.models ?? []).map(entryToYaml),
  });
  return dump(doc, { lineWidth: 120, noRefs: true });
}

/** scenes.yaml of a new 3D models project: one entry to start from, nothing else. */
export function modelsStarterYaml(id: string, entryId: string, prompt: string): string {
  return dump({ project: id, output: { mode: 'models3d' }, models: [{ id: entryId, prompt }] }, { lineWidth: 120 });
}
