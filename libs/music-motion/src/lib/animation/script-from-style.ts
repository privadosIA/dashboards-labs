import { defaultParams } from '@lab/motion-parts';

import type { Catalog, Design, Level, Part, Script, ScriptPiece, SongMapSection } from '@lab/animation-core';

export interface StyleShape {
  readonly rhythm: number;
  readonly parts: readonly string[];
  readonly design: Pick<Design, 'modes'>;
}

/** What the script built from a style says about itself: the parts it had to swap because the level does not draw them. */
export interface StyleScript {
  readonly script: Script;
  readonly replacements: readonly { readonly from: string; readonly to: string }[];
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * A script that cycles through a style's parts, one every `rhythm` seconds over the song: the song is cut into as many whole slots as
 * fit and the last one takes the remainder. Each part starts with the catalog's default parameters, and each slot takes the mode the
 * design gives the section it starts in. A part that the level does not draw is swapped for the next part of the style (or of the
 * usual ones) that it does, and the swap is reported. A style with no parts uses the usual ones: those the fixed rule would choose.
 * It is a plain start to edit, not what the assistant would write.
 */
export function scriptFromStyle(style: StyleShape, seconds: number, catalog: Catalog, level: Level, sections: readonly SongMapSection[] = []): StyleScript {
  const byName = new Map(catalog.parts.map((p) => [p.name, p]));
  const usual = catalog.parts.filter((p) => !p.manual && p.levels.includes(level));
  const wanted: Part[] = style.parts.length > 0 ? style.parts.map((n) => byName.get(n)).filter((p): p is Part => p !== undefined) : usual;
  const pool = wanted.length > 0 ? wanted : usual;
  const replacements: { from: string; to: string }[] = [];
  const swapped = new Map<string, Part>();
  const drawable = (part: Part): Part => {
    if (part.levels.includes(level)) return part;
    const known = swapped.get(part.name);
    if (known) return known;
    const to = pool.find((p) => p.levels.includes(level)) ?? usual[0] ?? part;
    swapped.set(part.name, to);
    if (to.name !== part.name) replacements.push({ from: part.name, to: to.name });
    return to;
  };

  const total = Math.max(0, seconds);
  const slots = Math.max(1, Math.floor(total / Math.max(1, style.rhythm)));
  const pieces: ScriptPiece[] = [];
  for (let i = 0; i < slots; i++) {
    const start = round(i * style.rhythm);
    const end = i === slots - 1 ? round(Math.max(total, start + 1)) : round((i + 1) * style.rhythm);
    const part = drawable(pool[i % pool.length]);
    const section = sections.find((s) => start >= s.start - 1e-6 && start < s.end - 1e-6) ?? sections[sections.length - 1];
    const tag = section?.tag.toLowerCase();
    const mode = tag ? style.design.modes[tag] : undefined;
    pieces.push({ id: `s${i + 1}`, start, end, ...(tag ? { section: tag } : {}), part: part.name, params: defaultParams(part), ...(mode ? { mode } : {}) });
  }
  return { script: { version: 1, pieces }, replacements };
}
