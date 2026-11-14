import { hitWords, moveEnd, moveStart, setHit, setKeyword, setMode, setPart, type Catalog, type Mode, type Script, type ScriptPiece } from '@lab/animation-core';

export type RowModel = Record<string, unknown>;

export const keywordKey = (n: number): string => `keyword_${n}`;

/** The fields of a piece's form: part, mode, the two times, a keyword for each line and the word hit. */
export function toRowModel(piece: ScriptPiece, defaultMode: Mode): RowModel {
  const model: RowModel = { part: piece.part, mode: piece.mode ?? defaultMode, start: piece.start, end: piece.end, hitWord: piece.hit?.word ?? '', hitAt: piece.hit?.at ?? piece.start, hitLength: piece.hit?.length ?? 1 };
  (piece.lines ?? []).forEach((line, n) => (model[keywordKey(n)] = line.keyword ?? ''));
  return model;
}

const same = (a: unknown, b: unknown): boolean => (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : (a ?? '') === (b ?? ''));

/** Whether the form's fields say what the piece already says. */
export const unchanged = (model: RowModel, piece: ScriptPiece, defaultMode: Mode): boolean => {
  const now = toRowModel(piece, defaultMode);
  return Object.keys(now).every((k) => same(model[k], now[k]));
};

/**
 * The script with what the person changed in piece `i`'s form applied, one field at a time: the part (which brings its
 * own defaults), the mode, the cuts (which move the neighbours), the keywords and the word hit. A field that says what
 * the piece already says changes nothing.
 */
export function applyRow(script: Script, i: number, model: RowModel, catalog: Catalog, defaultMode: Mode): Script {
  let next = script;
  const piece = script.pieces[i];
  if (!piece) return script;
  const now = toRowModel(piece, defaultMode);
  if (typeof model['part'] === 'string' && model['part'] !== now['part']) next = setPart(next, i, model['part'], catalog);
  if ((model['mode'] === 'dark' || model['mode'] === 'light') && model['mode'] !== now['mode']) next = setMode(next, i, model['mode'] as Mode);
  if (!same(model['start'], now['start']) && model['start'] !== '' && model['start'] !== null) next = moveStart(next, i, Number(model['start']));
  if (!same(model['end'], now['end']) && model['end'] !== '' && model['end'] !== null) next = moveEnd(next, i, Number(model['end']));
  (piece.lines ?? []).forEach((_, n) => {
    const k = keywordKey(n);
    if (k in model && !same(model[k], now[k])) next = setKeyword(next, i, n, String(model[k] ?? ''));
  });
  const word = String(model['hitWord'] ?? '');
  const hitChanged = !same(word, now['hitWord']) || (word !== '' && (!same(model['hitAt'], now['hitAt']) || !same(model['hitLength'], now['hitLength'])));
  if (hitChanged) {
    const current = next.pieces[i];
    if (word === '') next = setHit(next, i, null);
    else if (hitWords(current).includes(word)) next = setHit(next, i, { word, at: Number(model['hitAt'] ?? current.start), length: Number(model['hitLength'] ?? 1) });
  }
  return next;
}
