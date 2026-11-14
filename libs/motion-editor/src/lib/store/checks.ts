import { MAX_EXTRA_PARTS, covers, hasAnimateFeature, hasKeyframes, hasLayers, hasLayersFeature, hitWordsIn, layerProblems, lineText, wordsOfText, type Catalog, type Part, type PartRef, type ScriptPiece, type SongMap } from '@lab/animation-core';

import type { Doc } from './editor-store';

export type WarningKind =
  | 'coverage'
  | 'unknown-part'
  | 'param-type'
  | 'param-range'
  | 'param-length'
  | 'param-option'
  | 'extras-count'
  | 'extras-repeat'
  | 'keyword'
  | 'hit-word'
  | 'level'
  | 'animate-unsupported'
  | 'layers-unsupported'
  | 'layer-problem';

/** Something the server would refuse, as far as the editor can tell; `level` is only information (the server swaps the part); `error` stops Save. */
export interface Warning {
  readonly kind: WarningKind;
  readonly severity: 'error' | 'warning' | 'info';
  /** The piece it is about; none for the song as a whole. */
  readonly piece?: string;
  /** The extra part (its index in `with`), when it is about one. */
  readonly extra?: number;
  /** The part and the parameter, the limit that was crossed, the word, whichever the message names. */
  readonly part?: string;
  readonly param?: string;
  readonly limit?: number;
  readonly text?: string;
  /** The layer and the place of the item in it, for what is about an item of a layer. */
  readonly layer?: string;
  readonly item?: number;
}

function checkParams(piece: string, extra: number | undefined, part: Part, params: Readonly<Record<string, unknown>> | undefined, out: Warning[]): void {
  for (const p of part.params) {
    const v = params?.[p.name];
    if (v === undefined || v === null) continue;
    const at = { piece, ...(extra !== undefined ? { extra } : {}), part: part.name, param: p.name };
    const bad = (kind: WarningKind, limit?: number): number => out.push({ kind, severity: 'warning', ...at, ...(limit !== undefined ? { limit } : {}) });
    switch (p.type) {
      case 'int':
      case 'number': {
        if (typeof v !== 'number' || !Number.isFinite(v) || (p.type === 'int' && !Number.isInteger(v))) bad('param-type');
        else if (p.min !== undefined && v < p.min) bad('param-range', p.min);
        else if (p.max !== undefined && v > p.max) bad('param-range', p.max);
        break;
      }
      case 'string':
        if (typeof v !== 'string') bad('param-type');
        else if (p.maxLength !== undefined && v.length > p.maxLength) bad('param-length', p.maxLength);
        break;
      case 'bool':
        if (typeof v !== 'boolean') bad('param-type');
        break;
      case 'enum':
        if (typeof v !== 'string' || (p.options && !p.options.includes(v))) bad('param-option');
        break;
    }
  }
}

function checkPart(piece: ScriptPiece, extra: number | undefined, ref: Pick<PartRef, 'part' | 'params'>, catalog: Catalog, level: string, out: Warning[]): void {
  const part = catalog.parts.find((p) => p.name === ref.part);
  const at = { piece: piece.id, ...(extra !== undefined ? { extra } : {}), part: ref.part };
  if (!part) {
    out.push({ kind: 'unknown-part', severity: 'warning', ...at });
    return;
  }
  checkParams(piece.id, extra, part, ref.params, out);
  if (!(part.levels as readonly string[]).includes(level)) out.push({ kind: 'level', severity: 'info', ...at, text: level });
}

/**
 * What the server would refuse in the document, as far as the client can tell: a script that does not cover the song, a part that is not in
 * the catalog, a parameter outside its type, limits or options, more than three extras or a repeated part, a keyword or hit word that is not
 * a word of the lines. A part the piece's level does not support is information. The server's answer wins; none of this blocks saving.
 */
export function checkDoc(doc: Doc, map: SongMap, catalog: Catalog, level: string): Warning[] {
  const out: Warning[] = [];
  if (!covers(doc.script, map.duration)) out.push({ kind: 'coverage', severity: 'warning' });
  // A server that does not take keyframes is never handed them: Save waits until they are taken off (the editor does not strip them silently).
  if (hasKeyframes(doc.script) && !hasAnimateFeature(catalog)) out.push({ kind: 'animate-unsupported', severity: 'error' });
  // The same for layers; with them, what the server would refuse in them is marked, in its own words.
  if (hasLayers(doc.script)) {
    if (!hasLayersFeature(catalog)) out.push({ kind: 'layers-unsupported', severity: 'error' });
    else
      for (const p of layerProblems(doc.script, catalog))
        out.push({ kind: 'layer-problem', severity: 'warning', text: p.text, ...(p.piece !== undefined ? { piece: p.piece } : {}), ...(p.layer !== undefined ? { layer: p.layer } : {}), ...(p.item !== undefined ? { item: p.item } : {}) });
  }
  for (const piece of doc.script.pieces) {
    checkPart(piece, undefined, { part: piece.part, params: piece.params }, catalog, level, out);
    const extras = piece.with ?? [];
    if (extras.length > MAX_EXTRA_PARTS) out.push({ kind: 'extras-count', severity: 'warning', piece: piece.id, limit: MAX_EXTRA_PARTS });
    extras.forEach((e, k) => {
      checkPart(piece, k, e, catalog, level, out);
      if (e.part === piece.part || extras.findIndex((x) => x.part === e.part) !== k) out.push({ kind: 'extras-repeat', severity: 'warning', piece: piece.id, extra: k, part: e.part });
    });
    (piece.lines ?? []).forEach((l) => {
      if (l.keyword && !wordsOfText(lineText(l, map)).includes(l.keyword)) out.push({ kind: 'keyword', severity: 'warning', piece: piece.id, text: l.keyword });
    });
    if (piece.hit && !hitWordsIn(piece, map).includes(piece.hit.word)) out.push({ kind: 'hit-word', severity: 'warning', piece: piece.id, text: piece.hit.word });
  }
  return out;
}
