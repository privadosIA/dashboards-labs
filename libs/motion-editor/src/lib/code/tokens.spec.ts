import { tokenize } from './tokens';

const kinds = (src: string): string[] => tokenize(src).tokens.map((t) => `${t.kind}:${t.text}`);

describe('tokenize', () => {
  it('cuts identifiers, numbers, strings and punctuation', () => {
    expect(kinds("piece({ id: 'p1', to: 1.5 })")).toEqual([
      'ident:piece', 'punct:(', 'punct:{', 'ident:id', 'punct::', "string:'p1'", 'punct:,', 'ident:to', 'punct::', 'number:1.5', 'punct:}', 'punct:)', 'eof:',
    ]);
  });

  it('decodes the escapes of a string', () => {
    const t = tokenize(String.raw`'a\'b\nA\x42"'`).tokens[0];
    expect(t.kind).toBe('string');
    expect(t.value).toBe('a\'b\nAB"');
  });

  it('reads both kinds of quotes', () => {
    expect(tokenize('"x"').tokens[0].value).toBe('x');
    expect(tokenize("'y'").tokens[0].value).toBe('y');
  });

  it('keeps line and column from 1 and the end just after the last character', () => {
    const t = tokenize('ab\n  cd').tokens;
    expect(t[0].range).toEqual({ start: { offset: 0, line: 1, column: 1 }, end: { offset: 2, line: 1, column: 3 } });
    expect(t[1].range.start).toEqual({ offset: 5, line: 2, column: 3 });
    expect(t[1].range.end).toEqual({ offset: 7, line: 2, column: 5 });
  });

  it('sets comments aside with their position', () => {
    const r = tokenize('a // one\n/* two\nlines */ b');
    expect(r.tokens.map((t) => t.text)).toEqual(['a', 'b', '']);
    expect(r.comments.map((c) => c.text)).toEqual(['// one', '/* two\nlines */']);
    expect(r.comments[1].range.start.line).toBe(2);
    expect(r.comments[1].range.end.line).toBe(3);
  });

  it('reads exponents, a leading dot and a three-character operator', () => {
    expect(tokenize('1e3').tokens[0].value).toBe(1000);
    expect(tokenize('.5').tokens[0].value).toBe(0.5);
    expect(tokenize('...x').tokens[0].text).toBe('...');
    expect(tokenize('a => b').tokens[1].text).toBe('=>');
  });

  it('makes a template literal one token, with its substitutions inside', () => {
    const r = tokenize('`a ${b} c` d');
    expect(r.tokens.map((t) => t.kind)).toEqual(['template', 'ident', 'eof']);
    expect(r.tokens[0].text).toBe('`a ${b} c`');
  });

  it('reports what it cannot read and goes on', () => {
    const r = tokenize("'open\nx § 0x1F '\\q'");
    expect(r.problems.map((p) => p.kind)).toEqual(['unterminated-string', 'unexpected-character', 'bad-number', 'bad-escape']);
    expect(r.tokens.some((t) => t.text === 'x')).toBe(true);
  });

  it('reports a comment that is not closed', () => {
    expect(tokenize('a /* never').problems.map((p) => p.kind)).toEqual(['unterminated-comment']);
  });
});
