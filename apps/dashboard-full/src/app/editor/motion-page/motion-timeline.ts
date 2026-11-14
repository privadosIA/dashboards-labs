/**
 * The timeline a motion-graphic page may declare: one `<script type="application/json" id="motion-timeline">`
 * block with the tracks that animate it (see the motion-graphics spec). The editor reads the block out of the
 * page's HTML, edits it as an object and writes it back in the same place, touching nothing else of the page.
 */

export const TIMELINE_PROPS = ['opacity', 'x', 'y', 'scale', 'scaleX', 'rotate', 'blur', 'reveal'] as const;
export type TimelineProp = (typeof TIMELINE_PROPS)[number];

/** The allowed range of each property, the same the renderer's script enforces. */
export const TIMELINE_RANGES: Record<TimelineProp, [number, number]> = {
  opacity: [0, 1],
  x: [-1e5, 1e5],
  y: [-1e5, 1e5],
  scale: [0, 1e3],
  scaleX: [0, 1e3],
  rotate: [-1e5, 1e5],
  blur: [0, 1e3],
  reveal: [0, 1],
};

export const TIMELINE_CURVES = ['linear', 'in', 'out', 'in-out', 'out-back'] as const;

/** The editing step of times, in seconds. */
export const TIMELINE_STEP = 0.05;

export type TimelineValues = Partial<Record<TimelineProp, number>>;

export interface TimelineTrack {
  id: string;
  label?: string;
  target: string;
  start: number;
  duration: number;
  /** A curve name, or the four numbers of a cubic-bezier; absent means `out`. */
  ease?: string | number[];
  /** Seconds between the elements the selector matches. */
  stagger?: number;
  from: TimelineValues;
  to: TimelineValues;
}

export interface Timeline {
  version: 1;
  tracks: TimelineTrack[];
}

const BLOCK = /(<script\b[^>]*\bid\s*=\s*["']motion-timeline["'][^>]*>)([\s\S]*?)(<\/script\s*>)/i;

/** The timeline of a page, or null when it has none (or the block is not one we can edit). */
export function parseTimeline(html: string): Timeline | null {
  const m = BLOCK.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(m[2]) as Timeline;
    if (!data || data.version !== 1 || !Array.isArray(data.tracks)) return null;
    for (const t of data.tracks) {
      if (!t || typeof t !== 'object' || typeof t.id !== 'string') return null;
      t.from = t.from && typeof t.from === 'object' ? t.from : {};
      t.to = t.to && typeof t.to === 'object' ? t.to : {};
    }
    return data;
  } catch {
    return null;
  }
}

/** Whether the page has a timeline block at all (valid or not). */
export function hasTimelineBlock(html: string): boolean {
  return BLOCK.test(html);
}

/** The page with its timeline block replaced by this one; the rest of the page is left byte for byte. */
export function writeTimeline(html: string, tl: Timeline): string {
  const body = '\n{"version":1,"tracks":[\n' + tl.tracks.map((t) => JSON.stringify(t)).join(',\n') + '\n]}\n';
  // A "<" inside a string must not close the script: JSON allows it escaped.
  const safe = body.replace(/</g, '\\u003c');
  return html.replace(BLOCK, (_m, open: string, _old: string, close: string) => open + safe + close);
}

/** A time rounded to the editing step (and to two decimals, so 0.15 does not show as 0.15000000000000002). */
export function snap(seconds: number): number {
  return Math.round(Math.round(seconds / TIMELINE_STEP) * TIMELINE_STEP * 100) / 100;
}

/** The track with a new start/duration, snapped and kept inside [0, total]; the duration is at least one step. */
export function placeTrack(track: TimelineTrack, start: number, duration: number, total: number): TimelineTrack {
  const d = Math.min(Math.max(snap(duration), TIMELINE_STEP), total > 0 ? total : duration);
  const s = Math.min(Math.max(snap(start), 0), Math.max(0, (total > 0 ? total : start + d) - d));
  return { ...track, start: s, duration: d };
}

/** A value kept inside the range of its property. */
export function clampValue(prop: TimelineProp, v: number): number {
  const [lo, hi] = TIMELINE_RANGES[prop];
  return Math.min(hi, Math.max(lo, v));
}

/** The properties a track touches, in the canonical order. */
export function trackProps(track: TimelineTrack): TimelineProp[] {
  return TIMELINE_PROPS.filter((p) => track.from[p] !== undefined || track.to[p] !== undefined);
}

/** Undo and redo of timeline edits: snapshots of the whole block. */
export class TimelineHistory {
  private past: string[] = [];
  private future: string[] = [];

  /** Remembers the timeline as it is before an edit; a new edit drops what could be redone. */
  push(tl: Timeline): void {
    this.past.push(JSON.stringify(tl));
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(current: Timeline): Timeline | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(JSON.stringify(current));
    return JSON.parse(prev) as Timeline;
  }

  redo(current: Timeline): Timeline | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(JSON.stringify(current));
    return JSON.parse(next) as Timeline;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
