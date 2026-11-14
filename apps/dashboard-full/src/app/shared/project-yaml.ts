import { dump } from 'js-yaml';

import { ProjectConfig } from '../core/api.models';

/**
 * Serializes the editable model back to scenes.yaml. Keys mirror the Go
 * yaml tags (the JSON field names were chosen to match them 1:1), and
 * absent optionals are pruned so presence semantics survive the trip.
 */
export function toYaml(cfg: ProjectConfig): string {
  const scenes = cfg.scenes.map((s) => {
    const o = { ...s };
    if (o.animate !== true) delete o.animate; // only an opt-in is written
    if (cfg.output.mode === 'images') delete o.image; // a picture or clip of its own only exists in video
    if (cfg.output.mode === 'images') {
      delete o.clip;
      delete o.clip_start;
      delete o.clip_end;
      delete o.clip_speed;
    }
    if (cfg.output.mode === 'images') {
      delete o.transition_seconds;
      delete o.transition;
    } // fades only join video scenes
    return prune(o);
  });
  const doc = prune({
    project: cfg.project,
    adult: cfg.adult,
    output: prune({ ...cfg.output }),
    defaults: prune({ ...cfg.defaults, ...(cfg.output.mode === 'images' ? { transition_seconds: undefined, transition: undefined } : {}) }),
    // The soundtrack only exists in video projects.
    bgm: cfg.output.mode === 'images' || cfg.output.mode === 'music' ? undefined : prune({ ...cfg.bgm }),
    scenes,
  });
  return dump(doc, { noRefs: true, lineWidth: 1000 });
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === null || v === '') {
      delete obj[key];
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      prune(v as Record<string, unknown>);
      if (Object.keys(v as object).length === 0) {
        delete obj[key];
      }
    }
  }
  return obj;
}
