import { animateAdd, animateEdit, animateMove, animateRemove, animateSet, splitKeyframes } from './keyframes';
import { layerProblems } from './layers';
import { MAX_EXTRA_PARTS, MAX_LAYERS, MAX_LAYER_ITEMS, defaultParams, type Animate, type Catalog, type Keyframe, type Layer, type LayerItem, type Mode, type PartRef, type PieceDesign, type Script, type ScriptLine, type ScriptPiece, type SongMap, type Stage, type WordHit } from './model';

/** The shortest a piece of the script may be, in seconds. */
export const MIN_SECONDS = 0.5;

const round = (n: number): number => Math.round(n * 100) / 100;
const replaceAt = <T>(list: readonly T[], i: number, item: T): T[] => list.map((x, k) => (k === i ? item : x));

/**
 * Moves the cut between piece `i` and the one after it to `at` seconds, so the script keeps covering the song with no
 * gap and no overlap. The cut stays at least `MIN_SECONDS` from the cut before and the one after. The first start and the
 * last end are the song's and do not move; a script with no piece after `i` is left as it is.
 */
export function moveCut(script: Script, i: number, at: number): Script {
  const here = script.pieces[i];
  const next = script.pieces[i + 1];
  if (!here || !next || !Number.isFinite(at)) return script;
  const cut = round(Math.min(Math.max(at, here.start + MIN_SECONDS), next.end - MIN_SECONDS));
  if (cut === here.end) return script;
  return { ...script, pieces: script.pieces.map((p, k) => (k === i ? { ...p, end: cut } : k === i + 1 ? { ...p, start: cut } : p)) };
}

/** A new `start` for piece `i` is the cut after the piece before it. The first piece starts with the song. */
export const moveStart = (script: Script, i: number, at: number): Script => (i <= 0 ? script : moveCut(script, i - 1, at));

/** A new `end` for piece `i` is the cut before the piece after it. The last piece ends with the song. */
export const moveEnd = (script: Script, i: number, at: number): Script => moveCut(script, i, at);

/**
 * Moves piece `i` so that it starts at `start`, shifting both its cuts by the same amount so it keeps its length. The shift is cut short
 * where a neighbour would be left shorter than `MIN_SECONDS`. The first piece has no cut before it and the last none after it: for those the
 * one cut they have moves by the same amount (their length changes), because the song's first start and last end never move.
 */
export function moveBlock(script: Script, i: number, start: number): Script {
  const here = script.pieces[i];
  if (!here || script.pieces.length < 2 || !Number.isFinite(start)) return script;
  const before = script.pieces[i - 1];
  const after = script.pieces[i + 1];
  let delta = start - here.start;
  if (before) delta = Math.max(delta, before.start + MIN_SECONDS - here.start);
  if (after) delta = Math.min(delta, after.end - MIN_SECONDS - here.end);
  // the piece with only one cut moves that cut, never below its own minimum length
  if (!before) delta = Math.max(delta, here.start + MIN_SECONDS - here.end);
  if (!after) delta = Math.min(delta, here.end - (here.start + MIN_SECONDS));
  if (!before && !after) return script;
  const left = before ? round(here.start + delta) : here.start;
  const right = after ? round(here.end + delta) : here.end;
  if (left === here.start && right === here.end) return script;
  return {
    ...script,
    pieces: script.pieces.map((p, k) => (k === i - 1 ? { ...p, end: left } : k === i ? { ...p, start: left, end: right } : k === i + 1 ? { ...p, start: right } : p)),
  };
}

/** Whether the pieces cover `duration` with no gap and no overlap (to a hundredth of a second). */
export function covers(script: Script, duration: number): boolean {
  if (!script.pieces.length || Math.abs(script.pieces[0].start) > 0.01 || Math.abs(script.pieces[script.pieces.length - 1].end - duration) > 0.01) return false;
  return script.pieces.every((p, k) => p.end > p.start && (k === 0 || Math.abs(p.start - script.pieces[k - 1].end) <= 0.01));
}

/** Gives piece `i` another part, with that part's defaults for its parameters (the old ones belong to the old part). */
export function setPart(script: Script, i: number, part: string, catalog: Catalog): Script {
  const piece = script.pieces[i];
  const entry = catalog.parts.find((p) => p.name === part);
  if (!piece || !entry || piece.part === part || (piece.with ?? []).some((x) => x.part === part)) return script;
  return { ...script, pieces: replaceAt(script.pieces, i, { ...piece, part, params: defaultParams(entry) }) };
}

export function setParams(script: Script, i: number, params: Readonly<Record<string, unknown>>): Script {
  const piece = script.pieces[i];
  return piece ? { ...script, pieces: replaceAt(script.pieces, i, { ...piece, params }) } : script;
}

/** Sets the stage of piece `i`, or takes it away with `null`. */
export function setStage(script: Script, i: number, stage: Stage | null): Script {
  const piece = script.pieces[i];
  if (!piece) return script;
  const { stage: _old, ...rest } = piece;
  return { ...script, pieces: replaceAt(script.pieces, i, stage ? { ...rest, stage } : (rest as ScriptPiece)) };
}

