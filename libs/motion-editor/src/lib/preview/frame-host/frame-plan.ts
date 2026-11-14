/** What the plan needs to know of a page: where its scene sits in the song. */
export interface PlannedPage {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  /** The crossfade into this scene from the one before, in seconds. */
  readonly fade?: number;
}

/** Seconds before a cut at which the next scene's frame is loaded, so the cut does not flash. */
export const PRELOAD_SECONDS = 2;

/** The index of the scene that holds song time `t`: `[start, end)`, and the last one also holds its end. `-1` for no scenes. */
export function sceneAt(pages: readonly PlannedPage[], t: number): number {
  if (pages.length === 0) return -1;
  for (let i = 0; i < pages.length; i++) {
    if (t >= pages[i].start - 1e-9 && t < pages[i].end - 1e-9) return i;
  }
  return t < pages[0].start ? 0 : pages.length - 1;
}

export type Slots = readonly [string | null, string | null];

export interface FramePlan {
  /** The index of the scene being shown, and its time in its own seconds. */
  readonly current: number;
  readonly local: number;
  /** The scene loaded in the other frame, when the playhead is near its cut. */
  readonly preload: number | null;
  /** Which page each of the two frames must hold now. */
  readonly slots: Slots;
  /** Which of the two frames is on screen. */
  readonly visible: 0 | 1;
  /** How much of the other frame shows over it while a crossfade runs (0 when none): the next scene fades in during the `fade` seconds before its start. */
  readonly blend: number;
}

/**
 * Decides what the two frames hold and which one shows. The current scene stays in the frame that already holds it, else it takes the one
 * that does not hold the preloaded scene; the next scene is loaded in the other frame once the playhead is within `PRELOAD_SECONDS` of its
 * cut, and the frame of a scene that has passed is free for the one after.
 */
export function planFrames(pages: readonly PlannedPage[], t: number, slots: Slots): FramePlan {
  const current = sceneAt(pages, t);
  if (current < 0) return { current: -1, local: 0, preload: null, slots: [null, null], visible: 0, blend: 0 };
  const page = pages[current];
  const local = t - page.start;
  const next = current + 1 < pages.length ? pages[current + 1] : undefined;
  const fade = next?.fade ?? 0;
  const preload = next && page.end - t <= Math.max(PRELOAD_SECONDS, fade) ? current + 1 : null;
  const blend = next && fade > 0 && t >= next.start - fade ? Math.min(1, (t - (next.start - fade)) / fade) : 0;
  const nextId = preload !== null ? pages[preload].id : null;

  let visible: 0 | 1;
  if (slots[0] === page.id) visible = 0;
  else if (slots[1] === page.id) visible = 1;
  else visible = slots[0] === nextId && nextId !== null ? 1 : slots[1] === nextId && nextId !== null ? 0 : slots[0] === null ? 0 : slots[1] === null ? 1 : 0;

  const out: [string | null, string | null] = [slots[0], slots[1]];
  out[visible] = page.id;
  const other = visible === 0 ? 1 : 0;
  if (nextId !== null) out[other] = nextId;
  else if (out[other] === page.id) out[other] = null;
  return { current, local, preload, slots: out, visible, blend };
}
