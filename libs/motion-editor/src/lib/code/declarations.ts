import type { Catalog, Part, PartParam, SongMap } from '@lab/animation-core';
import { HIT_STYLES, VERSE_STYLES, hasAnimateFeature, hasLayersFeature } from '@lab/animation-core';

import { tagOf } from './anchors';
import { camelName } from './names';
import { quote } from './to-code';

/** The module the code imports from: its declarations are given to the editor's TypeScript service as this file. */
export const SCRIPT_MODULE = '@motion/script';
export const SCRIPT_DECLARATIONS_PATH = 'file:///node_modules/@motion/script/index.d.ts';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string => (IDENT.test(name) ? name : quote(name));
const comment = (lines: readonly string[], indent: string): string => `${indent}/**\n${lines.map((l) => `${indent} * ${l.replace(/\*\//g, '*\\/')}`).join('\n')}\n${indent} */\n`;

/** A union of the texts, or the type to fall back to when there are none. */
function union(values: readonly string[], none: string): string {
  const unique = [...new Set(values)];
  return unique.length === 0 ? none : unique.map(quote).join(' | ');
}

function limits(p: PartParam): string[] {
  const out: string[] = [];
  if (p.type === 'int' || p.type === 'number') {
    if (p.min !== undefined && p.max !== undefined) out.push(`${p.min}..${p.max}`);
    else if (p.min !== undefined) out.push(`at least ${p.min}`);
    else if (p.max !== undefined) out.push(`at most ${p.max}`);
  }
  if (p.type === 'string' && p.maxLength !== undefined) out.push(`up to ${p.maxLength} characters`);
  return out;
}

function paramType(p: PartParam): string {
  switch (p.type) {
    case 'int':
    case 'number':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'string':
      return 'string';
    case 'enum':
      return union(p.options ?? [], 'string');
  }
}

function paramDeclaration(p: PartParam): string {
  const notes: string[] = [];
  if (p.description) notes.push(p.description);
  const l = limits(p);
  if (l.length > 0) notes.push(`Limits: ${l.join(', ')}.`);
  if (p.default !== '') notes.push(`Default: ${p.default}.`);
  return `${notes.length > 0 ? comment(notes, '    ') : ''}    ${key(p.name)}?: ${paramType(p)};`;
}

/** The keyframes a parameter takes: a list whose values are the parameter's own type (a literal union for an option). */
function keyframesDeclaration(p: PartParam): string {
  return `    ${key(p.name)}?: Keyframe<${paramType(p)}>[];`;
}

function partDeclaration(p: Part, feature: boolean): string {
  const notes = [p.description, `Cost: ${p.costMs} ms. Levels: ${p.levels.join(', ')}.${p.manual ? ' Only drawn when a piece names it.' : ''}`];
  if (p.source === 'user') notes.push('A part of yours.');
  const head = `${comment(notes, '  ')}  ${key(camelName(p.name))}`;
  const moving = feature ? p.params.filter((q) => q.animatable) : [];
  if (p.params.length === 0) return `${head}(): PartCall;`;
  const params = `params?: {\n${p.params.map(paramDeclaration).join('\n')}\n  }`;
  // The second argument is the parameters that change over the piece: only the ones the catalog says can, each with keyframes of its own type.
  const animate = moving.length === 0 ? '' : `, animate?: {\n${moving.map(keyframesDeclaration).join('\n')}\n  }`;
  return `${head}(${params}${animate}): PartCall;`;
}

/**
 * The TypeScript declarations of `@motion/script` for this catalog and this song: `parts` has one function per part of the catalog (camel
 * cased, with its parameters typed, every one optional, and its description and limits as the comment that completion shows), `section`
 * takes the tags of the song and `line` its line numbers, and the stage and the design override take their names from the catalog.
 * TypeScript can flag names, primitive types and options; ranges and lengths are the mapper's marks.
 */
export function declarationsFor(catalog: Catalog, songMap: SongMap): string {
  const tags = songMap.sections.map((s) => tagOf(s.tag));
  const lineNumbers = [...new Set(songMap.words.map((w) => w.line))].sort((a, b) => a - b);
  const backgrounds = union(
    catalog.backgrounds.map((b) => b.name),
    'string',
  );
  const actions = union(catalog.actions, 'string');
  const characters =
    catalog.characters.length === 0
      ? 'export interface StageCharacter {\n  character: string;\n  pose?: string;\n  expression?: string;\n  action?: string;\n  x: number;\n  y: number;\n  size: number;\n}'
      : `export type StageCharacter =\n${catalog.characters
          .map(
            (c) =>
              `  | {\n      character: ${quote(c.name)};\n      pose?: ${union(c.poses, 'string')};\n      expression?: ${union(c.expressions, 'string')};\n      action?: ${actions};\n      /** Percent of the width, where the anchor goes. */\n      x: number;\n      /** Percent of the height, from the top. */\n      y: number;\n      /** The character's height as a percent of the frame's. */\n      size: number;\n    }`,
          )
          .join('\n')};`;

  const feature = hasAnimateFeature(catalog);
  const keyframes = feature
    ? `\n/** How a value goes from a keyframe to the next one: linear (the default), slowly at the start (in), slowly at the end (out), slowly at both (in-out), or a jump (step). */\nexport type Ease = 'linear' | 'in' | 'out' | 'in-out' | 'step';\ndeclare const keyframeBrand: unique symbol;\nexport interface Keyframe<V> {\n  readonly [keyframeBrand]: V;\n}\n/** The value a parameter has at a second of its piece (\`t\`: seconds from the piece's start, or beat(n), section(...).start, song.end). It goes to the next keyframe with \`ease\`. */\nexport declare function kf<V extends string | number | boolean>(t: TimeExpr, value: V, ease?: Ease): Keyframe<V>;\n`
    : '';

  const layers = hasLayersFeature(catalog)
    ? `declare const layerBrand: unique symbol;\ndeclare const layerItemBrand: unique symbol;\nexport interface LayerItem {\n  readonly [layerItemBrand]: never;\n}\nexport interface Layer {\n  readonly [layerBrand]: never;\n}\n/** A part drawn from \`from\` to \`to\` (seconds of the song, or beat(n), section(...).start, song.end) over every piece it touches. Its keyframes are in seconds from \`from\`. A part is drawn once on a page, and a page draws at most eight parts. */\nexport declare function item(part: PartCall, from: TimeExpr, to: TimeExpr): LayerItem;\n/** A lane of items, one after another; the last layer is drawn on top. The id is lower case letters, digits and dashes, up to 24 characters. */\nexport declare function layer(id: string, items: LayerItem[]): Layer;\nexport declare function script(pieces: PieceItem[], layers?: Layer[]): unknown;\n`
    : 'export declare function script(pieces: PieceItem[]): unknown;\n';

  return `declare const timeBrand: unique symbol;
declare const partBrand: unique symbol;
declare const lineBrand: unique symbol;
declare const pieceBrand: unique symbol;

/** A moment of the song: beat(n), section(tag).start or .end, or song.end. A plain number is seconds. */
export interface Time {
  readonly [timeBrand]: never;
}
export type TimeExpr = number | Time;
${keyframes}
/** The tags of the song's sections, in lowercase. */
export type SectionTag = ${union(tags, 'never')};
/** The numbers of the song's lines. */
export type LineNumber = ${lineNumbers.length === 0 ? 'never' : lineNumbers.join(' | ')};

/** The start of beat \`n\`, as the song numbers its beats; \`fraction\` (0 up to 1) goes that far towards the next one. */
export declare function beat(n: number, fraction?: number): Time;

export interface Section {
  readonly start: Time;
  readonly end: Time;
}
/** The \`k\`-th section with that tag (the first by default). */
export declare function section(tag: SectionTag, k?: number): Section;
export declare const song: { readonly end: Time };

export interface Line {
  readonly [lineBrand]: never;
}
/** A line of the song's lyrics, with the word to highlight. */
export declare function line(n: LineNumber, options?: { keyword?: string }): Line;
/** A text of your own, shown between two times. */
export interface FreeLine {
  text: string;
  from: TimeExpr;
  to: TimeExpr;
  keyword?: string;
  line?: number;
}

export interface Hit {
  word: string;
  at: TimeExpr;
  length: number;
}

${characters}
export interface Stage {
  background?: ${backgrounds};
  characters?: StageCharacter[];
}

export interface DesignOverride {
  dark?: string;
  light?: string;
  accent?: string;
  display?: string;
  body?: string;
  verseStyle?: ${union([...VERSE_STYLES], 'string')} | (string & {});
  hitStyle?: ${union([...HIT_STYLES], 'string')} | (string & {});
}

export interface PartCall {
  readonly [partBrand]: never;
}

/** The parts of the catalog. */
export declare const parts: {
${catalog.parts.map((p) => partDeclaration(p, feature)).join('\n')}
};

export interface PieceInput {
  id: string;
  /** Where it starts; the first piece needs it, the others start where the one before ends. */
  from?: TimeExpr;
  to: TimeExpr;
  part: PartCall;
  mode?: 'dark' | 'light';
  section?: string;
  /** Up to three more parts drawn beside the main one. */
  with?: PartCall[];
  lines?: (Line | FreeLine)[];
  hit?: Hit;
  stage?: Stage;
  design?: DesignOverride;
  /** Fields the editor does not know: they are kept as they are. */
  extra?: Record<string, unknown>;
}
export interface PieceItem {
  readonly [pieceBrand]: never;
}
export declare function piece(input: PieceInput): PieceItem;
${layers}`;
}