export function setMode(script: Script, i: number, mode: Mode | undefined): Script {
  const piece = script.pieces[i];
  if (!piece || piece.mode === mode) return script;
  const { mode: _old, ...rest } = piece;
  return { ...script, pieces: replaceAt(script.pieces, i, mode ? { ...rest, mode } : (rest as ScriptPiece)) };
}

/** The words of a line, as a person reads them (without the marks around them). */
export const wordsOf = (line: ScriptLine): string[] => (line.text ?? '').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);

/** Sets the keyword of the `n`th line of piece `i` (empty for none). A word that is not in the line is not accepted. */
export function setKeyword(script: Script, i: number, n: number, keyword: string): Script {
  const piece = script.pieces[i];
  const line = piece?.lines?.[n];
  if (!piece || !line || (keyword && !wordsOf(line).includes(keyword))) return script;
  const { keyword: _old, ...rest } = line;
  const lines = replaceAt(piece.lines!, n, keyword ? { ...rest, keyword } : rest);
  return { ...script, pieces: replaceAt(script.pieces, i, { ...piece, lines }) };
}

/** Sets or takes away the word hit of piece `i`. A hit must name a word of one of its lines and fall inside the piece. */
export function setHit(script: Script, i: number, hit: WordHit | null): Script {
  const piece = script.pieces[i];
  if (!piece) return script;
  if (hit === null) {
    const { hit: _old, ...rest } = piece;
    return { ...script, pieces: replaceAt(script.pieces, i, rest as ScriptPiece) };
  }
  const at = round(Math.min(Math.max(hit.at, piece.start), piece.end - MIN_SECONDS));
  const length = round(Math.min(Math.max(hit.length, 0.1), piece.end - at));
  return { ...script, pieces: replaceAt(script.pieces, i, { ...piece, hit: { word: hit.word, at, length } }) };
}

/** The words a hit can name: the words of the lines of the piece, once each. */
export const hitWords = (piece: ScriptPiece): string[] => [...new Set((piece.lines ?? []).flatMap(wordsOf))];

/** The piece a server reason is about: it starts with `piece <id>:`. */
export const pieceOf = (reason: string): string | null => /^\s*piece\s+"?([^\s:"]+)"?(?:\s*\(#\d+\))?\s*:/i.exec(reason)?.[1] ?? null;


/** The names of the parts a piece already draws: the main one and the extras. */
export const partsOf = (piece: ScriptPiece): string[] => [piece.part, ...(piece.with ?? []).map((x) => x.part)];

/** The parts an extra could be: those of the catalog the piece does not already draw (the one being changed is let stay). */
export const extraChoices = (piece: ScriptPiece, catalog: Catalog, except?: string): string[] => catalog.parts.map((p) => p.name).filter((n) => n === except || !partsOf(piece).includes(n));

const withExtras = (script: Script, i: number, extras: readonly PartRef[]): Script => {
  const piece = script.pieces[i];
  const { with: _old, ...rest } = piece;
  return { ...script, pieces: replaceAt(script.pieces, i, extras.length ? { ...rest, with: extras } : (rest as ScriptPiece)) };
};

/** Adds an extra part to piece `i`, with that part's defaults. Not when it has three, when the part is not in the catalog or when the piece already draws it. */
export function addExtra(script: Script, i: number, part: string, catalog: Catalog): Script {
  const piece = script.pieces[i];
  const entry = catalog.parts.find((p) => p.name === part);
  if (!piece || !entry || (piece.with ?? []).length >= MAX_EXTRA_PARTS || partsOf(piece).includes(part)) return script;
  return withExtras(script, i, [...(piece.with ?? []), { part, params: defaultParams(entry) }]);
}

export function removeExtra(script: Script, i: number, k: number): Script {
  const piece = script.pieces[i];
  if (!piece?.with?.[k]) return script;
  return withExtras(script, i, piece.with.filter((_, n) => n !== k));
}

/** Moves extra `from` of piece `i` to position `to` among its extras (the others keep their order). The preview draws them in this order, the last on top. */
export function moveExtra(script: Script, i: number, from: number, to: number): Script {
  const extras = script.pieces[i]?.with;
  if (!extras?.[from] || !Number.isInteger(to) || to < 0 || to >= extras.length || to === from) return script;
  const next = extras.filter((_, n) => n !== from);
  next.splice(to, 0, extras[from]);
  return withExtras(script, i, next);
}

/** Gives extra `k` of piece `i` another part, with that part's defaults for its parameters. */
export function setExtraPart(script: Script, i: number, k: number, part: string, catalog: Catalog): Script {
  const piece = script.pieces[i];
  const entry = catalog.parts.find((p) => p.name === part);
  if (!piece?.with?.[k] || !entry || piece.with[k].part === part || partsOf(piece).includes(part)) return script;
  return withExtras(script, i, replaceAt(piece.with, k, { part, params: defaultParams(entry) }));
}

export function setExtraParams(script: Script, i: number, k: number, params: Readonly<Record<string, unknown>>): Script {
  const piece = script.pieces[i];
  if (!piece?.with?.[k]) return script;
  return withExtras(script, i, replaceAt(piece.with, k, { ...piece.with[k], params }));
}

