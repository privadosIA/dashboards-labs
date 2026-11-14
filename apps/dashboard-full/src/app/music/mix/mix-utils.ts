import { Mix, MixClip, MixManifestEntry } from '../../core/api.models';

export { beatGrid, beatsPerBar, nudgeStep, snapTo } from '../wave/snap';

/** Seconds a clip with no known length is drawn as (its audio is not readable yet). */
export const UNKNOWN_CLIP_SECONDS = 10;
/** The shortest part of a clip a trim can leave. */
export const MIN_CLIP_SECONDS = 0.1;

export interface UsedRange {
  /** Where the used part begins in the original, seconds. */
  from: number;
  /** Where it ends. */
  to: number;
  /** Its length. */
  used: number;
}

/** The part of the original a clip plays: trim_start to trim_end, clamped to the file when its length is known. */
export function usedRange(clip: MixClip, duration: number | null): UsedRange {
  const from = Math.max(0, clip.trim_start ?? 0);
  let to = clip.trim_end ?? duration ?? from + UNKNOWN_CLIP_SECONDS;
  if (duration != null) to = Math.min(to, duration);
  to = Math.max(to, from + MIN_CLIP_SECONDS);
  return { from, to, used: to - from };
}

/** The second of the mix where a clip ends. */
export function clipEnd(clip: MixClip, duration: number | null): number {
  return (clip.start ?? 0) + usedRange(clip, duration).used;
}

/** The loudness a mix is normalised to (config.NormalizeLUFS on the server). */
export const NORMALIZE_LUFS = -14;

/** A clip as the loudness estimate sees it: where it plays, for how long, how loud its file is and its volume. */
export interface LoudnessPart {
  start: number;
  used: number;
  lufs: number;
  gain: number;
}

/**
 * An estimate of the integrated loudness of a mix before its master volume:
 * the clips' powers add where they overlap, averaged over the time any of them
 * plays (the loudness measure leaves silence out). It treats each clip as
 * steady and the clips as unrelated signals, so it is a couple of dB off at
 * worst; the rendered file is what has the exact figure. Null with nothing to measure.
 */
export function estimateLoudness(parts: LoudnessPart[]): number | null {
  const audible = parts.filter((p) => p.used > 0 && p.gain > 0 && Number.isFinite(p.lufs));
  if (audible.length === 0) return null;
  const spans = audible.map((p) => [p.start, p.start + p.used] as const).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let [from, to] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s > to) {
      covered += to - from;
      [from, to] = [s, e];
    } else to = Math.max(to, e);
  }
  covered += to - from;
  const power = audible.reduce((sum, p) => sum + p.used * 10 ** ((p.lufs + 20 * Math.log10(p.gain)) / 10), 0);
  return 10 * Math.log10(power / covered);
}

/** Overlaps shorter than this (seconds) are not worth a fade. */
const MIN_OVERLAP = 0.05;

/**
 * The fades that crossfade every overlap: where a clip starts before the
 * previous one (by start time) has ended, the earlier fades out and the later
 * fades in over the overlap, capped to the shorter clip. Muted clips are left
 * alone. Only the changes are returned, so applying it twice changes nothing.
 * `durations` are the files' lengths (null when unknown), in `clips` order.
 */
export function overlapFades(clips: MixClip[], durations: (number | null)[]): { index: number; patch: Partial<MixClip> }[] {
  const order = clips.map((_, i) => i).filter((i) => !clips[i].mute).sort((a, b) => (clips[a].start ?? 0) - (clips[b].start ?? 0) || a - b);
  const wanted = new Map<number, Partial<MixClip>>();
  for (let k = 0; k + 1 < order.length; k++) {
    const a = order[k];
    const b = order[k + 1];
    const raw = clipEnd(clips[a], durations[a]) - (clips[b].start ?? 0);
    if (raw < MIN_OVERLAP) continue;
    const overlap = Math.round(Math.min(raw, usedRange(clips[a], durations[a]).used, usedRange(clips[b], durations[b]).used) * 1000) / 1000;
    wanted.set(a, { ...wanted.get(a), fade_out: overlap });
    wanted.set(b, { ...wanted.get(b), fade_in: overlap });
  }
  const out: { index: number; patch: Partial<MixClip> }[] = [];
  for (const [index, patch] of wanted) {
    const c = clips[index];
    const changed: Partial<MixClip> = {};
    if (patch.fade_in !== undefined && patch.fade_in !== (c.fade_in ?? 0)) changed.fade_in = patch.fade_in;
    if (patch.fade_out !== undefined && patch.fade_out !== (c.fade_out ?? 0)) changed.fade_out = patch.fade_out;
    if (Object.keys(changed).length > 0) out.push({ index, patch: changed });
  }
  return out.sort((x, y) => x.index - y.index);
}

/** Seconds between two ruler marks so that they are at least `minPx` apart. */
export function tickStep(pxPerSecond: number, minPx = 70): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) {
    if (step * pxPerSecond >= minPx) return step;
  }
  return 1200;
}

/** m:ss for a ruler label. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The clip with every default filled in, for comparing what is edited with what was rendered. */
function normalized(c: MixClip): Record<string, unknown> {
  return {
    track: c.track ?? null,
    variant: c.track ? (c.variant ?? 1) : null,
    file: c.file ?? null,
    start: c.start ?? 0,
    gain: c.gain ?? 1,
    mute: !!c.mute,
    fade_in: c.fade_in ?? 0,
    fade_out: c.fade_out ?? 0,
    trim_start: c.trim_start ?? 0,
    trim_end: c.trim_end ?? null,
  };
}

/** Whether the rendered mix still matches the clips being edited (the file may be stale otherwise). */
export function mixIsCurrent(mix: Mix, entry: MixManifestEntry | null): boolean {
  if (!entry || entry.clips.length !== mix.clips.length) return false;
  if ((mix.gain ?? 1) !== (entry.gain ?? 1) || !!mix.normalize !== !!entry.normalize) return false;
  return mix.clips.every((c, i) => JSON.stringify(normalized(c)) === JSON.stringify(normalized(entry.clips[i])));
}

/**
 * The level a clip plays at, second `t` of its file, given the part it uses
 * (`from` to `to`): its volume, faded in and out in a straight line. The mute
 * is not applied: listening to a track alone plays it whatever its mute.
 */
export function liveGain(clip: MixClip, t: number, from: number, to: number): number {
  const used = Math.max(0, to - from);
  const fadeIn = Math.min(clip.fade_in ?? 0, used); // a fade cannot be longer than the part it fades
  const fadeOut = Math.min(clip.fade_out ?? 0, used);
  let g = clip.gain ?? 1;
  if (fadeIn > 0) g *= Math.min(1, Math.max(0, (t - from) / fadeIn));
  if (fadeOut > 0) g *= Math.min(1, Math.max(0, (to - t) / fadeOut));
  return g;
}
