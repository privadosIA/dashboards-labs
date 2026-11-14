import type { CallNode, Expr, ObjectNode } from './ast';
import { parse } from './parse';

const SAMPLE = `import { script, piece, parts, beat, section, line, song } from '@motion/script';

// the chorus
const chorus = section('chorus');

export default script([
  piece({ id: 'p1', from: 0, to: chorus.start, part: parts.glassCard({ title: 'Neon Pulse', count: 3 }), mode: 'dark',
          lines: [line(3, { keyword: 'neon' })] }),
  piece({ id: 'p2', to: beat(48), part: parts.toggle({ label: 'allow', on: true }),
          with: [parts.timelineStrip({ marks: '1980|1990' })],
          hit: { word: 'pulse', at: beat(40, 0.5), length: 1 } }),
  piece({ id: 'p3', to: song.end, part: parts.stamp({ word: 'END', size: -2.5 }), design: { accent: '#ff00aa' } }),
]);
`;

const codes = (src: string): string[] => parse(src).diagnostics.map((d) => (d.code === 'not-representable' ? `nr:${d.args['what']}` : d.code));
/** The statement is wrapped in a valid file so only its own problems show. */
const inScript = (item: string): string => `export default script([\n${item}\n]);`;

describe('parse', () => {
  it('reads a whole script without diagnostics', () => {
    const r = parse(SAMPLE);
    expect(r.diagnostics).toEqual([]);
    expect(r.file.import?.names).toEqual(['script', 'piece', 'parts', 'beat', 'section', 'line', 'song']);
    expect(r.file.consts.map((c) => c.name)).toEqual(['chorus']);
    expect(r.file.pieces?.items.length).toBe(3);
    expect(r.comments.length).toBe(1);
  });

  it('keeps the range of every piece(...) call', () => {
    const r = parse(SAMPLE);
    const [p1, , p3] = r.file.pieces!.items as CallNode[];
    expect(p1.callee).toBe('piece');
    expect(p1.range.start.line).toBe(7);
    expect(p1.range.start.column).toBe(3);
    expect(p3.range.start.line).toBe(12);
  });

  it('reads every production of the grammar', () => {
    const r = parse(SAMPLE);
    const p1 = r.file.pieces!.items[0] as CallNode;
    const props = (p1.args[0] as ObjectNode).props;
    expect(props.map((p) => p.key)).toEqual(['id', 'from', 'to', 'part', 'mode', 'lines']);
    const to = props[2].value;
    expect(to).toMatchObject({ kind: 'member', name: 'start', object: { kind: 'ident', name: 'chorus' } });
    const part = props[3].value as CallNode;
    expect(part).toMatchObject({ kind: 'call', callee: 'parts', member: 'glassCard' });
    const p3 = (r.file.pieces!.items[2] as CallNode).args[0] as ObjectNode;
    expect(p3.props[1].value).toMatchObject({ kind: 'member', name: 'end', object: { name: 'song' } });
    const stampParams = ((p3.props[2].value as CallNode).args[0] as ObjectNode).props;
    expect(stampParams[1].value).toMatchObject({ kind: 'number', value: -2.5 });
    const p2 = (r.file.pieces!.items[1] as CallNode).args[0] as ObjectNode;
    expect(p2.props[3].value).toMatchObject({ kind: 'array' });
    expect(((p2.props[4].value as ObjectNode).props[1].value as CallNode).args.length).toBe(2);
  });

  it('accepts a string key, trailing commas and double quotes', () => {
    const r = parse(inScript(`piece({ "id": "a", to: 1, part: parts.x({ 'k': [1, 2,], }), }),`));
    expect(r.diagnostics).toEqual([]);
  });

  it('accepts the script without the import and the constants', () => {
    expect(parse(inScript('')).diagnostics).toEqual([]);
  });

  it('refuses an arrow function, naming it where it is', () => {
    const src = inScript('pieces.map(p => piece(p))');
    const r = parse(src);
    const arrow = r.diagnostics.find((d) => d.args['what'] === 'arrow function')!;
    expect(arrow).toBeDefined();
    expect(arrow.message).toBe('not representable: arrow function');
    expect(arrow.line).toBe(2);
    expect(arrow.column).toBe(12);
  });

  it('refuses a template literal', () => {
    expect(codes(inScript('piece({ id: `a${1}`, to: 1, part: parts.x() }),'))).toEqual(['nr:template literal']);
  });

  it('refuses arithmetic, naming the operator', () => {
    const r = parse(inScript('piece({ id: "a", to: 1 + 2, part: parts.x() }),'));
    expect(r.diagnostics.map((d) => d.args['what'])).toEqual(['arithmetic']);
    expect(r.diagnostics[0].column).toBe(24);
  });

  it('refuses a spread, in an array and in an object', () => {
    expect(codes(inScript('...more,'))).toEqual(['nr:spread']);
    expect(codes(inScript('piece({ ...base, id: "a", to: 1, part: parts.x() }),'))).toEqual(['nr:spread']);
  });

  it('refuses a computed key, a shorthand property and a method', () => {
    expect(codes(inScript('piece({ [k]: 1 }),'))).toEqual(['nr:computed key']);
    expect(codes(inScript('piece({ id, to: 1 }),'))).toEqual(['nr:shorthand property']);
    expect(codes(inScript('piece({ id() { return 1; } }),'))).toEqual(['nr:method']);
  });

  it('refuses another import and statements', () => {
    expect(codes(`import { x } from 'lodash';\n` + inScript(''))).toEqual(['nr:import of another module']);
    expect(codes(`import { a } from '@motion/script';\nimport { b } from '@motion/script';\n` + inScript(''))).toEqual(['nr:import of another module']);
    expect(codes('let x = 1;\n' + inScript(''))).toEqual(['nr:statement']);
    expect(codes('for (const p of ps) {}\n' + inScript(''))).toEqual(['nr:statement']);
  });

  it('refuses calls and members it does not have', () => {
    expect(codes(inScript('foo(1),'))).toEqual(['nr:call of foo']);
    expect(codes(inScript('new Piece(),'))).toEqual(['nr:new expression']);
    expect(codes(inScript('piece({ id: a.b }),'))).toEqual(['nr:member access .b']);
    expect(codes(inScript('piece({ id: a?.b }),'))).toEqual(['nr:optional chaining']);
    expect(codes(inScript('piece({ id: a[0] }),'))).toEqual(['nr:computed member access']);
  });

  it('reports a script that is not closed or has no export', () => {
    expect(codes("const a = 1;")).toEqual(['missing-export']);
    expect(codes('export default script([piece({ id: "a" })')).toEqual(['expected']);
    expect(codes('export default [1];')).toEqual(['expected']);
  });

  it('shows the mistake of every piece, not only the first', () => {
    const r = parse(inScript(`piece({ id: 'a', to: 1 + 1, part: parts.x() }),\npiece({ id: 'b', to: 2 * 2, part: parts.x() }),\npiece({ id: 'c', to: 3, part: parts.x() }),`));
    expect(r.diagnostics.map((d) => d.line)).toEqual([2, 3]);
    expect(r.file.pieces!.items.length).toBe(3);
  });

  it('keeps the tokenizer problems as diagnostics', () => {
    expect(codes(inScript("piece({ id: 'open }),"))).toContain('unterminated-string');
  });

  it('reads an expression of a constant', () => {
    const r = parse(`const a = beat(4);\nconst b = [1, 2];\n` + inScript(''));
    expect(r.diagnostics).toEqual([]);
    const [a, b] = r.file.consts;
    expect((a.value as Expr).kind).toBe('call');
    expect((b.value as Expr).kind).toBe('array');
  });
});