/** Sets the design a piece has of its own; only the fields with a value are kept, and none left means the song's design. */
export function setPieceDesign(script: Script, i: number, design: PieceDesign | null): Script {
  const piece = script.pieces[i];
  if (!piece) return script;
  const { design: _old, ...rest } = piece;
  const kept = Object.fromEntries(Object.entries(design ?? {}).filter(([, v]) => typeof v === 'string' && v !== '')) as PieceDesign;
  return { ...script, pieces: replaceAt(script.pieces, i, Object.keys(kept).length ? { ...rest, design: kept } : (rest as ScriptPiece)) };
}


// ---- Lines: the words that appear on screen -------------------------------------------------------------------------------------------

type WordSource = Pick<SongMap, 'words'>;

/** The words of a text, as a person reads them (without the marks around them). */
export const wordsOfText = (text: string): string[] => text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);

/** The text of a line: the song map's words for a line that points at one (`line`), else its own `text`. */
export const lineText = (l: ScriptLine, map: WordSource): string => (l.line !== undefined ? map.words.filter((w) => w.line === l.line).map((w) => w.text).join(' ') : (l.text ?? ''));

/** When a line starts, in song seconds: its own `start`, or the first word of the song map's line it points at; `null` when unknown. */
export function lineStart(l: ScriptLine, map: WordSource): number | null {
  if (l.line === undefined) return l.start ?? null;
  return map.words.find((w) => w.line === l.line)?.start ?? null;
}

/** When a line ends, in song seconds. */
export function lineEnd(l: ScriptLine, map: WordSource): number | null {
  if (l.line === undefined) return l.end ?? null;
  const own = map.words.filter((w) => w.line === l.line);
  return own.length ? own[own.length - 1].end : null;
}

const keepHit = (piece: ScriptPiece, lines: readonly ScriptLine[], map: WordSource): ScriptPiece => {
  if (!piece.hit) return piece;
  const word = piece.hit.word.toLowerCase();
  const found = lines.some((l) => wordsOfText(lineText(l, map)).some((w) => w.toLowerCase() === word));
  if (found) return piece;
  const { hit: _gone, ...rest } = piece;
  return rest as ScriptPiece;
};

const withLines = (script: Script, i: number, lines: readonly ScriptLine[], map: WordSource): Script => {
  const piece = script.pieces[i];
  const { lines: _old, ...rest } = piece;
  const next = lines.length ? { ...rest, lines } : (rest as ScriptPiece);
  return { ...script, pieces: replaceAt(script.pieces, i, keepHit(next, lines, map)) };
};

/** Adds a line to piece `i`. A line that points at the song map's (`line`) or a free one (`text`, `start` and `end` in song seconds). */
export function addLine(script: Script, i: number, line: ScriptLine, map: WordSource): Script {
  const piece = script.pieces[i];
  if (!piece) return script;
  const free = line.line === undefined;
  if (free && (!(line.text ?? '').trim() || !(Number(line.end) > Number(line.start)))) return script;
  const lines = [...(piece.lines ?? []), line].sort((a, b) => (lineStart(a, map) ?? piece.start) - (lineStart(b, map) ?? piece.start));
  return withLines(script, i, lines, map);
}

/** Takes the `n`th line out of piece `i`; a word hit that no line has any more goes with it. */
export function removeLine(script: Script, i: number, n: number, map: WordSource): Script {
  const piece = script.pieces[i];
  if (!piece?.lines?.[n]) return script;
  return withLines(script, i, piece.lines.filter((_, k) => k !== n), map);
}

/**
 * Changes the words of the `n`th line. A line that pointed at the song map becomes a free one with the same times (the song map's words
 * are not edited); a keyword or a hit that is no longer a word of any line is dropped.
 */
export function setLineText(script: Script, i: number, n: number, text: string, map: WordSource): Script {
  const piece = script.pieces[i];
  const line = piece?.lines?.[n];
  if (!piece || !line || !text.trim()) return script;
  const start = lineStart(line, map) ?? piece.start;
  const end = lineEnd(line, map) ?? piece.end;
  const clean = text.replace(/\s+/g, ' ').trim();
  const keep = line.keyword && wordsOfText(clean).includes(line.keyword) ? { keyword: line.keyword } : {};
  const next: ScriptLine = { text: clean, start: round(start), end: round(Math.max(end, start + 0.1)), ...keep };
  return withLines(script, i, replaceAt(piece.lines!, n, next), map);
}

