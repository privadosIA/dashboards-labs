import { layerOf, type Script } from '@lab/animation-core';
import type { ItemSelection, Selection } from '@lab/motion-editor';

/** The block the person has chosen: the part it draws and the stretch of the song it covers. */
export interface Block {
  readonly part: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The part of the chosen block, and where it is in the song: a piece's own part or one of its extras (the piece's stretch), or an item of a layer
 * (its own). A text line, a keyframe or nothing chosen has no part to open.
 */
export function selectedBlock(script: Script, selection: Selection | null, item: ItemSelection | null): Block | null {
  if (item) {
    const it = layerOf(script, item.layer)?.items[item.item];
    return it ? { part: it.part, start: it.start, end: it.end } : null;
  }
  if (!selection || selection.line !== undefined) return null;
  const piece = script.pieces.find((p) => p.id === selection.piece);
  if (!piece) return null;
  const part = selection.extra !== undefined ? piece.with?.[selection.extra]?.part : piece.part;
  return part ? { part, start: piece.start, end: piece.end } : null;
}
