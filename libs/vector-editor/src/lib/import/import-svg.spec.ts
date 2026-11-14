import { allIds, type Node } from '../model/document';
import { findNode } from '../model/tree';
import { installBBoxPolyfill } from '../../testing/bbox-polyfill';
import { SAMPLE_SVG } from '../../testing/sample-svg';
import { importSvg, MAX_BYTES, WARN_BYTES } from './import-svg';
import { artboardOf, centre } from './measure';

const wrap = (inner: string, attrs = 'viewBox="0 0 10 10"'): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

function imported(source: string, options?: Parameters<typeof importSvg>[1]) {
  const result = importSvg(source, options);
  if ('problem' in result) throw new Error(result.problem);
  return result;
}

describe('importSvg', () => {
  beforeAll(() => installBBoxPolyfill());

  it('turns the sample into a tree that mirrors its elements, with the artboard of its viewBox', () => {
    const { node, viewBox, report } = imported(SAMPLE_SVG);
    expect(viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(node.kind).toBe('import');
    expect(node.name).toBe('Sample logo');
    expect(allIds(node.children)).toEqual(['logo', 'dot', 'wing-a', 'wing-b', 'label', 'tag']);
    expect(findNode(node.children, 'dot')).toMatchObject({ tag: 'circle', fill: { kind: 'keep' }, transform: { anchorX: 50, anchorY: 50 } });
    expect(findNode(node.children, 'logo')!.children).toHaveLength(4);
    expect(report.styledByCss).toEqual(['tag']);
    expect(node.source).toContain('id="wing-b"');
    expect(node.source).not.toContain('xmlns');
  });

  it('gives the import node the centre of the drawing as its anchor', () => {
    const { node } = imported(SAMPLE_SVG);
    expect(node.transform.anchorX).toBeGreaterThan(0);
    expect(node.transform.anchorY).toBeGreaterThan(0);
  });

  it('does not let a script survive and lists what was removed', () => {
    const { node, report } = imported(wrap('<script>x()</script><rect id="r" width="1" height="1" onclick="y()"/><image href="https://example.com/a.png"/>'));
    expect(node.source).not.toMatch(/script|onclick|https|<image/);
    expect(report.removed).toMatchObject({ scripts: 1, handlers: 1, externalRefs: 1 });
  });

  it('makes two path id="a" unique in the markup and in the tree, both selectable', () => {
    const { node, report } = imported(wrap('<path id="a" d="M0 0 L1 1"/><path id="a" d="M2 2 L3 3"/>'));
    expect(node.children.map((c) => c.id)).toEqual(['a', 'a-2']);
    expect(node.source).toContain('id="a-2"');
    expect(report.renamed).toEqual([{ from: 'a', to: 'a-2' }]);
  });

  it('takes the artboard from width and height when there is no viewBox, and from the drawing when there is neither', () => {
    expect(imported(wrap('<rect id="r" width="1" height="1"/>', 'width="200" height="100"')).viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(imported(wrap('<rect id="r" x="10" y="20" width="30" height="40"/>', '')).viewBox).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(artboardOf(new DOMParser().parseFromString(wrap('', 'width="50%" height="10"'), 'image/svg+xml').documentElement)).toBeUndefined();
  });

  it('keeps ids away from the ones another import of the document already uses', () => {
    const { node } = imported(wrap('<g id="a"><path d="M0 0 L1 1"/></g>'), { taken: ['a'], id: 'imp' });
    expect(node.children.map((c) => c.id)).toEqual(['a-2']);
    expect(node.id).toBe('imp');
  });

  it('adds a second SVG to the current document: ids namespaced by the import, references followed, placed at the centre at half size', () => {
    const logo = wrap('<defs><linearGradient id="grad"><stop offset="0" stop-color="red"/></linearGradient></defs><g id="logo"><rect id="a" width="40" height="20" fill="url(#grad)"/></g>', 'viewBox="0 0 40 20"');
    const first = imported(logo, { id: 'first' });
    const second = imported(logo, { id: 'second', taken: ['first', 'logo', 'a', 'grad'], addTo: { x: 0, y: 0, width: 200, height: 100 } });
    expect(first.node.children.map((c) => c.id)).toEqual(['logo']);
    expect(second.node.id).toBe('second');
    expect(second.node.children.map((c) => c.id)).toEqual(['second-logo']);
    expect(second.node.children[0].children.map((c) => c.id)).toEqual(['second-a']);
    // The names are the ones the SVG gave, not the prefixed ids.
    expect(second.node.children[0].name).toBe('logo');
    expect(second.node.children[0].children[0].name).toBe('a');
    expect(second.node.source).toContain('id="second-grad"');
    expect(second.node.source).toContain('url(#second-grad)');
    expect(second.node.source).not.toContain('id="grad"');
    const all = [...allIds([first.node]), ...allIds([second.node])];
    expect(new Set(all).size).toBe(all.length);
    // 40 × 20 drawn in half of 200 × 100: scale 2.5, its centre (20, 10) at the artboard's centre (100, 50).
    expect(second.node.transform).toMatchObject({ scaleX: 2.5, scaleY: 2.5, x: 80, y: 40, anchorX: 20, anchorY: 10 });
  });

  it('keeps the first import as the SVG draws it: no prefix, no placement', () => {
    const { node } = imported(wrap('<rect id="a" width="1" height="1"/>'), { id: 'first' });
    expect(node.children[0].id).toBe('a');
    expect(node.transform).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });

  it('makes the import’s own id free of the prefixes already in the document', () => {
    const { node } = imported(wrap('<rect id="a" width="1" height="1"/>'), { id: 'logo', taken: ['logo', 'logo-a'], addTo: { x: 0, y: 0, width: 10, height: 10 } });
    expect(node.id).toBe('logo-2');
    expect(node.children[0].id).toBe('logo-2-a');
  });

  it('shows six levels of groups as nodes and counts what is deeper', () => {
    let inner = '<path id="leaf" d="M0 0 L1 1"/>';
    for (let level = 8; level >= 1; level--) inner = `<g id="g${level}">${inner}</g>`;
    const { node, report } = imported(wrap(inner));
    const depth = (nodes: Node[]): number => (nodes.length ? 1 + Math.max(...nodes.map((n) => depth(n.children))) : 0);
    expect(depth(node.children)).toBe(6);
    expect(report.tooDeep).toBe(3);
  });

  it('refuses what is not an SVG, and a file over 2 MB; it warns over 300 KB', () => {
    expect(importSvg('hello')).toEqual({ problem: expect.stringContaining('not an SVG') });
    expect(importSvg(wrap('<rect/>') + ' '.repeat(MAX_BYTES))).toEqual({ problem: expect.stringContaining('over 2 MB') });
    const big = imported(wrap('<rect id="r" width="1" height="1"/>') + `<!--${'x'.repeat(WARN_BYTES)}-->`);
    expect(big.report.warnings).toEqual(['large']);
  });

  it('measures through the browser: centre of a box', () => {
    expect(centre({ x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 25, y: 40 });
  });
});