/** Changes when a free line is on screen. A line that points at the song map becomes a free one, as in `setLineText`. */
export function setLineTimes(script: Script, i: number, n: number, start: number, end: number, map: WordSource): Script {
  const piece = script.pieces[i];
  const line = piece?.lines?.[n];
  if (!piece || !line || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return script;
  const text = lineText(line, map);
  const next: ScriptLine = { text, start: round(start), end: round(end), ...(line.keyword ? { keyword: line.keyword } : {}) };
  return withLines(script, i, replaceAt(piece.lines!, n, next), map);
}

/** Sets the keyword of the `n`th line from the words the line really has (a line of the song map has no `text` of its own). */
export function setLineKeyword(script: Script, i: number, n: number, keyword: string, map: WordSource): Script {
  const piece = script.pieces[i];
  const line = piece?.lines?.[n];
  if (!piece || !line || (keyword && !wordsOfText(lineText(line, map)).includes(keyword))) return script;
  const { keyword: _old, ...rest } = line;
  return { ...script, pieces: replaceAt(script.pieces, i, { ...piece, lines: replaceAt(piece.lines!, n, keyword ? { ...rest, keyword } : rest) }) };
}

/** The words a hit can name: the words of the lines of the piece, once each, read from the song map when a line points at it. */
export const hitWordsIn = (piece: ScriptPiece, map: WordSource): string[] => [...new Set((piece.lines ?? []).flatMap((l) => wordsOfText(lineText(l, map))))];

/** The lines of the song map that fall inside piece `i` (by where they start) and the piece does not have yet: what can be added to it. */
export function availableLines(script: Script, i: number, map: WordSource): { line: number; text: string; start: number }[] {
  const piece = script.pieces[i];
  if (!piece) return [];
  const have = new Set((piece.lines ?? []).filter((l) => l.line !== undefined).map((l) => l.line));
  const byLine = new Map<number, SongMap['words']>();
  for (const w of map.words) if (w.start >= piece.start - 1e-6 && w.start < piece.end - 1e-6) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
  return [...byLine]
    .filter(([line]) => !have.has(line))
    .map(([line, ws]) => ({ line, text: ws.map((w) => w.text).join(' '), start: ws[0].start }));
}

// ---- Keyframes ----------------------------------------------------------------------------------------------------------------------------

/** The length of piece `i`, which is where its keyframes may go (their times are the piece's own seconds). */
const lengthOf = (piece: ScriptPiece): number => Math.round((piece.end - piece.start) * 1000) / 1000;

/** The keyframes of a parameter of piece `i` (of its extra `k` when given). */
export const keyframesOf = (piece: ScriptPiece | undefined, param: string, k?: number): readonly Keyframe[] | undefined => (k === undefined ? piece?.animate : piece?.with?.[k]?.animate)?.[param];

/** Writes `animate` back on piece `i`, or on its extra `k`, taking the field away when no parameter animates any more. */
function withAnimate(script: Script, i: number, k: number | undefined, animate: Animate | undefined): Script {
  const piece = script.pieces[i];
  if (k === undefined) {
    const { animate: _old, ...rest } = piece;
    return { ...script, pieces: replaceAt(script.pieces, i, animate ? { ...rest, animate } : (rest as ScriptPiece)) };
  }
  const { animate: _old, ...ref } = piece.with![k];
  return withExtras(script, i, replaceAt(piece.with!, k, animate ? { ...ref, animate } : (ref as PartRef)));
}

/** The animation of piece `i`'s part (or of its extra `k`), and the piece, or nothing when they are not there. */
const animateOf = (script: Script, i: number, k?: number): { piece: ScriptPiece; animate: Animate | undefined } | null => {
  const piece = script.pieces[i];
  if (!piece || (k !== undefined && !piece.with?.[k])) return null;
  return { piece, animate: k === undefined ? piece.animate : piece.with![k].animate };
};

/**
 * Gives a parameter of piece `i` (or of its extra `k`) these keyframes: put in order, inside the piece, none at the second of the one before.
 * An empty list takes the parameter's animation away, and the field goes when no parameter animates.
 */
export function setKeyframes(script: Script, i: number, param: string, keyframes: readonly Keyframe[], k?: number): Script {
  const at = animateOf(script, i, k);
  return at ? withAnimate(script, i, k, animateSet(at.animate, param, keyframes, lengthOf(at.piece))) : script;
}

/** Adds a keyframe to a parameter, keeping the others; one at the same second takes its place. */
export function addKeyframe(script: Script, i: number, param: string, keyframe: Keyframe, k?: number): Script {
  const at = animateOf(script, i, k);
  return at ? withAnimate(script, i, k, animateAdd(at.animate, param, keyframe, lengthOf(at.piece))) : script;
}

/** Moves keyframe `n` of a parameter to second `t` of the piece, between the keyframes next to it (at least `MIN_KEYFRAME_GAP` from each) and inside the piece. */
export function moveKeyframe(script: Script, i: number, param: string, n: number, t: number, k?: number): Script {
  const at = animateOf(script, i, k);
  if (!at) return script;
  const next = animateMove(at.animate, param, n, t, lengthOf(at.piece));
  return next === at.animate ? script : withAnimate(script, i, k, next);
}

/** Gives keyframe `n` of a parameter another value and/or ease (only the fields given change). */
export function editKeyframe(script: Script, i: number, param: string, n: number, change: Partial<Pick<Keyframe, 'value' | 'ease'>>, k?: number): Script {
  const at = animateOf(script, i, k);
  if (!at) return script;
  const next = animateEdit(at.animate, param, n, change, lengthOf(at.piece));
  return next === at.animate ? script : withAnimate(script, i, k, next);
}

/** Takes keyframe `n` out of a parameter; with none left the parameter stops animating. */
export function removeKeyframe(script: Script, i: number, param: string, n: number, k?: number): Script {
  const at = animateOf(script, i, k);
  if (!at) return script;
  const next = animateRemove(at.animate, param, n, lengthOf(at.piece));
  return next === at.animate ? script : withAnimate(script, i, k, next);
}

/** Takes every animation off piece `i` (its main part and its extras), or off the whole script when `i` is not given. */
export function clearAnimate(script: Script, i?: number): Script {
  const clear = (piece: ScriptPiece): ScriptPiece => {
    const { animate: _a, with: extras, ...rest } = piece;
    return { ...rest, ...(extras ? { with: extras.map(({ animate: _x, ...ref }) => ref as PartRef) } : {}) } as ScriptPiece;
  };
  const pieces = script.pieces.map((p, n) => (i === undefined || i === n ? clear(p) : p));
  // Taking them off the whole script takes the keyframes of the layers' items too.
  if (i !== undefined || !script.layers) return { ...script, pieces };
  return { ...script, pieces, layers: script.layers.map((l) => ({ ...l, items: l.items.map(({ animate: _a, ...it }) => it as LayerItem) })) };
}

/** Whether any piece of the script carries keyframes. */
export const hasKeyframes = (script: Script): boolean =>
  script.pieces.some((p) => Object.keys(p.animate ?? {}).length > 0 || (p.with ?? []).some((w) => Object.keys(w.animate ?? {}).length > 0)) ||
  (script.layers ?? []).some((l) => l.items.some((it) => Object.keys(it.animate ?? {}).length > 0));

// ---- Layers -----------------------------------------------------------------------------------------------------------------------------

/** How long a new item is when there is room for it, in seconds. */
export const DEFAULT_ITEM_SECONDS = 8;

const songEnd = (script: Script): number => script.pieces[script.pieces.length - 1]?.end ?? 0;

/** The layer with this id. */
export const layerOf = (script: Script, id: string): Layer | undefined => script.layers?.find((l) => l.id === id);

/** Whether the script has any layer. */
export const hasLayers = (script: Script): boolean => (script.layers?.length ?? 0) > 0;

/** Writes `layers` back, taking the field away when there is none. */
function withLayers(script: Script, layers: readonly Layer[]): Script {
  const { layers: _old, ...rest } = script;
  return layers.length > 0 ? { ...rest, layers } : (rest as Script);
}

/** The problems `next` has that `script` had not: what an edit would newly break, in the server's words. */
const introduces = (script: Script, next: Script, catalog: Pick<Catalog, 'parts'> | undefined): string | null => {
  if (!catalog) return null;
  const before = new Set(layerProblems(script, catalog).map((p) => p.text));
  return layerProblems(next, catalog).find((p) => !before.has(p.text))?.text ?? null;
};

/** What an edit of the layers would newly break, in the server's words, or nothing: the caller says it when an edit returned the script unchanged. */
export function layerEditProblem(script: Script, next: Script, catalog: Pick<Catalog, 'parts'>): string | null {
  return introduces(script, next, catalog);
}

/** An id for a new layer: `layer-<n>` with the first `n` no layer uses. */
export function newLayerId(script: Script): string {
  const used = new Set((script.layers ?? []).map((l) => l.id));
  for (let n = 1; ; n++) if (!used.has(`layer-${n}`)) return `layer-${n}`;
}

/** Adds an empty layer on top (the last is drawn over the others). Not when there are four already. */
export function addLayer(script: Script, id: string = newLayerId(script)): Script {
  const layers = script.layers ?? [];
  if (layers.length >= MAX_LAYERS || layers.some((l) => l.id === id) || !/^[a-z0-9-]{1,24}$/.test(id)) return script;
  return withLayers(script, [...layers, { id, items: [] }]);
}

export function removeLayer(script: Script, id: string): Script {
  const layers = script.layers ?? [];
  return layers.some((l) => l.id === id) ? withLayers(script, layers.filter((l) => l.id !== id)) : script;
}

/** Puts a layer at place `to` of the drawing order (0 is the lowest). */
export function moveLayer(script: Script, id: string, to: number): Script {
  const layers = script.layers ?? [];
  const from = layers.findIndex((l) => l.id === id);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= layers.length || to === from) return script;
  const next = layers.filter((l) => l.id !== id);
  next.splice(to, 0, layers[from]);
  return withLayers(script, next);
}

