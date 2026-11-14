import type { Layer, PartRef, Script, ScriptLine, ScriptPiece, SongMap } from '@lab/animation-core';

import { anchorFor, type TimeRef } from './anchors';
import { camelName, PIECE_JSON_KEYS } from './names';
import { round3 } from '../preview/song-slice';

export interface CodeOptions {
  readonly songMap: SongMap;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const KNOWN = new Set<string>(PIECE_JSON_KEYS);
const ms = (seconds: number): number => Math.floor(seconds * 1000 + 0.5);

/** The names the code imports, in the order of the import line. */
const IMPORT_ORDER = ['script', 'piece', 'layer', 'item', 'parts', 'beat', 'section', 'line', 'kf', 'song'] as const;
type ImportName = (typeof IMPORT_ORDER)[number];

export function quote(text: string): string {
  let out = "'";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}'`;
}

const keyCode = (key: string): string => (IDENT.test(key) ? key : quote(key));

/** A plain value on one line: what the script's JSON holds in parameters, stage and extra fields. */
export function jsonCode(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(jsonCode).join(', ')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  return entries.length === 0 ? '{}' : `{ ${entries.map(([k, v]) => `${keyCode(k)}: ${jsonCode(v)}`).join(', ')} }`;
}

/**
 * The script as code in the dialect: one `piece({...})` per piece, in the order of the script, each key on its own line in a fixed order,
 * two spaces of indentation, single quotes, trailing commas. A time that falls on a beat, a section edge or the end of the song is written
 * as that (`beat(48)`, `section('chorus', 2).start`, `song.end`), any other as seconds with up to three decimals. `from` is written on the
 * first piece and wherever a piece does not start where the one before ended. Mapping the result gives back an equal script.
 */
