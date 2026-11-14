import { EASES, hasAnimateFeature, hasLayersFeature, layerProblems, type Animate, type Catalog, type Design, type Ease, type Keyframe, type Layer, type LayerItem, type Part, type PartRef, type PieceDesign, type Script, type ScriptLine, type ScriptPiece, type SongMap, type Stage, type WordHit } from '@lab/animation-core';

import { checkDoc } from '../store/checks';
import { warningText } from '../store/warning-text';
import { motionEditorTexts } from '../texts';
import { resolveTime, type TimeRef } from './anchors';
import type { CallNode, Expr, ObjectNode, Prop } from './ast';
import { diagnostic, type Diagnostic, type DiagnosticArgs, type DiagnosticCode } from './diagnostics';
import { camelName, RESERVED_EXTRA_KEYS, snakeName } from './names';
import { parse, type ParseResult } from './parse';
import type { Range } from './tokens';

export interface MapOptions {
  readonly catalog: Catalog;
  readonly songMap: SongMap;
  /** The design of the document: the editor's checks read the script against it and the level of the piece. */
  readonly design: Design;
  /** The level the piece is drawn at, for the editor's own checks. */
  readonly level: string;
}

/** Where a piece was written, for the selection to follow the cursor. */
export interface PieceSite {
  readonly id: string;
  readonly range: Range;
  /** Where its `id` value is. */
  readonly idRange: Range;
  /** One range per entry of `with`, in order. */
  readonly extras: readonly Range[];
}

/** Where a layer and its items were written, for the server's rules to be marked on the item they are about. */
export interface LayerSite {
  readonly id: string;
  readonly range: Range;
  readonly items: readonly Range[];
}

export interface MapResult {
  /** The script the code says; absent when there is any error, so the document does not change. */
  readonly script?: Script;
  readonly diagnostics: readonly Diagnostic[];
  readonly sites: readonly PieceSite[];
  readonly layerSites?: readonly LayerSite[];
}

type Json = string | number | boolean | Json[] | { [key: string]: Json };

const PIECE_KEYS = new Set<string>(['id', 'from', 'to', 'part', 'mode', 'section', 'with', 'lines', 'hit', 'stage', 'design', 'extra']);
const HIT_KEYS = new Set(['word', 'at', 'length']);
const FREE_LINE_KEYS = new Set(['line', 'text', 'from', 'to', 'keyword']);
const LINE_OPTION_KEYS = new Set(['keyword']);
const MODES = new Set(['dark', 'light']);

/** Reads code written in the dialect and says what script it is, with what is wrong with it at its line and column. */
export function mapCode(source: string, options: MapOptions): MapResult {
  return toScript(parse(source), options);
}