/**
 * Where a new item would go in a layer when it is dropped at song second `at`: from there to the end of the free space after it, at most
 * `DEFAULT_ITEM_SECONDS` long; nothing when `at` is inside another item or there is less than `MIN_SECONDS` of room. A layer that does not exist yet is all free.
 */
export function newItemRange(script: Script, layerId: string | null, at: number): { start: number; end: number } | null {
  const end = songEnd(script);
  const start = Math.round(Math.min(Math.max(at, 0), end) * 100) / 100;
  const items = (layerId === null ? undefined : layerOf(script, layerId)?.items) ?? [];
  if (items.some((it) => start > it.start - 1e-9 && start < it.end - 1e-9)) return null;
  const next = items.find((it) => it.start >= start - 1e-9)?.start ?? end;
  const stop = Math.round(Math.min(start + DEFAULT_ITEM_SECONDS, next, end) * 100) / 100;
  return stop - start < MIN_SECONDS - 1e-9 ? null : { start, end: stop };
}

/**
 * Adds an item to a layer, in its place among the others. Not when it would overlap one, lie outside the song, make the layer too long or (with the
 * catalog) break a rule of the server: a part drawn twice on a page, more than eight parts.
 */
export function addItem(script: Script, layerId: string, item: LayerItem, catalog?: Pick<Catalog, 'parts'>): Script {
  const layer = layerOf(script, layerId);
  if (!layer || layer.items.length >= MAX_LAYER_ITEMS || item.end - item.start < MIN_SECONDS - 1e-9 || item.start < -1e-9 || item.end > songEnd(script) + 1e-9) return script;
  if (layer.items.some((it) => item.start < it.end - 1e-9 && item.end > it.start + 1e-9)) return script;
  const items = [...layer.items, item].sort((a, b) => a.start - b.start);
  const next = withLayers(script, (script.layers ?? []).map((l) => (l.id === layerId ? { ...l, items } : l)));
  return introduces(script, next, catalog) ? script : next;
}

