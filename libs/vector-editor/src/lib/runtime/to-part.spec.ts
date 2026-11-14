import { newDocument } from '../model/document';
import { setBeatLink } from '../model/edits';
import { sampleDocument } from '../../testing/sample-document';
import { shapesDocument } from '../../testing/shapes-document';
import { installBBoxPolyfill } from '../../testing/bbox-polyfill';
import { fromPart } from './from-part';
import { renderElement, renderSvg, toSvg } from './render-svg';
import { toAnimatedSvg } from './to-animated-svg';
import { bodyBytes, DOES_NOT_MOVE, moves, SERVER_BODY_LIMIT, toPart, type PartFiles } from './to-part';

const options = { name: 'sample-logo', description: 'A logo that turns' };

function part(): PartFiles & { bytes: number } {
  const result = toPart(sampleDocument(), options);
  if ('problems' in result) throw new Error(result.problems.join());
  return result;
}

const numbers = (text: string | null): number[] => (text ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];

describe('toPart and fromPart', () => {
  beforeAll(() => installBBoxPolyfill());

  it('reopens what was exported: the document deep-equals the sample', () => {
    const result = fromPart(part());
    expect(result).toEqual({ doc: sampleDocument() });
  });

  it('refuses a fragment with no model, and a model from a newer version, saying so', () => {
    expect(fromPart({ fragment: '<div></div>' })).toEqual({ problem: expect.stringContaining('carries no model') });
    const newer = part().fragment.replace('"version":1', '"version":2');
    expect(fromPart({ fragment: newer })).toEqual({ problem: expect.stringContaining('newer version') });
  });

  it('writes a manifest with the document’s parameters and nothing animatable', () => {
    const manifest = JSON.parse(part().manifest);
    expect(manifest).toMatchObject({ name: 'sample-logo', version: 1, levels: ['simple', 'medium', 'advanced'], cost_ms: 40 });
    expect(manifest.params).toEqual([{ name: 'title', type: 'string', description: 'The text of the logo', default: 'LOGO', max_length: 20 }]);
    expect(part().manifest).not.toContain('animatable');
  });

  it('says in the description of a paint parameter that it is a colour', () => {
    const doc = sampleDocument();
    doc.params.push({ name: 'brand', type: 'string', description: 'The brand', default: '#ff0000', target: { nodeId: 'wing-b', what: 'fill' } });
    const result = toPart(doc, options) as PartFiles;
    expect(JSON.parse(result.manifest).params[1]).toMatchObject({ description: 'The brand (a colour: #rgb or #rrggbb)', max_length: 9 });
  });

  it('follows the part contract: __partSeek, __params, vw and vh, no address outside', () => {
    const { fragment } = part();
    expect(fragment).toContain('window.__partSeek =');
    expect(fragment).toContain('window.__params');
    expect(fragment).toMatch(/100vw/);
    expect(fragment).toMatch(/100vh/);
    expect(fragment).not.toMatch(/https?:\/\//);
    expect(fragment).toContain('data-vector-model');
  });

  it('moves when its page runs: the glue defines __partSeek and a later time changes the drawing', () => {
    const { fragment } = part();
    document.body.innerHTML = fragment;
    const w = window as unknown as Record<string, unknown>;
    w['__params'] = { title: 'Hello' };
    for (const script of Array.from(document.body.querySelectorAll('script:not([type])'))) new Function(script.textContent!)();
    const seek = w['__partSeek'] as (t: number, beat?: unknown) => void;
    expect(typeof seek).toBe('function');
    const dot = () => document.body.querySelector('[id="dot"]')!.getAttribute('transform');
    expect(document.body.querySelector('[id="label"]')!.textContent).toBe('Hello');
    expect(dot()).toBeNull();
    seek(2, { number: 0, position: 0 });
    expect(numbers(dot())).toContain(60);
    delete w['__partSeek'];
    delete w['__params'];
    document.body.innerHTML = '';
  });

  it('refuses a still part before the server does, with no texts', () => {
    const still = newDocument({ nodes: sampleDocument().nodes.map((n) => ({ ...n, children: [] })) });
    const result = toPart(still, options);
    expect(result).toEqual({ problems: [DOES_NOT_MOVE] });
    expect('manifest' in result).toBe(false);
    expect(moves(sampleDocument())).toBe(true);
    expect(moves(still)).toBe(false);
  });

  it('keeps a model with markup that would close a script from doing it', () => {
    const doc = sampleDocument();
    (doc.nodes[0] as { source: string }).source += '<text id="evil" x="0" y="0">&lt;/script&gt;&lt;b&gt;</text>';
    const result = toPart(doc, options) as PartFiles;
    expect(result.fragment.match(/<\/script>/g)).toHaveLength(3);
    expect(fromPart(result)).toEqual({ doc });
  });
});

describe('the drawing', () => {
  beforeAll(() => installBBoxPolyfill());

  it('fits by the document: contain is meet, cover is slice, and a background is a rect', () => {
    const doc = sampleDocument();
    expect(renderElement(doc, 0).getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    const cover = renderElement({ ...doc, fit: 'cover', background: '#101010' }, 0);
    expect(cover.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
    expect(cover.querySelector('[data-vector-background]')!.getAttribute('fill')).toBe('#101010');
  });

  it('draws a node above another one later: the order of the nodes is the order of the markup', () => {
    const doc = sampleDocument();
    const ids = Array.from(renderElement(doc, 0).querySelectorAll('[id]')).map((e) => e.id);
    expect(ids.indexOf('logo')).toBeLessThan(ids.indexOf('tag'));
    const swapped = { ...doc, nodes: [{ ...doc.nodes[0], children: [...doc.nodes[0].children].reverse() }] };
    expect(swapped.nodes[0].children[0].id).toBe('tag');
  });

  it('gives a still at a time with the attributes stateAt gives, and no script', () => {
    const svg = toSvg(sampleDocument(), 1);
    expect(svg).not.toContain('<script');
    expect(svg).toContain('width="200"');
    const dot = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('[id="dot"]')!;
    expect(numbers(dot.getAttribute('transform'))[0]).toBeCloseTo(30, 6);
  });

  it('writes the html form without namespace declarations', () => {
    const html = renderSvg(sampleDocument(), 0, { html: true });
    expect(html).not.toContain('xmlns');
    expect(html).toContain('data-vector-root');
  });
});

describe('toAnimatedSvg', () => {
  beforeAll(() => installBBoxPolyfill());

  it('is one well-formed file with the drawing, the model, the runtime and a driver, and refers to nothing outside', () => {
    const text = toAnimatedSvg(sampleDocument());
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(parsed.querySelector('script[data-vector-model]')!.textContent).toContain('"version":1');
    expect(text).toContain('requestAnimationFrame');
    expect(text).toContain('VectorRuntime');
    expect(text).not.toMatch(/(href|src)="https?:/);
    expect(text).not.toMatch(/<(link|iframe|object|embed)\b/);
  });

  it('can be reopened as a document', () => {
    const text = toAnimatedSvg(sampleDocument());
    const model = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('script[data-vector-model]')!.textContent!;
    expect(fromPart({ fragment: `<script data-vector-model>${model}</script>` })).toEqual({ doc: sampleDocument() });
  });
});

describe('toPart with drawn nodes', () => {
  beforeAll(() => installBBoxPolyfill());

  it('lists number parameters with their limits and text parameters with a max_length, and reopens the same document', () => {
    const doc = shapesDocument();
    doc.params = [
      { name: 'dot_w', type: 'number', description: 'Width of the dot', default: '120', min: 10, max: 400, target: { nodeId: 'dot', what: 'width' } },
      { name: 'words', type: 'string', description: 'The title', default: 'Hello', target: { nodeId: 'title', what: 'text' } },
    ];
    const result = toPart(doc, { name: 'shapes', description: 'Shapes' });
    if ('problems' in result) throw new Error(result.problems.join());
    const params = (JSON.parse(result.manifest) as { params: Array<Record<string, unknown>> }).params;
    expect(params[0]).toEqual({ name: 'dot_w', type: 'number', description: 'Width of the dot', default: 120, min: 10, max: 400 });
    expect(params[1]).toMatchObject({ name: 'words', type: 'string', max_length: 40 });
    expect(fromPart(result)).toEqual({ doc });
  });

  it('draws the five kinds in the fragment, with the image as a data URL and the fonts as the page’s variables', () => {
    const result = toPart(shapesDocument(), { name: 'shapes', description: 'Shapes' });
    if ('problems' in result) throw new Error(result.problems.join());
    expect(result.fragment).toMatch(/<rect data-vector-shape/);
    expect(result.fragment).toMatch(/<ellipse data-vector-shape/);
    expect(result.fragment).toMatch(/<line data-vector-shape/);
    expect(result.fragment).toMatch(/<text data-vector-shape[^>]*var\(--display/);
    expect(result.fragment).toMatch(/<image data-vector-shape[^>]*href="data:image\/png/);
    expect(result.fragment).not.toMatch(/https?:\/\//);
  });
});

describe('the size of the request', () => {
  beforeAll(() => installBBoxPolyfill());

  it('is the JSON body the server counts: the manifest and the fragment, escaped', () => {
    const result = toPart(sampleDocument(), { name: 'sample-logo', description: 'A logo that turns' });
    if ('problems' in result) throw new Error(result.problems.join());
    expect(result.bodyBytes).toBe(bodyBytes(result));
    expect(result.bodyBytes).toBeGreaterThan(result.bytes);
    expect(result.bodyBytes).toBeLessThan(SERVER_BODY_LIMIT);
  });

  it('counts a picture twice: in the drawing and in the model', () => {
    const doc = shapesDocument();
    const photo = doc.nodes.find((n) => n.id === 'photo') as { source: string };
    photo.source = `data:image/png;base64,${'A'.repeat(10_000)}`;
    const result = toPart(doc, { name: 'shapes', description: 'Shapes' });
    if ('problems' in result) throw new Error(result.problems.join());
    expect(result.fragment.split('A'.repeat(10_000)).length - 1).toBe(2);
  });
});

describe('the glue of a part', () => {
  beforeAll(() => installBBoxPolyfill());

  it('hands the page’s beat to the runtime: __partSeek(t, beat) seeks with it', () => {
    const result = toPart(sampleDocument(), { name: 'sample-logo', description: 'A logo that turns' });
    if ('problems' in result) throw new Error(result.problems.join());
    expect(result.fragment).toContain('window.__partSeek = function (t, beat) { runtime.seek(t, beat); };');
  });
});

describe('a part that only follows the beat', () => {
  beforeAll(() => installBBoxPolyfill());

  const still = () => newDocument({ nodes: [shapesDocument().nodes[3]], name: 'Rule' });

  it('moves when a link does something, and not when it does nothing', () => {
    expect(moves(still())).toBe(false);
    expect(moves(setBeatLink(still(), 'rule', 'scaleX', { kind: 'pulse', amount: 0.3, decay: 3 }))).toBe(true);
    expect(moves(setBeatLink(still(), 'rule', 'scaleX', { kind: 'pulse', amount: 0, decay: 3 }))).toBe(false);
    expect(moves(setBeatLink(still(), 'rule', 'rotate', { kind: 'alternate', values: [0, 10] }))).toBe(true);
    expect(moves(setBeatLink(still(), 'rule', 'rotate', { kind: 'alternate', values: [5, 5] }))).toBe(false);
    expect(moves(setBeatLink(still(), 'rule', 'opacity', { kind: 'loudness', amount: 0.5 }))).toBe(true);
  });

  it('can be made into a part, which carries the links in its model', () => {
    const doc = setBeatLink(still(), 'rule', 'scaleX', { kind: 'pulse', amount: 0.3, decay: 3 });
    const result = toPart(doc, { name: 'pulse-rule', description: 'A rule that pulses' });
    expect('problems' in result).toBe(false);
    if ('problems' in result) return;
    expect(result.fragment).toContain('"beat":{"scaleX":{"kind":"pulse"');
    expect(toPart(still(), { name: 'still-rule', description: 'x' })).toEqual({ problems: [DOES_NOT_MOVE] });
    const back = fromPart(result);
    expect('doc' in back && back.doc.nodes[0].beat).toEqual({ scaleX: { kind: 'pulse', amount: 0.3, decay: 3 } });
  });
});

