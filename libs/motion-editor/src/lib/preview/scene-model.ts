import { hasAnimateFeature, hasLayersFeature, touches, type Animate, type Catalog, type Design, type Mode, type Part, type PartText, type PieceDesign, type PieceDetail, type Script, type ScriptLine, type ScriptPiece, type SongMap, type Stage, type Theme } from '@lab/animation-core';
import { readDefault, type PartParam } from '@lab/motion-parts';

import { fontKnown } from './fonts';
import type { SceneLayerItem } from './layer-script';
import { round3 } from './song-slice';

/** What a page cannot show faithfully, so the canvas can say it in the person's language. */
export type Gap =
  | { readonly kind: 'missing-part'; readonly name: string }
  | { readonly kind: 'stage' }
  | { readonly kind: 'fonts' }
  | { readonly kind: 'browser' }
  /** The piece has keyframes and the server does not say it draws them: the browser's evaluation is the only one. */
  | { readonly kind: 'keyframes' }
  /** The piece has layer items and the server does not say it draws layers: the browser's page is the only one. */
  | { readonly kind: 'layers' }
  /** The scene has a crossfade into it: the frame host blends two frames, which is an approximation of the server's dissolve. */
  | { readonly kind: 'crossfade' };

export type Fidelity = 'exact' | 'approximate';

export interface SceneWord {
  readonly t: string;
  readonly s: number;
  readonly e: number;
}

export interface SceneLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly words: readonly SceneWord[];
  readonly keyword: number;
}

export interface SceneHit {
  readonly word: string;
  readonly at: number;
  readonly length: number;
}

/** A character of an illustrated piece, as the page's stage script reads it (the drawing itself is a placeholder here). */
export interface SceneActor {
  readonly id: string;
  readonly scope: string;
  readonly action: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly aspect: number;
  readonly anchor_x: number;
  readonly anchor_y: number;
  readonly expression: string;
  readonly svg: string;
  /** The character's name, for the label of the placeholder. */
  readonly label: string;
}

/** A part of a scene: its text (or `null` when it could not be read), the parameters resolved and the definition they came from. */
export interface ScenePart {
  readonly name: string;
  readonly description: string;
  readonly fragment: string | null;
  readonly params: Readonly<Record<string, unknown>>;
  readonly defs: readonly PartParam[];
  /** The parameters of this part that change over the piece. */
  readonly animate?: Animate;
}

/** What a page is made from. Times are in the scene's own time (0 is the start of the piece). */
export interface SceneInput {
  readonly id: string;
  /** Where the scene sits in the song. */
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly mode: Mode;
  readonly design: Design;
  readonly part: ScenePart;
  readonly extras: readonly ScenePart[];
  /** The items of the script's layers that show in this scene, in drawing order. */
  readonly layers: readonly SceneLayerItem[];
  readonly lines: readonly SceneLine[];
  readonly hit: SceneHit | null;
  readonly songStart: number;
  readonly songLength: number;
  readonly backdrop: string;
  readonly backdropLabel: string;
  /** The server's CSS stack of each font name, when it said. */
  readonly fontStacks?: Readonly<Record<string, string>>;
  /** What the piece shares across its pages: its CSS, its drawings and the four HUD texts. */
  readonly theme?: Theme;
  /** The main part draws the lyric (`verse: own`) or the word hit (`hit: own`): the page then leaves `#verse` or `#hit` out. */
  readonly verseOwn?: boolean;
  readonly hitOwn?: boolean;
  /** The crossfade into this scene from the one before, in seconds (0 or absent: a cut). */
  readonly fade?: number;
  /** The fonts the server embeds in its pages; the preview has no files for them. */
  readonly fontFiles?: Readonly<Record<string, unknown>>;
  readonly actors: readonly SceneActor[];
  readonly fidelity: Fidelity;
  readonly gaps: readonly Gap[];
}

export interface ScenesInput {
  readonly piece: Pick<PieceDetail, 'width' | 'height' | 'songMap'>;
  readonly design: Design;
  readonly script: Script;
  readonly catalog: Catalog;
  /** The text of each part the editor tried to read: a part with no entry, or with `null`, is drawn as a placeholder. */
  readonly fragments: ReadonlyMap<string, PartText | null>;
  /** Parts to leave out of every page (the "solo" and "hide" aids of the layers panel). */
  readonly hidden?: ReadonlySet<string>;
}