/** Makes a new layer on top with this item as its first. Not when there are four layers. */
export function addLayerWithItem(script: Script, item: LayerItem, catalog?: Pick<Catalog, 'parts'>): Script {
  const withLayer = addLayer(script);
  if (withLayer === script) return script;
  const id = withLayer.layers![withLayer.layers!.length - 1].id;
  const next = addItem(withLayer, id, item, catalog);
  return next === withLayer ? script : next;
}

function withItems(script: Script, layerId: string, items: readonly LayerItem[]): Script {
  return withLayers(script, (script.layers ?? []).map((l) => (l.id === layerId ? { ...l, items } : l)));
}

/** The room an item has: after the one before it and before the one after it, inside the song. */
const roomOf = (script: Script, layer: Layer, n: number): { low: number; high: number } => ({ low: n > 0 ? layer.items[n - 1].end : 0, high: n < layer.items.length - 1 ? layer.items[n + 1].start : songEnd(script) });

/** Moves item `n` of a layer to start at `start`, keeping its length, held between its neighbours and the song. */
export function moveItem(script: Script, layerId: string, n: number, start: number, catalog?: Pick<Catalog, 'parts'>): Script {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  if (!layer || !item) return script;
  const { low, high } = roomOf(script, layer, n);
  const length = item.end - item.start;
  if (high - low < length - 1e-9) return script;
  const at = Math.round(Math.min(Math.max(start, low), high - length) * 100) / 100;
  if (at === item.start) return script;
  const next = withItems(script, layerId, layer.items.map((it, i) => (i === n ? { ...it, start: at, end: Math.round((at + length) * 100) / 100 } : it)));
  return introduces(script, next, catalog) ? script : next;
}

/** Moves one end of item `n` to `t`, held between its neighbours and the song, and at least `MIN_SECONDS` long. */
export function resizeItem(script: Script, layerId: string, n: number, edge: 'start' | 'end', t: number, catalog?: Pick<Catalog, 'parts'>): Script {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  if (!layer || !item || !Number.isFinite(t)) return script;
  const { low, high } = roomOf(script, layer, n);
  const moved = edge === 'start' ? Math.min(Math.max(t, low), item.end - MIN_SECONDS) : Math.max(Math.min(t, high), item.start + MIN_SECONDS);
  const at = Math.round(moved * 100) / 100;
  if (at === item[edge]) return script;
  const next = withItems(script, layerId, layer.items.map((it, i) => (i === n ? { ...it, [edge]: at } : it)));
  return introduces(script, next, catalog) ? script : next;
}

/** Sets both ends of item `n` at once, held the same way. */
export function setItemRange(script: Script, layerId: string, n: number, start: number, end: number, catalog?: Pick<Catalog, 'parts'>): Script {
  const first = resizeItem(script, layerId, n, 'start', Math.min(start, end - MIN_SECONDS), catalog);
  return resizeItem(first, layerId, n, 'end', end, catalog);
}

/** Gives item `n` another part, with that part's defaults for its parameters (the keyframes and the old parameters belong to the old part). */
export function setItemPart(script: Script, layerId: string, n: number, part: string, catalog: Catalog): Script {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  const entry = catalog.parts.find((p) => p.name === part);
  if (!layer || !item || !entry || item.part === part) return script;
  const { animate: _a, ...rest } = item;
  const next = withItems(script, layerId, layer.items.map((it, i) => (i === n ? { ...rest, part, params: defaultParams(entry) } : it)));
  return introduces(script, next, catalog) ? script : next;
}

