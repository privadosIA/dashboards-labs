import type { ArrayNode, ConstNode, Expr, ImportNode, InvalidNode, ObjectNode, Prop, ScriptFile } from './ast';
import { diagnostic, type Diagnostic, type DiagnosticArgs, type DiagnosticCode } from './diagnostics';
import { tokenize, type Comment, type Pos, type Range, type Token } from './tokens';

export interface ParseResult {
  readonly file: ScriptFile;
  readonly diagnostics: readonly Diagnostic[];
  readonly comments: readonly Comment[];
}

/** The calls the dialect has. `script` is only the one of the export and `parts` takes a member. */
const CALLS = new Set(['piece', 'layer', 'item', 'beat', 'section', 'line', 'kf']);
const SECTION_MEMBERS = new Set(['start', 'end']);
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**']);
const COMPARISON = new Set(['<', '>', '<=', '>=', '==', '===', '!=', '!==', '&&', '||', '??', '&', '|', '^', '<<', '>>', '>>>']);
const STATEMENT_WORDS = new Set(['import', 'const', 'let', 'var', 'export', 'function', 'class', 'if', 'for', 'while', 'return', 'type', 'interface', 'enum']);
const CLOSERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

/** Raised where the parser cannot go on with the construct in hand; whoever holds a list catches it and goes on with the next item. */
class Bail extends Error {}

const rangeOf = (start: Pos, end: Pos): Range => ({ start, end });

/**
 * Reads the code of the dialect (the grammar is in `grammar.md`): the import, top-level constants and `export default script([...])`. It
 * never throws: whatever is outside the dialect is a diagnostic with its range and the reading goes on with the next item, so a script
 * with two mistakes shows two. The tree it leaves holds `invalid` nodes where something was refused.
 */