describe('parse: layers', () => {
  const file = (layers: string): string => `export default script([ piece({ id: 'a', to: song.end, part: parts.stamp() }) ], ${layers});`;

  it('reads the second argument of script as a list of layers', () => {
    const r = parse(file("[ layer('top', [ item(parts.toggle(), 1, 5), item(parts.stamp(), beat(8), song.end) ]) ]"));
    expect(r.diagnostics).toEqual([]);
    expect(r.file.pieces?.items).toHaveLength(1);
    const [l] = r.file.layers!.items as CallNode[];
    expect(l.callee).toBe('layer');
    expect(l.args).toHaveLength(2);
    expect(((l.args[1] as unknown as { items: CallNode[] }).items).map((i) => i.callee)).toEqual(['item', 'item']);
  });

  it('has no layers when the second argument is absent, and accepts a trailing comma', () => {
    expect(parse("export default script([ piece({ id: 'a', to: 5, part: parts.stamp() }) ]);").file.layers).toBeUndefined();
    const r = parse("export default script([ piece({ id: 'a', to: 5, part: parts.stamp() }), ],);");
    expect(r.diagnostics).toEqual([]);
    expect(r.file.layers).toBeUndefined();
  });

  it('says what it expected when the second argument is not a list', () => {
    expect(codes(file("layer('top', [])"))).toEqual(['expected']);
  });
});