/** Why `part` cannot be the part of item `n`, in the server's words (a part the pages it touches already draw, too many parts), or nothing when it can. */
export function itemPartProblem(script: Script, layerId: string, n: number, part: string, catalog: Catalog): string | null {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  if (!layer || !item || item.part === part || !catalog.parts.some((p) => p.name === part)) return null;
  const { animate: _a, params: _p, ...rest } = item;
  const probe = withItems(script, layerId, layer.items.map((it, i) => (i === n ? { ...rest, part } : it)));
  return introduces(script, probe, catalog);
}

export function setItemParams(script: Script, layerId: string, n: number, params: Readonly<Record<string, unknown>>): Script {
  const layer = layerOf(script, layerId);
  return layer?.items[n] ? withItems(script, layerId, layer.items.map((it, i) => (i === n ? { ...it, params } : it))) : script;
}

export function removeItem(script: Script, layerId: string, n: number): Script {
  const layer = layerOf(script, layerId);
  return layer?.items[n] ? withItems(script, layerId, layer.items.filter((_, i) => i !== n)) : script;
}

/**
 * A copy of item `n` right after it: the same part, parameters and keyframes, from where it ends and as long as it was, shortened to the room there is
 * before the next item or the end of the song (its keyframes beyond the new length go). Not when less than `MIN_SECONDS` are free, and, with the catalog,
 * not when it would break a rule of the server: a part drawn twice on a page (the copy touches a piece the original also touches unless the original ends at a cut).
 */
export function duplicateItem(script: Script, layerId: string, n: number, catalog?: Pick<Catalog, 'parts'>): Script {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  if (!layer || !item) return script;
  const { high } = roomOf(script, layer, n);
  const start = item.end;
  const end = Math.round(Math.min(start + (item.end - item.start), high) * 100) / 100;
  if (end - start < MIN_SECONDS - 1e-9) return script;
  const { animate, ...rest } = structuredClone(item);
  const kept = Object.entries(animate ?? {})
    .map(([param, frames]) => [param, frames.filter((f) => f.t <= end - start + 1e-9)] as const)
    .filter(([, frames]) => frames.length > 0);
  const copy: LayerItem = { ...rest, start, end, ...(kept.length > 0 ? { animate: Object.fromEntries(kept) } : {}) };
  return addItem(script, layerId, copy, catalog);
}

/** Takes every layer off the script. */
export const clearLayers = (script: Script): Script => (hasLayers(script) ? withLayers(script, []) : script);

/** The length of an item, which is where its keyframes may go. */
export const itemLength = (item: Pick<LayerItem, 'start' | 'end'>): number => Math.round((item.end - item.start) * 1000) / 1000;

/** The keyframes of a parameter of item `n`. */
export const itemKeyframes = (script: Script, layerId: string, n: number, param: string): readonly Keyframe[] | undefined => layerOf(script, layerId)?.items[n]?.animate?.[param];

function withItemAnimate(script: Script, layerId: string, n: number, change: (animate: Animate | undefined, length: number) => Animate | undefined): Script {
  const layer = layerOf(script, layerId);
  const item = layer?.items[n];
  if (!layer || !item) return script;
  const next = change(item.animate, itemLength(item));
  if (next === item.animate) return script;
  const { animate: _a, ...rest } = item;
  return withItems(script, layerId, layer.items.map((it, i) => (i === n ? (next ? { ...rest, animate: next } : rest) : it)));
}

export const setItemKeyframes = (script: Script, layerId: string, n: number, param: string, frames: readonly Keyframe[]): Script => withItemAnimate(script, layerId, n, (a, len) => animateSet(a, param, frames, len));
export const addItemKeyframe = (script: Script, layerId: string, n: number, param: string, frame: Keyframe): Script => withItemAnimate(script, layerId, n, (a, len) => animateAdd(a, param, frame, len));
export const moveItemKeyframe = (script: Script, layerId: string, n: number, param: string, k: number, t: number): Script => withItemAnimate(script, layerId, n, (a, len) => animateMove(a, param, k, t, len));
export const editItemKeyframe = (script: Script, layerId: string, n: number, param: string, k: number, change: Partial<Pick<Keyframe, 'value' | 'ease'>>): Script => withItemAnimate(script, layerId, n, (a, len) => animateEdit(a, param, k, change, len));
export const removeItemKeyframe = (script: Script, layerId: string, n: number, param: string, k: number): Script => withItemAnimate(script, layerId, n, (a, len) => animateRemove(a, param, k, len));

// ---- Pieces: split, remove, swap --------------------------------------------------------------------------------------------------------

/**
 * Splits piece `i` at song time `t` into two. Not when either half would be shorter than `MIN_SECONDS`. Keyframes are split at the cut: each half
 * gets the value the parameter has there on its edge, so the picture does not change (`catalog`, when given, says which parameters are whole numbers).
 */
