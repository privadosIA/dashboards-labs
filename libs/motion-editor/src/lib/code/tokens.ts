/** A place in the code: `offset` counts characters from 0, `line` and `column` count from 1 (what Monaco's markers use). */
export interface Pos {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface Range {
  readonly start: Pos;
  /** Just after the last character. */
  readonly end: Pos;
}

export type TokenKind = 'ident' | 'string' | 'number' | 'template' | 'punct' | 'eof';

export interface Token {
  readonly kind: TokenKind;
  /** The characters as written. */
  readonly text: string;
  /** The decoded value of a string, the number of a number; the text otherwise. */
  readonly value: string | number;
  readonly range: Range;
}

export interface Comment {
  readonly text: string;
  readonly range: Range;
}

/** Something the tokenizer could not read: an unfinished string or comment, a character the dialect has no use for. */
export interface TokenProblem {
  readonly kind: 'unterminated-string' | 'unterminated-comment' | 'bad-escape' | 'bad-number' | 'unexpected-character';
  readonly text: string;
  readonly range: Range;
}

export interface Tokens {
  readonly tokens: readonly Token[];
  readonly comments: readonly Comment[];
  readonly problems: readonly TokenProblem[];
}

const PUNCT3 = ['...', '===', '!==', '>>>'];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '**', '++', '--', '<<', '>>'];
const PUNCT1 = '{}[](),:;.+-*/%=<>!?&|^~@#';

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isIdentPart = (c: string): boolean => isIdentStart(c) || isDigit(c);

/**
 * Cuts the code into tokens. Comments are set aside, not dropped, so the sync can tell that the code has some. It never throws: what it
 * cannot read is a problem with a range and the reading goes on, so the parser can show more than the first mistake.
 */
export function tokenize(source: string): Tokens {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  const problems: TokenProblem[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const here = (): Pos => ({ offset: i, line, column });
  /** Moves over `n` characters, keeping the line and column up to date. */
  const advance = (n: number): void => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++;
        column = 1;
      } else column++;
      i++;
    }
  };

  while (i < source.length) {
    const c = source[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance(1);
      continue;
    }
    const start = here();
    if (c === '/' && source[i + 1] === '/') {
      let j = i;
      while (j < source.length && source[j] !== '\n') j++;
      const text = source.slice(i, j);
      advance(j - i);
      comments.push({ text, range: { start, end: here() } });
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const stop = close < 0 ? source.length : close + 2;
      const text = source.slice(i, stop);
      advance(stop - i);
      const range = { start, end: here() };
      comments.push({ text, range });
      if (close < 0) problems.push({ kind: 'unterminated-comment', text, range });
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < source.length && isIdentPart(source[j])) j++;
      const text = source.slice(i, j);
      advance(j - i);
      tokens.push({ kind: 'ident', text, value: text, range: { start, end: here() } });
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      let j = i;
      while (j < source.length && (isDigit(source[j]) || source[j] === '.' || source[j] === '_')) j++;
      if ((source[j] === 'e' || source[j] === 'E') && (isDigit(source[j + 1] ?? '') || ((source[j + 1] === '+' || source[j + 1] === '-') && isDigit(source[j + 2] ?? '')))) {
        j += 2;
        while (j < source.length && isDigit(source[j])) j++;
      }
      // A letter right after a number (`0x1F`, `12px`) is not a number the dialect has.
      while (j < source.length && isIdentPart(source[j])) j++;
      const text = source.slice(i, j);
      advance(j - i);
      const range = { start, end: here() };
      const value = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : Number.NaN;
      if (Number.isNaN(value)) problems.push({ kind: 'bad-number', text, range });
      tokens.push({ kind: 'number', text, value: Number.isNaN(value) ? 0 : value, range });
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      let bad: { text: string; at: number } | undefined;
      while (j < source.length) {
        const d = source[j];
        if (d === c) {
          closed = true;
          j++;
          break;
        }
        if (d === '\n') break;
        if (d === '\\') {
          const e = source[j + 1] ?? '';
          const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"', '`': '`', '/': '/' };
          if (e in simple) {
            value += simple[e];
            j += 2;
          } else if (e === 'u' && /^[0-9a-fA-F]{4}/.test(source.slice(j + 2, j + 6))) {
            value += String.fromCharCode(parseInt(source.slice(j + 2, j + 6), 16));
            j += 6;
          } else if (e === 'x' && /^[0-9a-fA-F]{2}/.test(source.slice(j + 2, j + 4))) {
            value += String.fromCharCode(parseInt(source.slice(j + 2, j + 4), 16));
            j += 4;
          } else {
            bad ??= { text: source.slice(j, j + 2), at: j };
            value += e;
            j += 2;
          }
          continue;
        }
        value += d;
        j++;
      }
      const text = source.slice(i, j);
      advance(j - i);
      const range = { start, end: here() };
      if (!closed) problems.push({ kind: 'unterminated-string', text, range });
      if (bad) problems.push({ kind: 'bad-escape', text: bad.text, range });
      tokens.push({ kind: 'string', text, value, range });
      continue;
    }
    if (c === '`') {
      // A template literal is not part of the dialect: it becomes one token so the parser can name it and go on after it.
      let j = i + 1;
      let depth = 0;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === '`' && depth === 0) {
          j++;
          break;
        } else if (source[j] === '$' && source[j + 1] === '{') {
          depth++;
          j += 2;
        } else if (source[j] === '}' && depth > 0) {
          depth--;
          j++;
        } else j++;
      }
      const stop = Math.min(j, source.length);
      const text = source.slice(i, stop);
      advance(stop - i);
      tokens.push({ kind: 'template', text, value: text, range: { start, end: here() } });
      continue;
    }
    const three = PUNCT3.find((p) => source.startsWith(p, i));
    const two = PUNCT2.find((p) => source.startsWith(p, i));
    const punct = three ?? two ?? (PUNCT1.includes(c) ? c : undefined);
    if (punct) {
      advance(punct.length);
      tokens.push({ kind: 'punct', text: punct, value: punct, range: { start, end: here() } });
      continue;
    }
    advance(1);
    problems.push({ kind: 'unexpected-character', text: c, range: { start, end: here() } });
  }

  const end = here();
  tokens.push({ kind: 'eof', text: '', value: '', range: { start: end, end } });
  return { tokens, comments, problems };
}