export function parse(source: string): ParseResult {
  const lexed = tokenize(source);
  const diagnostics: Diagnostic[] = [];
  for (const p of lexed.problems) diagnostics.push(diagnostic('error', p.kind, { text: p.text }, p.range));
  const toks = lexed.tokens;
  let at = 0;
  let prevEnd: Pos = toks[0].range.start;

  const peek = (k = 0): Token => toks[Math.min(at + k, toks.length - 1)];
  const next = (): Token => {
    const t = toks[at];
    if (t.kind !== 'eof') {
      at++;
      prevEnd = t.range.end;
    }
    return t;
  };
  const isPunct = (text: string, k = 0): boolean => peek(k).kind === 'punct' && peek(k).text === text;
  const isIdent = (text: string, k = 0): boolean => peek(k).kind === 'ident' && peek(k).text === text;
  const report = (code: DiagnosticCode, args: DiagnosticArgs, range: Range): void => {
    diagnostics.push(diagnostic('error', code, args, range));
  };
  const notRepresentable = (what: string, range: Range): void => report('not-representable', { what }, range);
  const expected = (what: string, range = peek().range): never => {
    report('expected', { what }, range);
    throw new Bail();
  };
  const invalid = (start: Pos): InvalidNode => ({ kind: 'invalid', range: rangeOf(start, prevEnd) });

  /** Moves over a bracket group that starts at the next token, whatever is inside. */
  const skipGroup = (): void => {
    const open = next();
    const close = CLOSERS[open.text];
    if (!close) return;
    let depth = 1;
    while (depth > 0 && peek().kind !== 'eof') {
      const t = next();
      if (t.kind === 'punct' && CLOSERS[t.text]) depth++;
      else if (t.kind === 'punct' && (t.text === ')' || t.text === ']' || t.text === '}')) depth--;
    }
  };

  /** Moves to the next `,` or closing bracket of the list in hand (not over it), skipping the groups on the way. */
  const skipToItemEnd = (): void => {
    while (peek().kind !== 'eof') {
      const t = peek();
      if (t.kind === 'punct' && (t.text === ',' || t.text === ')' || t.text === ']' || t.text === '}')) return;
      if (t.kind === 'punct' && CLOSERS[t.text]) skipGroup();
      else next();
    }
  };

  /** Where a function or arrow body ends: a block, or one expression read tolerantly. */
  const skipBody = (): void => {
    if (isPunct('{')) skipGroup();
    else {
      try {
        parseExpr();
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        skipToItemEnd();
      }
    }
  };

  /** The arguments of a call the dialect does not have, read tolerantly so what is wrong inside them (an arrow function) is named too. */
  const readArgsTolerantly = (): void => {
    next();
    while (peek().kind !== 'eof' && !isPunct(')')) {
      try {
        parseExpr();
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        skipToItemEnd();
      }
      if (isPunct(',')) next();
      else break;
    }
    if (isPunct(')')) next();
  };

  function parseCallArgs(): Expr[] {
    next();
    const args: Expr[] = [];
    while (peek().kind !== 'eof' && !isPunct(')')) {
      try {
        args.push(parseExpr());
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        args.push(invalid(peek().range.start));
        skipToItemEnd();
      }
      if (isPunct(',')) next();
      else break;
    }
    if (!isPunct(')')) expected(')');
    next();
    return args;
  }

  function parseArray(): ArrayNode {
    const start = next().range.start;
    const items: Expr[] = [];
    while (peek().kind !== 'eof' && !isPunct(']')) {
      const itemStart = peek().range.start;
      try {
        if (isPunct(',')) expected('an item');
        if (isPunct('...')) {
          const spread = next();
          notRepresentable('spread', spread.range);
          parseExpr();
          items.push(invalid(itemStart));
        } else items.push(parseExpr());
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        items.push(invalid(itemStart));
        skipToItemEnd();
      }
      if (isPunct(',')) next();
      else if (!isPunct(']')) {
        if (peek().kind === 'eof') break;
        report('expected', { what: ', or ]' }, peek().range);
        skipToItemEnd();
        if (isPunct(',')) next();
        else break;
      }
    }
    if (!isPunct(']')) {
      report('expected', { what: ']' }, peek().range);
      return { kind: 'array', items, range: rangeOf(start, prevEnd) };
    }
    next();
    return { kind: 'array', items, range: rangeOf(start, prevEnd) };
  }

  function parseObject(): ObjectNode {
    const start = next().range.start;
    const props: Prop[] = [];
    while (peek().kind !== 'eof' && !isPunct('}')) {
      const propStart = peek().range.start;
      try {
        const keyTok = peek();
        if (isPunct('...')) {
          notRepresentable('spread', next().range);
          parseExpr();
        } else if (isPunct('[')) {
          const open = peek().range;
          skipGroup();
          notRepresentable('computed key', rangeOf(open.start, prevEnd));
          if (isPunct(':')) {
            next();
            parseExpr();
          }
        } else if (keyTok.kind === 'number') {
          next();
          notRepresentable('numeric key', keyTok.range);
          if (isPunct(':')) {
            next();
            parseExpr();
          }
        } else if (keyTok.kind === 'ident' || keyTok.kind === 'string') {
          next();
          if (isPunct('(')) {
            skipGroup();
            if (isPunct('{')) skipGroup();
            notRepresentable('method', rangeOf(keyTok.range.start, prevEnd));
          } else if (isPunct(',') || isPunct('}')) {
            notRepresentable('shorthand property', keyTok.range);
          } else {
            if (!isPunct(':')) expected(':');
            next();
            const value = parseExpr();
            props.push({ key: String(keyTok.value), keyRange: keyTok.range, value, range: rangeOf(propStart, prevEnd) });
          }
        } else expected('a property name');
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        skipToItemEnd();
      }
      if (isPunct(',')) next();
      else if (!isPunct('}')) {
        if (peek().kind === 'eof') break;
        report('expected', { what: ', or }' }, peek().range);
        skipToItemEnd();
        if (isPunct(',')) next();
        else break;
      }
    }
    if (!isPunct('}')) {
      report('expected', { what: '}' }, peek().range);
      return { kind: 'object', props, range: rangeOf(start, prevEnd) };
    }
    next();
    return { kind: 'object', props, range: rangeOf(start, prevEnd) };
  }

  /** An arrow function, from its parameters on: it is named and its body read so the rest of the code is not lost. */
  function arrowFunction(start: Pos): InvalidNode {
    const arrow = next();
    notRepresentable('arrow function', rangeOf(start, arrow.range.end));
    skipBody();
    return invalid(start);
  }

  /** Whether the `(` the next token opens closes right before an `=>`. */
  function parenthesesLeadToArrow(): boolean {
    let depth = 0;
    for (let k = 0; ; k++) {
      const t = peek(k);
      if (t.kind === 'eof') return false;
      if (t.kind === 'punct' && CLOSERS[t.text]) depth++;
      else if (t.kind === 'punct' && (t.text === ')' || t.text === ']' || t.text === '}')) {
        depth--;
        if (depth === 0) return isPunct('=>', k + 1);
      }
    }
  }

  function parsePrimary(): Expr {
    const t = peek();
    const start = t.range.start;
    switch (t.kind) {
      case 'string':
        next();
        return { kind: 'string', value: String(t.value), range: t.range };
      case 'number':
        next();
        return { kind: 'number', value: Number(t.value), range: t.range };
      case 'template':
        next();
        notRepresentable('template literal', t.range);
        return invalid(start);
      case 'punct': {
        if (t.text === '[') return parseArray();
        if (t.text === '{') return parseObject();
        if (t.text === '-' && peek(1).kind === 'number') {
          next();
          const n = next();
          return { kind: 'number', value: -Number(n.value), range: rangeOf(start, n.range.end) };
        }
        if (t.text === '-' || t.text === '+' || t.text === '!' || t.text === '~') {
          next();
          notRepresentable('unary operator', t.range);
          parsePrimary();
          return invalid(start);
        }
        if (t.text === '(') {
          if (parenthesesLeadToArrow()) {
            skipGroup();
            return arrowFunction(start);
          }
          next();
          notRepresentable('parenthesised expression', t.range);
          parseExpr();
          if (isPunct(')')) next();
          return invalid(start);
        }
        return expected('a value');
      }
      case 'ident': {
        if (t.text === 'true' || t.text === 'false') {
          next();
          return { kind: 'bool', value: t.text === 'true', range: t.range };
        }
        if (isPunct('=>', 1)) {
          next();
          return arrowFunction(start);
        }
        if (t.text === 'new') {
          next();
          notRepresentable('new expression', t.range);
          if (peek().kind === 'ident') next();
          if (isPunct('(')) readArgsTolerantly();
          return invalid(start);
        }
        if (t.text === 'function') {
          next();
          notRepresentable('arrow function', t.range);
          if (peek().kind === 'ident') next();
          if (isPunct('(')) skipGroup();
          if (isPunct('{')) skipGroup();
          return invalid(start);
        }
        next();
        if (t.text === 'parts' && isPunct('.') && peek(1).kind === 'ident') {
          next();
          const member = next();
          if (!isPunct('(')) expected('(');
          const args = parseCallArgs();
          return { kind: 'call', callee: 'parts', member: member.text, calleeRange: rangeOf(start, member.range.end), args, range: rangeOf(start, prevEnd) };
        }
        if (isPunct('(')) {
          if (CALLS.has(t.text)) {
            const args = parseCallArgs();
            return { kind: 'call', callee: t.text, calleeRange: t.range, args, range: rangeOf(start, prevEnd) };
          }
          notRepresentable(`call of ${t.text}`, t.range);
          readArgsTolerantly();
          return invalid(start);
        }
        return { kind: 'ident', name: t.text, range: t.range };
      }
      case 'eof':
        return expected('a value');
    }
  }

  function parseExpr(): Expr {
    const start = peek().range.start;
    let expr = parsePrimary();
    // Members: only `.start` and `.end` of a section call or a constant (and `song.end`).
    while (isPunct('.') || isPunct('?.') || isPunct('[')) {
      const dot = peek();
      if (dot.text === '[') {
        skipGroup();
        notRepresentable('computed member access', rangeOf(dot.range.start, prevEnd));
        expr = invalid(start);
        continue;
      }
      if (dot.text === '?.') {
        next();
        notRepresentable('optional chaining', dot.range);
        if (peek().kind === 'ident') next();
        expr = invalid(start);
        continue;
      }
      next();
      const name = peek();
      if (name.kind !== 'ident') {
        expected('a member name');
      }
      next();
      const objectOk = (expr.kind === 'call' && expr.callee === 'section') || expr.kind === 'ident';
      if (objectOk && SECTION_MEMBERS.has(name.text) && (expr.kind === 'call' || expr.kind === 'ident')) {
        expr = { kind: 'member', object: expr, name: name.text, range: rangeOf(start, prevEnd) };
        continue;
      }
      notRepresentable(`member access .${name.text}`, rangeOf(dot.range.start, name.range.end));
      if (isPunct('(')) readArgsTolerantly();
      expr = invalid(start);
    }
    // Operators, which the dialect has none of: named, and the operand read so the rest is not lost.
    while (peek().kind === 'punct') {
      const op = peek();
      if (op.text === '=>') {
        expr = arrowFunction(start);
        continue;
      }
      if (ARITHMETIC.has(op.text)) {
        next();
        notRepresentable('arithmetic', op.range);
      } else if (COMPARISON.has(op.text)) {
        next();
        notRepresentable('comparison', op.range);
      } else if (op.text === '?') {
        next();
        notRepresentable('conditional', op.range);
        parseExpr();
        if (isPunct(':')) next();
        parseExpr();
        expr = invalid(start);
        continue;
      } else break;
      parsePrimary();
      expr = invalid(start);
    }
    return expr;
  }

  const parseImport = (hasImport: boolean): ImportNode | undefined => {
    const start = next().range.start;
    const names: string[] = [];
    let shaped = true;
    if (isPunct('{')) {
      next();
      while (peek().kind === 'ident') {
        names.push(next().text);
        if (isPunct(',')) next();
        else break;
      }
      if (isPunct('}')) next();
      else shaped = false;
    } else shaped = false;
    if (isIdent('from')) next();
    else shaped = false;
    const mod = peek();
    if (mod.kind === 'string') next();
    else shaped = false;
    if (!shaped) {
      report('bad-import', {}, rangeOf(start, prevEnd));
      skipStatement();
      return undefined;
    }
    // One import, from `@motion/script`: a second one, or one from elsewhere, is another module.
    if (hasImport || mod.value !== '@motion/script') notRepresentable('import of another module', rangeOf(start, prevEnd));
    if (isPunct(';')) next();
    return hasImport || mod.value !== '@motion/script' ? undefined : { names, range: rangeOf(start, prevEnd) };
  };

  const parseConst = (): ConstNode | undefined => {
    const start = next().range.start;
    const name = peek();
    if (name.kind !== 'ident') {
      report('expected', { what: 'a constant name' }, name.range);
      skipStatement();
      return undefined;
    }
    next();
    if (!isPunct('=')) {
      report('expected', { what: '=' }, peek().range);
      skipStatement();
      return undefined;
    }
    next();
    let value: Expr;
    try {
      value = parseExpr();
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      value = invalid(peek().range.start);
      skipStatement();
    }
    if (isPunct(';')) next();
    return { name: name.text, nameRange: name.range, value, range: rangeOf(start, prevEnd) };
  };

  /** Moves past the statement that is wrong: to its `;`, or to the next line that starts another statement. */
  function skipStatement(): void {
    while (peek().kind !== 'eof') {
      const t = peek();
      if (t.kind === 'punct' && t.text === ';') {
        next();
        return;
      }
      if (t.kind === 'punct' && CLOSERS[t.text]) skipGroup();
      else next();
      const n = peek();
      if (n.kind === 'ident' && STATEMENT_WORDS.has(n.text) && n.range.start.line > prevEnd.line) return;
    }
  }

  const parseExport = (): { pieces?: ArrayNode; layers?: ArrayNode } => {
    next();
    if (!isIdent('default')) {
      notRepresentable('statement', rangeOf(toks[at - 1].range.start, peek().range.end));
      skipStatement();
      return {};
    }
    next();
    if (!isIdent('script') || !isPunct('(', 1)) {
      report('expected', { what: 'script([ ... ])' }, peek().range);
      skipStatement();
      return {};
    }
    next();
    next();
    let pieces: ArrayNode | undefined;
    let layers: ArrayNode | undefined;
    try {
      if (!isPunct('[')) {
        const before = diagnostics.length;
        const bad = parseExpr();
        if (diagnostics.length === before) report('expected', { what: 'an array [ ... ]' }, bad.range);
      } else pieces = parseArray();
      // The second argument is the layers, a list of layer(...).
      if (isPunct(',') && !isPunct(')', 1)) {
        next();
        if (isPunct('[')) layers = parseArray();
        else {
          const before = diagnostics.length;
          const bad = parseExpr();
          if (diagnostics.length === before) report('expected', { what: 'an array [ ... ]' }, bad.range);
        }
      } else if (isPunct(',')) next();
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      skipToItemEnd();
    }
    if (isPunct(')')) next();
    else if (peek().kind !== 'eof') report('expected', { what: ')' }, peek().range);
    if (isPunct(';')) next();
    return { ...(pieces ? { pieces } : {}), ...(layers ? { layers } : {}) };
  };

  let imported: ImportNode | undefined;
  let hasImport = false;
  const consts: ConstNode[] = [];
  let pieces: ArrayNode | undefined;
  let layers: ArrayNode | undefined;
  let exported = false;
  const fileStart = toks[0].range.start;

  while (peek().kind !== 'eof') {
    const t = peek();
    if (t.kind === 'punct' && t.text === ';') {
      next();
      continue;
    }
    if (isIdent('import')) {
      const node = parseImport(hasImport);
      hasImport = true;
      imported ??= node;
    } else if (isIdent('const')) {
      const c = parseConst();
      if (c) consts.push(c);
    } else if (isIdent('export') && !exported) {
      exported = true;
      ({ pieces, layers } = parseExport());
    } else {
      notRepresentable('statement', t.range);
      skipStatement();
    }
  }
  if (!exported) report('missing-export', {}, peek().range);

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  const file: ScriptFile = { ...(imported ? { import: imported } : {}), consts, ...(pieces ? { pieces } : {}), ...(layers ? { layers } : {}), range: rangeOf(fileStart, peek().range.end) };
  return { file, diagnostics, comments: lexed.comments };
}