export function splitPiece(script: Script, i: number, t: number, newId: string, map: WordSource, catalog?: Catalog): Script {
  const piece = script.pieces[i];
  if (!piece || !Number.isFinite(t) || t - piece.start < MIN_SECONDS - 1e-9 || piece.end - t < MIN_SECONDS - 1e-9 || script.pieces.some((p) => p.id === newId)) return script;
  const cut = round(t);
  const first = (l: ScriptLine): boolean => (lineStart(l, map) ?? piece.start) < cut;
  const { lines, hit, animate, with: extras, ...shared } = piece;
  const isInt = (part: string, param: string): boolean => catalog?.parts.find((p) => p.name === part)?.params.find((p) => p.name === param)?.type === 'int';
  const halves = (part: string, a: Animate | undefined): { before?: Animate; after?: Animate } => {
    if (!a) return {};
    const before: Record<string, readonly Keyframe[]> = {};
    const after: Record<string, readonly Keyframe[]> = {};
    for (const [name, list] of Object.entries(a)) {
      const split = splitKeyframes(list, cut - piece.start, isInt(part, name));
      before[name] = split.before;
      after[name] = split.after;
    }
    return { before, after };
  };
  const main = halves(piece.part, animate);
  const extraHalves = (extras ?? []).map((e) => ({ ref: e, ...halves(e.part, e.animate) }));
  const withHalf = (which: 'before' | 'after'): { with?: PartRef[] } => {
    if (!extras?.length) return {};
    return { with: extraHalves.map(({ ref, ...h }) => { const { animate: _a, ...rest } = structuredClone(ref); return h[which] ? ({ ...rest, animate: h[which] } as PartRef) : (rest as PartRef); }) };
  };
  const a: ScriptPiece = { ...shared, end: cut, ...(main.before ? { animate: main.before } : {}), ...withHalf('before'), ...(lines?.filter(first).length ? { lines: lines.filter(first) } : {}), ...(hit && hit.at < cut ? { hit } : {}) };
  const b: ScriptPiece = { ...structuredClone(shared), id: newId, start: cut, ...(main.after ? { animate: structuredClone(main.after) } : {}), ...withHalf('after'), ...(lines?.filter((l) => !first(l)).length ? { lines: lines.filter((l) => !first(l)) } : {}), ...(hit && hit.at >= cut ? { hit } : {}) };
  return { ...script, pieces: [...script.pieces.slice(0, i), a, b, ...script.pieces.slice(i + 1)] };
}

/** An id for a new piece: `p<n>` with the first `n` no piece uses. */
export function newPieceId(script: Script): string {
  const used = new Set(script.pieces.map((p) => p.id));
  for (let n = script.pieces.length + 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

/** Takes piece `i` out and gives its time to the one before it (to the one after, for the first). The last remaining piece stays. */
export function removePiece(script: Script, i: number): Script {
  if (script.pieces.length <= 1 || !script.pieces[i]) return script;
  const gone = script.pieces[i];
  const pieces = script.pieces
    .filter((_, k) => k !== i)
    .map((p, k) => {
      if (i === 0 && k === 0) return { ...p, start: gone.start };
      if (i > 0 && k === i - 1) return { ...p, end: gone.end };
      return p;
    });
  return { ...script, pieces };
}

/** Swaps everything of pieces `i` and `j` but their ids, times, sections, lines and hits. */
export function swapContents(script: Script, i: number, j: number): Script {
  const a = script.pieces[i];
  const b = script.pieces[j];
  if (!a || !b || i === j) return script;
  const keep = (p: ScriptPiece) => ({ id: p.id, start: p.start, end: p.end, ...(p.section !== undefined ? { section: p.section } : {}), ...(p.lines ? { lines: p.lines } : {}), ...(p.hit ? { hit: p.hit } : {}) });
  const content = (p: ScriptPiece) => {
    const { id: _i, start: _s, end: _e, section: _c, lines: _l, hit: _h, ...rest } = p;
    return structuredClone(rest);
  };
  return { ...script, pieces: script.pieces.map((p, k) => (k === i ? ({ ...keep(a), ...content(b) } as ScriptPiece) : k === j ? ({ ...keep(b), ...content(a) } as ScriptPiece) : p)) };
}

/** The part that draws nothing: a piece with it is an empty slot of the script, ready to be given another part. */
export const BLANK_PART = 'blank';

/** Whether the piece is an empty slot: the blank part, and nothing else on it. */
export const isEmptyPiece = (piece: ScriptPiece): boolean => piece.part === BLANK_PART && !(piece.with?.length) && !(piece.lines?.length) && !piece.hit;

/**
 * Empties piece `i`: it keeps its id, its times and its section, and becomes the blank part with nothing else (no extras, lines, word hit,
 * stage, own design or mode), so the script still covers the song and the slot is there to be filled. A script whose catalog has no blank
 * part, a piece that is not there and a piece that is already empty are left as they are.
 */
export function emptyPiece(script: Script, i: number, catalog: Catalog): Script {
  const piece = script.pieces[i];
  const blank = catalog.parts.find((p) => p.name === BLANK_PART);
  if (!piece || !blank || isEmptyPiece(piece)) return script;
  const empty: ScriptPiece = { id: piece.id, start: piece.start, end: piece.end, ...(piece.section !== undefined ? { section: piece.section } : {}), part: BLANK_PART, params: defaultParams(blank) };
  return { ...script, pieces: replaceAt(script.pieces, i, empty) };
}