const hasWords = /[\p{L}\p{N}]+/gu;
const wordsOf = (text: string): string[] => (text.toLowerCase().match(hasWords) ?? []);
const trimNonWord = (s: string): string => s.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();

/** Whether `word` is one of the words of `text`, ignoring case and the marks around it (the server's `hasWord`). */
export function hasWord(text: string, word: string): boolean {
  const w = trimNonWord(word);
  return w !== '' && wordsOf(text).includes(w);
}

function coerce(p: PartParam, value: unknown): unknown {
  switch (p.type) {
    case 'int':
      return Math.trunc(Number(value));
    case 'number':
      return Number(value);
    case 'bool':
      return value === true || value === 'true';
    default:
      return String(value);
  }
}

/** The parameters of a part: what the script gives (cast to the type) and the catalog's default for the rest. */
export function resolveParams(defs: readonly PartParam[], given: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of defs) {
    if (Object.prototype.hasOwnProperty.call(given, p.name)) out[p.name] = coerce(p, given[p.name]);
    else out[p.name] = readDefault(p) ?? '';
  }
  return out;
}

/** The design with the fields a piece sets for itself put over it (the server's `Design.With`). */
export function designWith(design: Design, o: PieceDesign | undefined): Design {
  if (!o) return design;
  return {
    ...design,
    ...(o.dark ? { dark: o.dark } : {}),
    ...(o.light ? { light: o.light } : {}),
    ...(o.accent ? { accent: o.accent } : {}),
    ...(o.display ? { display: o.display } : {}),
    ...(o.body ? { body: o.body } : {}),
    ...(o.verse_style ? { verseStyle: o.verse_style } : {}),
    ...(o.hit_style ? { hitStyle: o.hit_style } : {}),
  };
}

/** The mode of a section tag in a design. */
export const modeFor = (design: Design, tag: string | undefined): Mode => design.modes[(tag ?? '').trim().toLowerCase()] ?? (design.defaultMode === 'light' ? 'light' : 'dark');

function lineOf(l: ScriptLine, p: ScriptPiece, map: SongMap): SceneLine {
  const own = l.line !== undefined ? map.words.filter((w) => w.line === l.line) : [];
  const text = l.line !== undefined ? own.map((w) => w.text).join(' ') : (l.text ?? '');
  const words: SceneWord[] = own.map((w) => ({ t: w.text, s: round3(w.start - p.start), e: round3(w.end - p.start) }));
  let start: number;
  let end: number;
  if (l.line !== undefined) {
    start = words.length > 0 ? words[0].s : 0;
    end = words.length > 0 ? words[words.length - 1].e : 0;
  } else {
    start = round3((l.start ?? 0) - p.start);
    end = round3((l.end ?? 0) - p.start);
  }
  if (start < 0) start = 0; // a line that began in the piece before: shown from the start
  let keyword = -1;
  if (l.keyword) {
    if (words.length > 0) keyword = words.findIndex((w) => hasWord(w.t, l.keyword!));
    else if (hasWord(text, l.keyword)) keyword = 0;
  }
  return { text, start, end, words, keyword };
}

