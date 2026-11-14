import type { Keyframe, Script } from '@lab/animation-core';

/** An item of a layer as the timeline draws it: where it sits in song seconds and which part it draws. */
export interface ItemBlock {
  readonly layer: string;
  /** The place of the item in its lane. */
  readonly n: number;
  readonly part: string;
  readonly start: number;
  readonly end: number;
}

/** A layer as a lane of the timeline: its items in order. */
export interface LayerLane {
  readonly id: string;
  /** The place of the layer in the drawing order (0 is the lowest). */
  readonly index: number;
  readonly items: readonly ItemBlock[];
}

/** The lanes of a script's layers, in the order the server draws them (the last on top). */
export function layerLanes(script: Script): LayerLane[] {
  return (script.layers ?? []).map((l, index) => ({ id: l.id, index, items: l.items.map((it, n) => ({ layer: l.id, n, part: it.part, start: it.start, end: it.end })) }));
}

/** A row under the lanes for one animated parameter of one item: its keyframes are in seconds from the item's start. */
export interface ItemKeyframeRow {
  readonly key: string;
  readonly layer: string;
  readonly item: number;
  readonly part: string;
  readonly param: string;
  readonly start: number;
  readonly end: number;
  readonly frames: readonly Keyframe[];
}

/** One row for every parameter of every item that has keyframes, by layer, item and parameter name. */
export function itemKeyframeRows(script: Script): ItemKeyframeRow[] {
  const rows: ItemKeyframeRow[] = [];
  for (const l of script.layers ?? []) {
    l.items.forEach((it, item) => {
      for (const param of Object.keys(it.animate ?? {}).sort()) {
        const frames = it.animate![param];
        if (frames.length > 0) rows.push({ key: `${l.id}:${item}:${param}`, layer: l.id, item, part: it.part, param, start: it.start, end: it.end, frames });
      }
    });
  }
  return rows;
}