export function toScript(parsed: ParseResult, options: MapOptions): MapResult {
  const { catalog, songMap, design, level } = options;
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const sites: PieceSite[] = [];
  const en = motionEditorTexts('en');

  const report = (code: DiagnosticCode, args: DiagnosticArgs, range: Range, pieceId?: string): void => {
    diagnostics.push(diagnostic('error', code, args, range, pieceId));
  };

  // Constants: each is read where it is used, as many times as it is used.
  const consts = new Map<string, { expr: Expr; end: number }>();
  for (const c of parsed.file.consts) {
    if (consts.has(c.name)) report('duplicate-const', { name: c.name }, c.nameRange);
    else consts.set(c.name, { expr: c.value, end: c.range.end.offset });
  }
  /** What a name stands for, if it is a constant already defined at `use`. */
  const constAt = (name: string, use: Range): Expr | undefined => {
    const c = consts.get(name);
    if (!c) {
      report('unknown-const', { name }, use);
      return undefined;
    }
    if (use.start.offset < c.end) {
      report('const-later', { name }, use);
      return undefined;
    }
    return c.expr;
  };

  // ---- plain values ----

  /** A value that is data: text, number, true/false, a list or an object. */
  const literal = (e: Expr, depth = 0): Json | undefined => {
    switch (e.kind) {
      case 'string':
      case 'number':
      case 'bool':
        return e.value;
      case 'array': {
        const out: Json[] = [];
        let ok = true;
        for (const item of e.items) {
          const v = literal(item, depth + 1);
          if (v === undefined) ok = false;
          else out.push(v);
        }
        return ok ? out : undefined;
      }
      case 'object': {
        const out: { [k: string]: Json } = {};
        let ok = true;
        for (const p of e.props) {
          const v = literal(p.value, depth + 1);
          if (v === undefined) ok = false;
          else out[p.key] = v;
        }
        return ok ? out : undefined;
      }
      case 'ident': {
        const c = depth < 20 ? constAt(e.name, e.range) : undefined;
        return c ? literal(c, depth + 1) : undefined;
      }
      case 'invalid':
        return undefined;
      default:
        report('bad-value', { what: 'a plain value (text, a number, true or false, a list or an object)' }, e.range);
        return undefined;
    }
  };

  const asObject = (e: Expr, what: string, depth = 0): ObjectNode | undefined => {
    if (e.kind === 'object') return e;
    if (e.kind === 'ident' && depth < 20) {
      const c = constAt(e.name, e.range);
      return c ? asObject(c, what, depth + 1) : undefined;
    }
    if (e.kind !== 'invalid') report('bad-value', { what }, e.range);
    return undefined;
  };

  const asString = (e: Expr, what = 'a text'): string | undefined => {
    const v = e.kind === 'invalid' ? undefined : literal(e);
    if (typeof v === 'string') return v;
    if (v !== undefined) report('bad-value', { what }, e.range);
    return undefined;
  };

  const asNumber = (e: Expr, what = 'a number'): number | undefined => {
    const v = e.kind === 'invalid' ? undefined : literal(e);
    if (typeof v === 'number') return v;
    if (v !== undefined) report('bad-value', { what }, e.range);
    return undefined;
  };

  // ---- times ----

  const numberArg = (e: Expr, what: string): number | undefined => asNumber(e, what);

  /** What a time expression says, as a reference to the song; the seconds come from `resolveTime`. */
  const timeRef = (e: Expr, depth = 0): TimeRef | undefined => {
    switch (e.kind) {
      case 'number':
        return { kind: 'seconds', value: e.value };
      case 'ident': {
        const c = depth < 20 ? constAt(e.name, e.range) : undefined;
        return c ? timeRef(c, depth + 1) : undefined;
      }
      case 'call': {
        if (e.callee === 'beat') {
          if (e.args.length < 1 || e.args.length > 2) {
            report('bad-call', { name: 'beat', what: 'a beat number and, optionally, how far into it (0 up to 1)' }, e.range);
            return undefined;
          }
          const n = numberArg(e.args[0], 'a beat number');
          const f = e.args[1] ? numberArg(e.args[1], 'a number from 0 up to 1') : undefined;
          if (n === undefined || (e.args[1] && f === undefined)) return undefined;
          return { kind: 'beat', n, ...(f !== undefined ? { f } : {}) };
        }
        report('time-expected', {}, e.range);
        return undefined;
      }
      case 'member': {
        if (e.object.kind === 'ident' && e.object.name === 'song' && !consts.has('song')) {
          if (e.name === 'end') return { kind: 'song-end' };
          report('time-expected', {}, e.range);
          return undefined;
        }
        const section = sectionOf(e.object, depth);
        if (!section) return undefined;
        return { kind: 'section', ...section, edge: e.name === 'end' ? 'end' : 'start' };
      }
      case 'invalid':
        return undefined;
      default:
        report('time-expected', {}, e.range);
        return undefined;
    }
  };

  /** The `section(tag, k)` a member or a constant stands for. */
  const sectionOf = (e: CallNode | { kind: 'ident'; name: string; range: Range }, depth: number): { tag: string; k?: number } | undefined => {
    if (e.kind === 'ident') {
      const c = depth < 20 ? constAt(e.name, e.range) : undefined;
      if (!c) return undefined;
      if (c.kind === 'call' && c.callee === 'section') return sectionOf(c, depth + 1);
      if (c.kind !== 'invalid') report('time-expected', {}, e.range);
      return undefined;
    }
    if (e.args.length < 1 || e.args.length > 2) {
      report('bad-call', { name: 'section', what: 'a section tag and, optionally, which one of that tag (1, 2, ...)' }, e.range);
      return undefined;
    }
    const tag = asString(e.args[0], 'a section tag');
    const k = e.args[1] ? numberArg(e.args[1], 'a whole number from 1') : undefined;
    if (tag === undefined || (e.args[1] && k === undefined)) return undefined;
    return { tag: tag.toLowerCase(), ...(k !== undefined ? { k } : {}) };
  };

  /** The seconds of a time expression, or nothing with the reason reported at it. */
  const time = (e: Expr, pieceId?: string): number | undefined => {
    const ref = timeRef(e);
    if (!ref) return undefined;
    const r = resolveTime(ref, songMap);
    if (r.ok) return r.seconds;
    diagnostics.push(diagnostic('error', r.code, r.args, e.range, pieceId));
    return undefined;
  };

  // ---- parts ----

  const partsByCamel = new Map<string, Part>();
  for (const p of catalog.parts) if (!partsByCamel.has(camelName(p.name))) partsByCamel.set(camelName(p.name), p);

  /** A `parts.<name>(params)` call as the script's `{ part, params }`. */
  const partRef = (e: Expr, pieceId: string, start: number, length: number, owner: 'piece' | 'item' = 'piece'): PartRef | undefined => {
    if (e.kind === 'invalid') return undefined;
    if (e.kind !== 'call' || e.callee !== 'parts') {
      report('bad-value', { what: 'a part: parts.<name>({ ... })' }, e.range, pieceId);
      return undefined;
    }
    const part = partsByCamel.get(e.member ?? '');
    if (!part) {
      report('unknown-part', { name: e.member ?? '' }, e.calleeRange, pieceId);
      // The parameters are still read so what else is wrong with them is not hidden behind this.
      return undefined;
    }
    if (e.args.length > 2) {
      report('bad-call', { name: `parts.${e.member}`, what: 'an object of parameters and, if some change over the piece, an object of keyframes' }, e.range, pieceId);
      return undefined;
    }
    if (e.args.length === 0) return { part: part.name };
    // The first argument is the parameters, or `undefined` for none (so that the keyframes can be the second).
    const first = e.args[0];
    let params: Record<string, Json> | undefined;
    let ok = true;
    if (!(first.kind === 'ident' && first.name === 'undefined' && !consts.has('undefined'))) {
      const obj = asObject(first, 'an object of parameters { ... }');
      if (!obj) return undefined;
      params = {};
      for (const p of obj.props) {
        const def = part.params.find((d) => d.name === p.key);
        if (!def) {
          report('unknown-param', { part: part.name, param: p.key }, p.keyRange, pieceId);
          ok = false;
          continue;
        }
        const value = literal(p.value);
        if (value === undefined) {
          ok = false;
          continue;
        }
        if (!checkParam(def, value, p.value.range, pieceId)) ok = false;
        params[p.key] = value;
      }
    }
    let animate: Animate | undefined;
    if (e.args[1]) {
      animate = animateOf(e.args[1], part, pieceId, start, length, owner);
      if (!animate) ok = false;
    }
    return ok ? { part: part.name, ...(params ? { params } : {}), ...(animate ? { animate } : {}) } : undefined;
  };

  /** A keyframe's time as the seconds of its piece: a number is that already; an anchor (`beat(n)`, a section edge, `song.end`) is the song's time less where the piece starts. */
  const pieceTime = (e: Expr, start: number, pieceId: string): number | undefined => {
    const ref = timeRef(e);
    if (!ref) return undefined;
    if (ref.kind === 'seconds') return Math.floor(ref.value * 1000 + 0.5) / 1000;
    const r = resolveTime(ref, songMap);
    if (!r.ok) {
      diagnostics.push(diagnostic('error', r.code, r.args, e.range, pieceId));
      return undefined;
    }
    return Math.floor((r.seconds - start) * 1000 + 0.5) / 1000;
  };

  /** The second argument of a part: `{ parameter: [kf(t, value, ease?), ...] }`, checked against the catalog and the piece. */
  const animateOf = (e: Expr, part: Part, pieceId: string, start: number, length: number, owner: 'piece' | 'item'): Animate | undefined => {
    if (e.kind === 'invalid') return undefined;
    const obj = asObject(e, 'an object of keyframes { parameter: [kf(...)] }');
    if (!obj) return undefined;
    if (!hasAnimateFeature(catalog)) {
      report('no-animate', {}, e.range, pieceId);
      return undefined;
    }
    const out: Record<string, Keyframe[]> = {};
    let ok = true;
    for (const p of obj.props) {
      const def = part.params.find((d) => d.name === p.key);
      if (!def) {
        report('unknown-param', { part: part.name, param: p.key }, p.keyRange, pieceId);
        ok = false;
        continue;
      }
      if (!def.animatable) {
        report('not-animatable', { part: part.name, param: p.key }, p.keyRange, pieceId);
        ok = false;
        continue;
      }
      const list = p.value.kind === 'ident' ? constAt(p.value.name, p.value.range) : p.value;
      if (!list) {
        ok = false;
        continue;
      }
      if (list.kind !== 'array') {
        if (list.kind !== 'invalid') report('bad-value', { what: 'a list of kf(t, value)' }, p.value.range, pieceId);
        ok = false;
        continue;
      }
      if (list.items.length === 0) {
        report('kf-empty', { param: p.key }, p.value.range, pieceId);
        ok = false;
        continue;
      }
      const frames: Keyframe[] = [];
      for (const item of list.items) {
        if (item.kind === 'invalid') {
          ok = false;
          continue;
        }
        if (item.kind !== 'call' || item.callee !== 'kf' || item.args.length < 2 || item.args.length > 3) {
          report('bad-call', { name: 'kf', what: 'a time, a value and, optionally, how it goes to the next one' }, item.range, pieceId);
          ok = false;
          continue;
        }
        const t = pieceTime(item.args[0], start, pieceId);
        const value = literal(item.args[1]);
        let ease: Ease | undefined;
        if (item.args[2]) {
          const w = asString(item.args[2], 'linear, in, out, in-out or step');
          if (w === undefined) ok = false;
          else if (!(EASES as readonly string[]).includes(w)) {
            report('bad-value', { what: 'linear, in, out, in-out or step' }, item.args[2].range, pieceId);
            ok = false;
          } else ease = w as Ease;
        }
        if (t === undefined || value === undefined) {
          ok = false;
          continue;
        }
        if (typeof value === 'object') {
          report('bad-value', { what: 'a text, a number or true or false' }, item.args[1].range, pieceId);
          ok = false;
          continue;
        }
        if (!checkParam(def, value, item.args[1].range, pieceId)) ok = false;
        if (t < 0 || t > length + 0.01) {
          report('kf-outside', { t, length: Math.round(length * 1000) / 1000, ...(owner === 'item' ? { of: owner } : {}) }, item.args[0].range, pieceId);
          ok = false;
        } else if (frames.length > 0 && t <= frames[frames.length - 1].t) {
          report('kf-order', {}, item.args[0].range, pieceId);
          ok = false;
        }
        frames.push({ t, value, ...(ease ? { ease } : {}) });
      }
      out[p.key] = frames;
    }
    return ok ? out : undefined;
  };

  const checkParam = (def: Part['params'][number], value: Json, range: Range, pieceId: string): boolean => {
    const bad = (code: DiagnosticCode, args: DiagnosticArgs): false => {
      report(code, { param: def.name, ...args }, range, pieceId);
      return false;
    };
    switch (def.type) {
      case 'int':
      case 'number': {
        if (typeof value !== 'number') return bad('param-type', { type: def.type === 'int' ? 'a whole number' : 'a number' });
        if (def.type === 'int' && !Number.isInteger(value)) return bad('param-whole', {});
        if (def.min !== undefined && value < def.min) return bad('param-min', { limit: def.min });
        if (def.max !== undefined && value > def.max) return bad('param-max', { limit: def.max });
        return true;
      }
      case 'string':
        if (typeof value !== 'string') return bad('param-type', { type: 'a text' });
        if (def.maxLength !== undefined && value.length > def.maxLength) return bad('param-length', { limit: def.maxLength });
        return true;
      case 'bool':
        return typeof value === 'boolean' ? true : bad('param-type', { type: 'true or false' });
      case 'enum':
        if (typeof value !== 'string' || (def.options && !def.options.includes(value))) return bad('param-option', { options: (def.options ?? []).join(', ') });
        return true;
    }
  };

  // ---- the pieces ----

  const lineNumbers = new Set(songMap.words.map((w) => w.line));

  const lineOf = (e: Expr, pieceId: string): ScriptLine | undefined => {
    if (e.kind === 'invalid') return undefined;
    if (e.kind === 'call' && e.callee === 'line') {
      if (e.args.length < 1 || e.args.length > 2) {
        report('bad-call', { name: 'line', what: 'a line number and, optionally, { keyword }' }, e.range, pieceId);
        return undefined;
      }
      const n = asNumber(e.args[0], 'a line number');
      if (n === undefined) return undefined;
      if (!lineNumbers.has(n)) {
        report('no-line', { n }, e.args[0].range, pieceId);
        return undefined;
      }
      let keyword: string | undefined;
      if (e.args[1]) {
        const o = asObject(e.args[1], '{ keyword: "..." }');
        if (!o) return undefined;
        for (const p of o.props) {
          if (!LINE_OPTION_KEYS.has(p.key)) report('unknown-key', { key: p.key, where: 'line(...)' }, p.keyRange, pieceId);
          else keyword = asString(p.value);
        }
      }
      return { line: n, ...(keyword !== undefined ? { keyword } : {}) };
    }
    const o = asObject(e, 'line(n) or { text, from, to }');
    if (!o) return undefined;
    const out: { line?: number; text?: string; start?: number; end?: number; keyword?: string } = {};
    for (const p of o.props) {
      if (!FREE_LINE_KEYS.has(p.key)) {
        report('unknown-key', { key: p.key, where: 'a line' }, p.keyRange, pieceId);
        continue;
      }
      if (p.key === 'line') out.line = asNumber(p.value, 'a line number');
      else if (p.key === 'text') out.text = asString(p.value);
      else if (p.key === 'keyword') out.keyword = asString(p.value);
      else if (p.key === 'from') out.start = time(p.value, pieceId);
      else out.end = time(p.value, pieceId);
    }
    for (const k of ['line', 'text', 'start', 'end', 'keyword'] as const) if (k in out && out[k] === undefined) delete out[k];
    return out;
  };

  const hitOf = (e: Expr, pieceId: string): WordHit | undefined => {
    const o = asObject(e, '{ word, at, length }');
    if (!o) return undefined;
    let word: string | undefined;
    let at: number | undefined;
    let length: number | undefined;
    for (const p of o.props) {
      if (!HIT_KEYS.has(p.key)) report('unknown-key', { key: p.key, where: 'a hit' }, p.keyRange, pieceId);
      else if (p.key === 'word') word = asString(p.value);
      else if (p.key === 'at') at = time(p.value, pieceId);
      else length = asNumber(p.value);
    }
    for (const [k, v] of [['word', word], ['at', at], ['length', length]] as const) if (v === undefined && !o.props.some((p) => p.key === k)) report('piece-needs', { key: `hit.${k}` }, o.range, pieceId);
    return word !== undefined && at !== undefined && length !== undefined ? { word, at, length } : undefined;
  };

  const designOf = (e: Expr, pieceId: string): PieceDesign | undefined => {
    const o = asObject(e, 'an object of colours and styles');
    if (!o) return undefined;
    const out: Record<string, Json> = {};
    for (const p of o.props) {
      const v = asString(p.value);
      if (v !== undefined) out[snakeName(p.key)] = v;
    }
    return out as PieceDesign;
  };

  const seenIds = new Set<string>();
  const pieces: ScriptPiece[] = [];
  /** Where the last piece read ends: the next one starts there unless it says `from`. NaN when that one could not be read. */
  let ended = 0;

  const pieceOf = (item: Expr, index: number): void => {
    if (item.kind === 'invalid') return;
    if (item.kind !== 'call' || item.callee !== 'piece') {
      report('not-a-piece', {}, item.range);
      return;
    }
    if (item.args.length !== 1) {
      report('bad-call', { name: 'piece', what: 'one object { id, to, part, ... }' }, item.range);
      return;
    }
    const obj = asObject(item.args[0], 'an object { id, to, part, ... }');
    if (!obj) return;
    const prop = (key: string): Prop | undefined => obj.props.find((p) => p.key === key);
    const idProp = prop('id');
    const idValue = idProp ? asString(idProp.value, 'a text') : undefined;
    const pid = idValue ?? `#${index + 1}`;
    const extras: Range[] = [];
    const withProp = prop('with');
    if (withProp?.value.kind === 'array') for (const x of withProp.value.items) extras.push(x.range);
    sites.push({ id: pid, range: item.range, idRange: idProp?.value.range ?? item.calleeRange, extras });

    let ok = true;
    const fail = (): void => {
      ok = false;
    };
    for (const p of obj.props) {
      if (!PIECE_KEYS.has(p.key)) {
        report('unknown-key', { key: p.key, where: 'a piece' }, p.keyRange, pid);
        fail();
      }
    }
    if (!idProp) {
      report('piece-needs', { key: 'id' }, item.calleeRange, pid);
      fail();
    } else if (idValue === undefined || idValue === '') {
      if (idValue === '') report('bad-value', { what: 'a text that is not empty' }, idProp.value.range, pid);
      fail();
    } else if (seenIds.has(idValue)) {
      report('duplicate-id', { id: idValue }, idProp.value.range, pid);
      fail();
    } else seenIds.add(idValue);

    // Where it starts and ends.
    const fromProp = prop('from');
    const toProp = prop('to');
    let start: number | undefined;
    if (fromProp) start = time(fromProp.value, pid);
    else if (index === 0) {
      report('no-from', {}, item.calleeRange, pid);
    } else start = Number.isNaN(ended) ? undefined : ended;
    if (start === undefined) fail();
    let end: number | undefined;
    if (!toProp) {
      report('piece-needs', { key: 'to' }, item.calleeRange, pid);
      fail();
    } else {
      end = time(toProp.value, pid);
      if (end === undefined) fail();
    }
    if (start !== undefined && end !== undefined && end <= start) {
      report('bad-end', { start, end }, toProp!.value.range, pid);
      fail();
    }
    ended = end ?? Number.NaN;

    const partProp = prop('part');
    let part: PartRef | undefined;
    if (!partProp) {
      report('piece-needs', { key: 'part' }, item.calleeRange, pid);
      fail();
    } else {
      part = partRef(partProp.value, pid, start ?? Number.NaN, (end ?? Number.NaN) - (start ?? Number.NaN));
      if (!part) fail();
    }

    const out: Record<string, unknown> = {};
    const modeProp = prop('mode');
    if (modeProp) {
      const m = asString(modeProp.value, 'dark or light');
      if (m !== undefined && !MODES.has(m)) {
        report('bad-value', { what: 'dark or light' }, modeProp.value.range, pid);
        fail();
      } else if (m === undefined) fail();
      else out['mode'] = m;
    }
    const sectionProp = prop('section');
    if (sectionProp) {
      const s = asString(sectionProp.value);
      if (s === undefined) fail();
      else out['section'] = s;
    }
    if (withProp) {
      if (withProp.value.kind !== 'array') {
        if (withProp.value.kind !== 'invalid') report('bad-value', { what: 'a list of parts' }, withProp.value.range, pid);
        fail();
      } else {
        const refs: PartRef[] = [];
        for (const x of withProp.value.items) {
          const r = partRef(x, pid, start ?? Number.NaN, (end ?? Number.NaN) - (start ?? Number.NaN));
          if (r) refs.push(r);
          else fail();
        }
        out['with'] = refs;
      }
    }
    const linesProp = prop('lines');
    if (linesProp) {
      if (linesProp.value.kind !== 'array') {
        if (linesProp.value.kind !== 'invalid') report('bad-value', { what: 'a list of lines' }, linesProp.value.range, pid);
        fail();
      } else {
        const lines: ScriptLine[] = [];
        for (const x of linesProp.value.items) {
          const l = lineOf(x, pid);
          if (l) lines.push(l);
          else fail();
        }
        out['lines'] = lines;
      }
    }
    const hitProp = prop('hit');
    if (hitProp) {
      const h = hitOf(hitProp.value, pid);
      if (h) out['hit'] = h;
      else fail();
    }
    const stageProp = prop('stage');
    if (stageProp) {
      const o = asObject(stageProp.value, 'an object { background, characters }');
      const v = o ? literal(o) : undefined;
      if (v === undefined) fail();
      else out['stage'] = v as Stage;
    }
    const designProp = prop('design');
    if (designProp) {
      const d = designOf(designProp.value, pid);
      if (d) out['design'] = d;
      else fail();
    }
    const extraProp = prop('extra');
    if (extraProp) {
      const o = asObject(extraProp.value, 'an object of fields the editor does not know');
      if (!o) fail();
      else {
        for (const p of o.props) {
          if (RESERVED_EXTRA_KEYS.includes(p.key)) {
            report('extra-collision', { key: p.key }, p.keyRange, pid);
            fail();
            continue;
          }
          const v = literal(p.value);
          if (v === undefined) fail();
          else out[p.key] = v;
        }
      }
    }
    if (!ok || idValue === undefined || start === undefined || end === undefined || !part) return;
    pieces.push({ id: idValue, start, end, part: part.part, ...(part.params ? { params: part.params } : {}), ...(part.animate ? { animate: part.animate } : {}), ...out } as ScriptPiece);
  };

  if (parsed.file.pieces) parsed.file.pieces.items.forEach(pieceOf);

  // ---- the layers ----

  const layers: Layer[] = [];
  const layerSites: LayerSite[] = [];

  /** `item(parts.x(params?, animate?), from, to)`: a part drawn between two song times; its keyframes are in seconds from `from`. */
  const itemOf = (e: Expr, lid: string): { item?: LayerItem; range: Range } => {
    if (e.kind === 'invalid') return { range: e.range };
    if (e.kind !== 'call' || e.callee !== 'item') {
      report('bad-value', { what: 'item(parts.<name>(...), from, to)' }, e.range, lid);
      return { range: e.range };
    }
    if (e.args.length !== 3) {
      report('bad-call', { name: 'item', what: 'a part, where it starts and where it ends' }, e.range, lid);
      return { range: e.range };
    }
    const start = time(e.args[1], lid);
    const end = time(e.args[2], lid);
    const part = partRef(e.args[0], lid, start ?? Number.NaN, (end ?? Number.NaN) - (start ?? Number.NaN), 'item');
    if (!part || start === undefined || end === undefined) return { range: e.range };
    return { range: e.range, item: { part: part.part, ...(part.params ? { params: part.params } : {}), start, end, ...(part.animate ? { animate: part.animate } : {}) } };
  };

  const layerOf = (e: Expr): void => {
    if (e.kind === 'invalid') return;
    if (e.kind !== 'call' || e.callee !== 'layer') {
      report('not-a-layer', {}, e.range);
      return;
    }
    if (e.args.length !== 2) {
      report('bad-call', { name: 'layer', what: 'an id and a list of items' }, e.range);
      return;
    }
    const id = asString(e.args[0], 'a text');
    const lid = id ?? `layer #${layers.length + 1}`;
    const list = e.args[1].kind === 'ident' ? constAt(e.args[1].name, e.args[1].range) : e.args[1];
    if (!list) return;
    if (list.kind !== 'array') {
      if (list.kind !== 'invalid') report('bad-value', { what: 'a list of item(...)' }, e.args[1].range, lid);
      return;
    }
    const items: LayerItem[] = [];
    const ranges: Range[] = [];
    let ok = id !== undefined;
    for (const x of list.items) {
      const r = itemOf(x, lid);
      ranges.push(r.range);
      if (r.item) items.push(r.item);
      else ok = false;
    }
    layerSites.push({ id: lid, range: e.range, items: ranges });
    if (ok) layers.push({ id: id!, items });
  };

  if (parsed.file.layers) {
    if (!hasLayersFeature(catalog)) report('no-layers', {}, parsed.file.layers.range);
    else parsed.file.layers.items.forEach(layerOf);
  }

  // What the server refuses in the layers, in its words, on the item it is about: the document does not change until it is gone.
  if (!diagnostics.some((d) => d.severity === 'error') && layers.length > 0) {
    const whole: Script = { version: 1, pieces, layers };
    for (const p of layerProblems(whole, catalog)) {
      const site = p.layer === undefined ? undefined : layerSites.find((s) => s.id === p.layer);
      const range = (p.item !== undefined ? site?.items[p.item] : undefined) ?? site?.range ?? sites.find((s) => s.id === p.piece)?.idRange ?? parsed.file.layers!.range;
      diagnostics.push(diagnostic('error', 'layer-problem', { text: p.text }, range, p.piece));
    }
  }

  const hasError = diagnostics.some((d) => d.severity === 'error');
  if (hasError) return { diagnostics: sortDiagnostics(diagnostics), sites, layerSites };

  // The editor's own checks: what the server would refuse, as far as the client can tell. They warn and never stop the script.
  const script: Script = { version: 1, pieces, ...(layers.length > 0 ? { layers } : {}) };
  const arrayStart = parsed.file.pieces?.range.start;
  for (const w of checkDoc({ design, script }, songMap, catalog, level)) {
    const site = sites.find((s) => s.id === w.piece);
    const range: Range | undefined = site ? (w.extra !== undefined ? (site.extras[w.extra] ?? site.idRange) : site.idRange) : arrayStart ? { start: arrayStart, end: { offset: arrayStart.offset + 1, line: arrayStart.line, column: arrayStart.column + 1 } } : undefined;
    if (!range) continue;
    diagnostics.push(diagnostic('warning', 'check', { text: warningText(en, w) }, range, w.piece, w));
  }
  return { script, diagnostics: sortDiagnostics(diagnostics), sites, layerSites };
}

const sortDiagnostics = (list: Diagnostic[]): Diagnostic[] => list.sort((a, b) => a.line - b.line || a.column - b.column);