export function toCode(script: Script, options: CodeOptions): string {
  const used = new Set<ImportName>(['script']);
  const use = (name: ImportName): void => void used.add(name);

  const refCode = (ref: TimeRef): string => {
    switch (ref.kind) {
      case 'seconds':
        return String(round3(ref.value));
      case 'song-end':
        use('song');
        return 'song.end';
      case 'beat':
        use('beat');
        return ref.f !== undefined ? `beat(${ref.n}, ${ref.f})` : `beat(${ref.n})`;
      case 'section':
        use('section');
        return `section(${quote(ref.tag)}${ref.k !== undefined ? `, ${ref.k}` : ''}).${ref.edge}`;
    }
  };
  const timeCode = (seconds: number): string => refCode(anchorFor(seconds, options.songMap) ?? { kind: 'seconds', value: seconds });

  /** A keyframe's time, in the piece's own seconds: an anchor where it lands on the song's structure (never for 0, which is the start of the piece). */
  const keyframeTime = (t: number, start: number): string => {
    const anchor = t === 0 ? undefined : anchorFor(Math.floor((start + t) * 1000 + 0.5) / 1000, options.songMap);
    return anchor ? refCode(anchor) : String(round3(t));
  };

  const animateCode = (animate: NonNullable<PartRef['animate']>, start: number): string => {
    use('kf');
    const entries = Object.entries(animate).map(([param, list]) => `${keyCode(param)}: [${list.map((k) => `kf(${keyframeTime(k.t, start)}, ${jsonCode(k.value)}${k.ease ? `, ${quote(k.ease)}` : ''})`).join(', ')}]`);
    return `{ ${entries.join(', ')} }`;
  };

  /** `parts.name(params)`; with keyframes `parts.name(params, { param: [kf(...)] })`, and `undefined` for the parameters when the part has none. */
  const partCode = (ref: PartRef, start: number): string => {
    use('parts');
    const name = camelName(ref.part);
    if (!ref.animate || Object.keys(ref.animate).length === 0) return `parts.${name}(${ref.params ? jsonCode(ref.params) : ''})`;
    return `parts.${name}(${ref.params ? jsonCode(ref.params) : 'undefined'}, ${animateCode(ref.animate, start)})`;
  };

  const lineCode = (l: ScriptLine): string => {
    if (l.line !== undefined && l.text === undefined && l.start === undefined && l.end === undefined) {
      use('line');
      return l.keyword !== undefined ? `line(${l.line}, { keyword: ${quote(l.keyword)} })` : `line(${l.line})`;
    }
    const fields: string[] = [];
    if (l.line !== undefined) fields.push(`line: ${l.line}`);
    if (l.text !== undefined) fields.push(`text: ${quote(l.text)}`);
    if (l.start !== undefined) fields.push(`from: ${timeCode(l.start)}`);
    if (l.end !== undefined) fields.push(`to: ${timeCode(l.end)}`);
    if (l.keyword !== undefined) fields.push(`keyword: ${quote(l.keyword)}`);
    return `{ ${fields.join(', ')} }`;
  };

  const pieceCode = (p: ScriptPiece, previousEnd: number | undefined): string => {
    use('piece');
    const rows: string[] = [`id: ${quote(p.id)}`];
    if (previousEnd === undefined || ms(p.start) !== ms(previousEnd)) rows.push(`from: ${timeCode(p.start)}`);
    rows.push(`to: ${timeCode(p.end)}`, `part: ${partCode({ part: p.part, params: p.params, ...(p.animate ? { animate: p.animate } : {}) }, p.start)}`);
    if (p.mode !== undefined) rows.push(`mode: ${quote(p.mode)}`);
    if (p.section !== undefined) rows.push(`section: ${quote(p.section)}`);
    if (p.with !== undefined) rows.push(`with: [${p.with.map((w) => partCode(w, p.start)).join(', ')}]`);
    if (p.lines !== undefined) rows.push(`lines: [${p.lines.map(lineCode).join(', ')}]`);
    if (p.hit !== undefined) rows.push(`hit: { word: ${quote(p.hit.word)}, at: ${timeCode(p.hit.at)}, length: ${p.hit.length} }`);
    if (p.stage !== undefined) rows.push(`stage: ${jsonCode(p.stage)}`);
    if (p.design !== undefined) {
      const camel = Object.fromEntries(Object.entries(p.design).map(([k, v]) => [camelName(k), v]));
      rows.push(`design: ${jsonCode(camel)}`);
    }
    // Whatever the editor does not know travels in `extra`, so the code type-checks and the field is not lost.
    const unknown = Object.entries(p as unknown as Record<string, unknown>).filter(([k, v]) => !KNOWN.has(k) && v !== undefined);
    if (unknown.length > 0) rows.push(`extra: ${jsonCode(Object.fromEntries(unknown))}`);
    return `  piece({\n${rows.map((r) => `    ${r},`).join('\n')}\n  }),`;
  };

  const blocks: string[] = [];
  let previousEnd: number | undefined;
  for (const p of script.pieces) {
    blocks.push(pieceCode(p, previousEnd));
    previousEnd = p.end;
  }
  /** `layer('id', [item(parts.x(...), from, to), ...])`: the times are song seconds, anchors where they land on the song's structure. */
  const layerCode = (l: Layer): string => {
    use('layer');
    if (l.items.length === 0) return `  layer(${quote(l.id)}, []),`;
    const items = l.items.map((it) => {
      use('item');
      return `    item(${partCode({ part: it.part, params: it.params, ...(it.animate ? { animate: it.animate } : {}) }, it.start)}, ${timeCode(it.start)}, ${timeCode(it.end)}),`;
    });
    return `  layer(${quote(l.id)}, [\n${items.join('\n')}\n  ]),`;
  };
  const layerBlocks = (script.layers ?? []).map(layerCode);

  const names = IMPORT_ORDER.filter((n) => used.has(n));
  const pieceList = blocks.length === 0 ? '[]' : `[\n${blocks.join('\n')}\n]`;
  const layerList = layerBlocks.length === 0 ? '' : `, [\n${layerBlocks.join('\n')}\n]`;
  const body = `export default script(${pieceList}${layerList});`;
  return `import { ${names.join(', ')} } from '@motion/script';\n\n${body}\n`;
}
