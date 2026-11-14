import { MIN_SECONDS, type Animate, type Design, type Layer, type LayerItem, type PartRef, type Script, type ScriptPiece, type SongMap } from '@lab/animation-core';

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** Keyframes of a piece that was `from` seconds long and is now `to` long: their times (the piece's own seconds) go with it. */
function scaleAnimate(animate: Animate | undefined, from: number, to: number): Animate | undefined {
  if (!animate) return undefined;
  const factor = from > 0 ? to / from : 1;
  const scaled: Record<string, readonly { t: number; value: string | number | boolean; ease?: never }[]> = {};
  for (const [name, list] of Object.entries(animate)) {
    // Strictly increasing and inside the piece, whatever the rounding does.
    scaled[name] = list.map((k, i) => ({ ...k, t: Math.min(round(k.t * factor), to) })).filter((k, i, all) => i === 0 || k.t > all[i - 1].t) as never;
  }
  return scaled as Animate;
}

/**
 * A script made for one song, put on another. The times of its pieces are scaled by the length of the new song's map over the old
 * length and made to cover `[0, duration]` exactly (each piece starts where the one before ends, the last one ends with the song); the
 * section of each piece is taken again from the new song's sections, where its start falls, and its mode from the design's modes for that
 * section. The `lines` and the word `hit` belong to the old song's words and are dropped. Everything else of a piece (its part, its
 * parameters, its keyframes with their times scaled with the piece, its extra parts, its stage, its own design) is kept. A piece that collapses to nothing is dropped and its time goes to the next.
 * `oldSeconds` is the length of the song the script was made for; with none, the end of its last piece stands in.
 */
export function fitScript(script: Script, oldSeconds: number, songMap: SongMap, design: Pick<Design, 'modes'>): Script {
  const sorted = [...script.pieces].sort((a, b) => a.start - b.start);
  const duration = round(songMap.duration);
  const base = oldSeconds > 0 ? oldSeconds : Math.max(1, ...sorted.map((p) => p.end));
  const scale = duration / base;

  const pieces: ScriptPiece[] = [];
  let at = 0;
  sorted.forEach((p, i) => {
    const last = i === sorted.length - 1;
    const end = last ? duration : Math.min(duration, round(p.end * scale));
    if (end <= at + 1e-6 && !last) return;
    const start = at;
    const section = songMap.sections.find((s) => start >= s.start - 1e-6 && start < s.end - 1e-6) ?? songMap.sections[songMap.sections.length - 1];
    const tag = section?.tag.toLowerCase();
    const mode = tag ? design.modes[tag] : undefined;
    // What stays of the piece: its own choices, not what was read from the old song.
    const { lines: _lines, hit: _hit, section: _section, mode: _mode, animate, with: extras, ...kept } = p;
    const newEnd = Math.max(end, start + 0.001);
    const from = p.end - p.start;
    const to = newEnd - start;
    const moving = scaleAnimate(animate, from, to);
    const withScaled: PartRef[] | undefined = extras?.map((e) => ({ ...e, ...(e.animate ? { animate: scaleAnimate(e.animate, from, to) } : {}) }));
    pieces.push({ ...kept, ...(moving ? { animate: moving } : {}), ...(withScaled ? { with: withScaled } : {}), start, end: newEnd, ...(tag ? { section: tag } : {}), ...(mode ? { mode } : {}) } as ScriptPiece);
    at = end;
  });
  return { version: 1, pieces, ...(script.layers?.length ? { layers: fitLayers(script.layers, scale, duration) } : {}) };
}

/**
 * The layers of a script on another song: every item's times are scaled with the song and held inside it, in order within its lane; an item that
 * collapses to less than half a second is dropped, and its keyframes' times are scaled with it. A lane left with no item is kept (it may be filled).
 */
function fitLayers(layers: readonly Layer[], scale: number, duration: number): Layer[] {
  return layers.map((l) => {
    const items: LayerItem[] = [];
    let at = 0;
    for (const it of [...l.items].sort((a, b) => a.start - b.start)) {
      const start = Math.max(round(it.start * scale), at);
      const end = Math.min(round(it.end * scale), duration);
      if (end - start < MIN_SECONDS - 1e-9) continue;
      const moving = scaleAnimate(it.animate, it.end - it.start, end - start);
      const { animate: _a, ...rest } = it;
      items.push({ ...rest, start, end, ...(moving ? { animate: moving } : {}) });
      at = end;
    }
    return { ...l, items };
  });
}
