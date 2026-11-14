import { dump } from 'js-yaml';

import { MixClip, ProjectConfig } from '../core/api.models';

/**
 * Serializes the music model back to scenes.yaml. Keys mirror the Go yaml
 * tags; absent optionals are pruned so "let the model decide" survives the
 * trip; `instrumental: false` is not written, and an instrumental track's
 * lyrics are not sent.
 */
export function toMusicYaml(cfg: ProjectConfig): string {
  const tracks = (cfg.tracks ?? []).map((t) => {
    const o: Record<string, unknown> = { ...t };
    if (o['instrumental'] === true) {
      delete o['lyrics']; // an instrumental track sings nothing: its lyrics stay on screen, not in the file
    } else {
      delete o['instrumental'];
    }
    return prune(o);
  });
  const defaults: Record<string, unknown> = { ...cfg.defaults };
  // Video/image leftovers at their zero value mean nothing in a music project.
  for (const key of Object.keys(defaults)) {
    if (key !== 'music' && (defaults[key] === 0 || defaults[key] === false)) delete defaults[key];
  }
  const doc: Record<string, unknown> = {
    project: cfg.project,
    adult: cfg.adult,
    output: prune({ mode: cfg.output.mode }),
    defaults: prune(defaults),
    tracks,
  };
  const mixes = (cfg.mixes ?? []).map((m) => ({
    id: m.id,
    ...(m.gain !== undefined ? { gain: m.gain } : {}),
    ...(m.normalize ? { normalize: true } : {}),
    clips: m.clips.map(toClipYaml),
  }));
  if (mixes.length > 0) doc['mixes'] = mixes;
  if (cfg.favorites && cfg.favorites.length > 0) doc['favorites'] = cfg.favorites.map((f) => ({ track: f.track, seed: f.seed }));
  if (cfg.scenes && cfg.scenes.length > 0) {
    doc['scenes'] = cfg.scenes; // never dropped silently: the server refuses the mix and says so
  }
  return dump(prune(doc), { noRefs: true, lineWidth: 1000 });
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === null || v === '') {
      delete obj[key];
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      prune(v as Record<string, unknown>);
      if (Object.keys(v as object).length === 0) delete obj[key];
    }
  }
  return obj;
}

/** A clip as it is written: the keys at their default (start 0, gain 1, no mute, no fades) stay out of the file. */
function toClipYaml(c: MixClip): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (c.track) {
    o['track'] = c.track;
    if (c.variant && c.variant !== 1) o['variant'] = c.variant;
  } else if (c.file) {
    o['file'] = c.file;
  }
  if (c.start) o['start'] = c.start;
  if (c.gain != null && c.gain !== 1) o['gain'] = c.gain;
  if (c.mute) o['mute'] = true;
  if (c.fade_in) o['fade_in'] = c.fade_in;
  if (c.fade_out) o['fade_out'] = c.fade_out;
  if (c.trim_start != null && c.trim_start > 0) o['trim_start'] = c.trim_start;
  if (c.trim_end != null) o['trim_end'] = c.trim_end;
  return o;
}