/** The crossfade into a script piece: its own, else the design's; none for the first piece. */
export function fadeInto(design: Pick<Design, 'transitionSeconds'>, script: Script, index: number): number {
  if (index <= 0) return 0;
  const v = script.pieces[index]?.transition_seconds ?? design.transitionSeconds ?? 0;
  return v > 0 ? Math.min(2, v) : 0;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The silhouette that stands in for a character the browser cannot draw: a labelled figure the stage script moves like the real one. */
function actorOf(c: NonNullable<Stage['characters']>[number], i: number): SceneActor {
  const id = `a${i + 1}`;
  return {
    id,
    scope: `char-${c.character}-${id}`,
    action: c.action ?? '',
    x: c.x,
    y: c.y,
    size: c.size,
    aspect: 0.6,
    anchor_x: 0.5,
    anchor_y: 1,
    expression: c.expression ?? 'neutral',
    label: c.character,
    svg: `<svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg"><ellipse cx="30" cy="22" rx="16" ry="18" fill="currentColor" opacity=".55"/><rect x="10" y="40" width="40" height="58" rx="12" fill="currentColor" opacity=".35"/><text x="30" y="72" text-anchor="middle" font-size="9" fill="var(--bg)" font-family="sans-serif">${esc(c.character)}</text></svg>`,
  };
}

function partOf(name: string, given: Readonly<Record<string, unknown>> | undefined, catalog: Catalog, fragments: ScenesInput['fragments'], animate?: Animate): ScenePart {
  const part: Part | undefined = catalog.parts.find((p) => p.name === name);
  const defs = part?.params ?? [];
  return { name, description: part?.description ?? '', fragment: fragments.get(name)?.fragment ?? null, params: resolveParams(defs, given), defs, ...(animate && Object.keys(animate).length > 0 ? { animate } : {}) };
}

/** The scenes of a script, one per piece, with the gaps of each. The twin of the server's `sceneFor`, over the browser's data. */
export function scenesOf({ piece, design, script, catalog, fragments, hidden }: ScenesInput): SceneInput[] {
  const stacks = catalog.fontStacks;
  const fonts = (d: Design): boolean => !fontKnown(d.display, stacks) || !fontKnown(d.body, stacks);
  return script.pieces.map((p, index) => {
    const d = designWith(design, p.design);
    const fade = fadeInto(design, script, index);
    const mainDef = catalog.parts.find((x) => x.name === p.part);
    const main = partOf(p.part, p.params, catalog, fragments, p.animate);
    const extras = (p.with ?? []).map((w) => partOf(w.part, w.params, catalog, fragments, w.animate));
    const gone = (s: ScenePart): ScenePart => (hidden?.has(s.name) ? { ...s, fragment: '' } : s);
    const items: SceneLayerItem[] = (script.layers ?? []).flatMap((l) => l.items.filter((it) => touches(it, p)).map((it) => ({ part: partOf(it.part, it.params, catalog, fragments, it.animate), from: it.start, to: it.end })));
    const parts = [main, ...extras, ...items.map((it) => it.part)];
    const gaps: Gap[] = [{ kind: 'browser' }];
    for (const s of parts) if (s.fragment === null && !hidden?.has(s.name)) gaps.push({ kind: 'missing-part', name: s.name });
    if (p.stage?.characters?.length || p.stage?.background) gaps.push({ kind: 'stage' });
    const packed = (n: string): boolean => !!catalog.fontFiles && Object.prototype.hasOwnProperty.call(catalog.fontFiles, n);
    if (fonts(d) || packed(d.display) || packed(d.body)) gaps.push({ kind: 'fonts' });
    if (fade > 0) gaps.push({ kind: 'crossfade' });
    if (parts.some((s) => s.animate) && !hasAnimateFeature(catalog)) gaps.push({ kind: 'keyframes' });
    if (items.length > 0 && !hasLayersFeature(catalog)) gaps.push({ kind: 'layers' });
    const stage = p.stage;
    return {
      id: p.id,
      start: p.start,
      end: p.end,
      duration: round3(p.end - p.start),
      width: piece.width,
      height: piece.height,
      mode: p.mode ?? modeFor(d, p.section),
      design: d,
      part: gone(main),
      extras: extras.map(gone),
      layers: items.map((it) => ({ ...it, part: gone(it.part) })),
      lines: (p.lines ?? []).map((l) => lineOf(l, p, piece.songMap)),
      hit: p.hit ? { word: p.hit.word, at: Math.max(0, round3(p.hit.at - p.start)), length: p.hit.length } : null,
      songStart: p.start,
      songLength: piece.songMap.duration,
      backdrop: '',
      backdropLabel: stage?.background ?? '',
      ...(stacks ? { fontStacks: stacks } : {}),
      ...(catalog.fontFiles ? { fontFiles: catalog.fontFiles } : {}),
      ...(design.theme ? { theme: design.theme } : {}),
      ...(mainDef?.verse === 'own' ? { verseOwn: true } : {}),
      ...(mainDef?.hit === 'own' ? { hitOwn: true } : {}),
      ...(fade > 0 ? { fade } : {}),
      actors: (stage?.characters ?? []).map(actorOf),
      // A page built here is never exact: the server's own is the only exact one.
      fidelity: 'approximate',
      gaps,
    } satisfies SceneInput;
  });
}
