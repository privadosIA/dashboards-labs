import { addParam, setBeatLink } from '../model/edits';
import { stateAt, type NodeState } from '../model/evaluate';
import type { Paint, Transform, VectorDocument } from '../model/document';
import { walk } from '../model/tree';
import { sampleDocument } from '../../testing/sample-document';
import { shapesDocument } from '../../testing/shapes-document';
import { renderElement } from './render-svg';
import { FORBIDDEN_IN_RUNTIME, loadRuntime, RUNTIME_SOURCE } from './runtime';

const TIMES = Array.from({ length: 20 }, (_, i) => (i * 4) / 19);
const numbers = (text: string | null): number[] => (text ?? '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];

/** The transform attribute the runtime must write, worked out here on its own: the element's own, then the node's about its anchor. */
function expectedTransform(original: string | null, t: Transform): number[] {
  const identity = t.x === 0 && t.y === 0 && t.scaleX === 1 && t.scaleY === 1 && t.rotate === 0;
  return identity ? numbers(original) : [...numbers(original), t.x, t.y, t.anchorX, t.anchorY, t.rotate, t.scaleX, t.scaleY, -t.anchorX, -t.anchorY];
}

function close(what: string, actual: number[], expected: number[]): void {
  expect(actual, what).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `${what} [${i}]: ${v} against ${expected[i]}`).toBeLessThan(1e-6));
}

const paintText = (p: Paint): string | null => (p.kind === 'color' ? p.value : p.kind === 'none' ? 'none' : null);

describe('the runtime', () => {
  const doc = sampleDocument();

  it('draws, at twenty times, what stateAt says: transform, opacity, fill, stroke and stroke width of every node', () => {
    const svg = renderElement(doc, 0);
    // The drawing is already at 0 s; the SVG's own attributes are read from its markup, untouched.
    const fresh = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${(doc.nodes[0] as { source: string }).source}</svg>`, 'image/svg+xml').documentElement;
    const own = (id: string, name: string): string | null => fresh.querySelector(`[id="${id}"]`)?.getAttribute(name) ?? null;
    const runtime = loadRuntime().create(doc, svg, {});
    for (const t of TIMES) {
      runtime.seek(t);
      const expected = stateAt(doc, t);
      for (const node of walk(doc.nodes)) {
        const el = svg.querySelector(`[id="${node.id}"]`)!;
        const s: NodeState = expected.get(node.id)!;
        close(`${node.id} transform at ${t}`, numbers(el.getAttribute('transform')), expectedTransform(own(node.id, 'transform'), s.transform));
        close(`${node.id} opacity at ${t}`, numbers(el.getAttribute('opacity')), s.opacity === 1 ? numbers(own(node.id, 'opacity')) : [s.opacity]);
        expect(el.getAttribute('fill')).toBe(s.fill.kind === 'keep' ? own(node.id, 'fill') : paintText(s.fill));
        expect(el.getAttribute('stroke')).toBe(s.stroke.kind === 'keep' ? own(node.id, 'stroke') : paintText(s.stroke));
        expect(el.getAttribute('stroke-width')).toBe(s.strokeWidth === undefined ? own(node.id, 'stroke-width') : String(s.strokeWidth));
      }
    }
  });

  it('evaluates the same states as the editor’s own evaluator', () => {
    const runtime = loadRuntime().create(doc, renderElement(doc, 0), {});
    for (const t of TIMES) {
      const theirs = runtime.states(t) as Record<string, NodeState>;
      for (const [id, s] of stateAt(doc, t)) {
        const r = theirs[id];
        for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'anchorX', 'anchorY'] as const) expect(Math.abs(r.transform[key] - s.transform[key])).toBeLessThan(1e-6);
        expect(Math.abs(r.opacity - s.opacity)).toBeLessThan(1e-6);
        expect(Math.abs(r.effectiveOpacity - s.effectiveOpacity)).toBeLessThan(1e-6);
        expect(r.fill).toEqual(s.fill);
        expect(r.shown).toBe(s.shown);
      }
    }
  });

  it('leaves the original transform of an element in front of its own', () => {
    const svg = renderElement(doc, 0);
    loadRuntime().create(doc, svg, {}).seek(0);
    expect(svg.querySelector('[id="wing-a"]')!.getAttribute('transform')).toBe('translate(2 0)');
    const runtime = loadRuntime().create(doc, svg, {});
    expect(runtime).toBeDefined();
  });

  it('hides a node that is not visible and restores it, and leaves a "keep" paint as the SVG has it', () => {
    const hidden: VectorDocument = JSON.parse(JSON.stringify(doc));
    hidden.nodes[0].children[1].visible = false;
    const svg = renderElement(hidden, 0);
    expect(svg.querySelector('[id="tag"]')!.getAttribute('display')).toBe('none');
    expect(svg.querySelector('[id="dot"]')!.getAttribute('fill')).toBe('#e63946');
  });

  it('applies a paint parameter before the first frame and a text parameter to the text', () => {
    const withBrand = addParam(doc, { name: 'brand', type: 'string', description: 'x', default: '#ff0000', target: { nodeId: 'wing-b', what: 'fill' } });
    const svg = renderElement(withBrand, 0);
    const runtime = loadRuntime().create(withBrand, svg, { brand: '#00ff00', title: 'Hi' });
    runtime.seek(0);
    expect(svg.querySelector('[id="wing-b"]')!.getAttribute('fill')).toBe('#00ff00');
    expect(svg.querySelector('[id="label"]')!.textContent).toBe('Hi');
  });

  it('uses the default of a parameter that was not given, and ignores a value that is not a colour', () => {
    const withBrand = addParam(doc, { name: 'brand', type: 'string', description: 'x', default: '#ff0000', target: { nodeId: 'wing-b', what: 'fill' } });
    const a = renderElement(withBrand, 0);
    loadRuntime().create(withBrand, a, {}).seek(0);
    expect(a.querySelector('[id="wing-b"]')!.getAttribute('fill')).toBe('#ff0000');
    expect(a.querySelector('[id="label"]')!.textContent).toBe('LOGO');
    const b = renderElement(withBrand, 0);
    loadRuntime().create(withBrand, b, { brand: 'javascript:alert(1)' }).seek(0);
    expect(b.querySelector('[id="wing-b"]')!.getAttribute('fill')).toBe('#a8dadc');
  });

  it('does not touch the document it was given', () => {
    const before = JSON.stringify(doc);
    const withBrand = addParam(doc, { name: 'brand', type: 'string', description: 'x', default: '#ff0000', target: { nodeId: 'wing-b', what: 'fill' } });
    const snapshot = JSON.stringify(withBrand);
    loadRuntime().create(withBrand, renderElement(withBrand, 0), { brand: '#00ff00' }).seek(1);
    expect(JSON.stringify(withBrand)).toBe(snapshot);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('uses a design variable through the style, not an attribute', () => {
    const themed = sampleDocument();
    themed.nodes[0].children[1].fill = { kind: 'var', name: 'accent' };
    const svg = renderElement(themed, 0);
    expect(svg.querySelector('[id="tag"]')!.getAttribute('style')).toContain('var(--accent');
    expect(svg.querySelector('[id="tag"]')!.hasAttribute('fill')).toBe(false);
  });

  it('is free of timers, the clock, randomness and anything from outside', () => {
    for (const name of FORBIDDEN_IN_RUNTIME) expect(RUNTIME_SOURCE).not.toContain(name);
  });

  describe('drawn nodes', () => {
    const shapes = shapesDocument();
    const attr = (svg: SVGSVGElement, id: string, name: string): number => Number(svg.querySelector(`[id="${id}"] [data-vector-shape]`)!.getAttribute(name));

    it('draws, at twenty times, the size, radius and text size stateAt says, and the node transform around its anchor', () => {
      const svg = renderElement(shapes, 0);
      const runtime = loadRuntime().create(shapes, svg, {});
      for (const t of TIMES) {
        runtime.seek(t);
        const expected = stateAt(shapes, t);
        const bar = expected.get('bar')!.shape;
        expect(attr(svg, 'bar', 'width')).toBeCloseTo(bar.width!, 5);
        expect(attr(svg, 'bar', 'rx')).toBeCloseTo(bar.rx!, 5);
        expect(attr(svg, 'title', 'font-size')).toBeCloseTo(expected.get('title')!.shape.fontSize!, 5);
        const dot = expected.get('dot')!.shape;
        expect(attr(svg, 'dot', 'ry')).toBeCloseTo(dot.height! / 2, 5);
        expect(attr(svg, 'dot', 'rx')).toBeCloseTo(dot.width! / 2, 5);
        expect(svg.querySelector('[id="dot"]')!.getAttribute('fill')).toBe(paintText(expected.get('dot')!.fill));
        close(`bar transform at ${t}`, numbers(svg.querySelector('[id="bar"]')!.getAttribute('transform')), expectedTransform(null, expected.get('bar')!.transform));
      }
    });

    it('draws each kind as its own element', () => {
      const svg = renderElement(shapes, 0);
      const tags = ['bar', 'title', 'dot', 'rule', 'photo'].map((id) => svg.querySelector(`[id="${id}"] [data-vector-shape]`)!.localName);
      expect(tags).toEqual(['rect', 'text', 'ellipse', 'line', 'image']);
      expect(svg.querySelector('[id="title"] text')!.textContent).toBe('Hello');
      expect(svg.querySelector('[id="photo"] image')!.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
      expect(svg.querySelector('[id="photo"] image')!.getAttribute('href')).toMatch(/^data:image\/png/);
      expect(attr(svg, 'rule', 'x2')).toBe(120);
    });

    it('writes display and body as the page’s variables and a name of the six as its stack', () => {
      const doc = shapesDocument();
      const title = doc.nodes[1] as { font: string };
      const style = (font: string): string => {
        title.font = font;
        return renderElement(doc, 0).querySelector('[id="title"] text')!.getAttribute('style')!;
      };
      expect(style('display')).toContain('var(--display');
      expect(style('body')).toContain('var(--body');
      expect(style('serif')).toContain('Georgia');
      expect(style('Comic Sans')).toContain('"Comic Sans", sans-serif');
    });

    it('applies a number parameter before the first seek, inside its limits, and a text parameter to a drawn text', () => {
      let doc = shapesDocument();
      doc = JSON.parse(JSON.stringify(doc));
      doc.nodes = doc.nodes.filter((n) => n.id !== 'bar');
      doc.params = [
        { name: 'dot_w', type: 'number', description: 'x', default: '120', min: 10, max: 400, target: { nodeId: 'dot', what: 'width' } },
        { name: 'words', type: 'string', description: 'x', default: 'Hello', max_length: 12, target: { nodeId: 'title', what: 'text' } },
      ];
      const svg = renderElement(doc, 0);
      loadRuntime().create(doc, svg, { dot_w: 200, words: 'Hi' }).seek(2);
      expect(attr(svg, 'dot', 'rx')).toBe(100);
      expect(svg.querySelector('[id="title"] text')!.textContent).toBe('Hi');
      const over = renderElement(doc, 0);
      loadRuntime().create(doc, over, { dot_w: 9999 }).seek(2);
      expect(attr(over, 'dot', 'rx')).toBe(200);
      const none = renderElement(doc, 0);
      loadRuntime().create(doc, none, {}).seek(2);
      expect(attr(none, 'dot', 'rx')).toBe(60);
    });
  });

  describe('beat links', () => {
    const linked = (): VectorDocument => {
      let d = sampleDocument();
      d = setBeatLink(d, 'logo', 'scaleX', { kind: 'pulse', amount: 0.3, decay: 3 });
      d = setBeatLink(d, 'dot', 'opacity', { kind: 'loudness', amount: -0.5 });
      d = setBeatLink(d, 'wing-a', 'fill', { kind: 'alternate', values: ['#ff0000', '#0000ff'] });
      d = setBeatLink(d, 'tag', 'rotate', { kind: 'alternate', values: [0, 20] });
      return d;
    };
    /** Two beats a second, the first at 0.5 s: number −1 before it. */
    const beatAt = (t: number) => ({ number: Math.floor(t * 2) - 1, position: (t * 2) % 1 });
    const loud = (t: number): number => (Math.sin(t * 3) + 1) / 2;

    it('evaluates the same states as the editor’s own evaluator, with a synthetic beat and loudness, at twenty times', () => {
      const withLinks = linked();
      const runtime = loadRuntime().create(withLinks, renderElement(withLinks, 0), {}, { loudnessAt: loud });
      for (const t of TIMES) {
        const theirs = runtime.states(t, beatAt(t)) as Record<string, NodeState>;
        for (const [id, s] of stateAt(withLinks, t, beatAt(t), loud)) {
          const r = theirs[id];
          for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotate'] as const) expect(Math.abs(r.transform[key] - s.transform[key]), `${id} ${key} at ${t}`).toBeLessThan(1e-9);
          expect(Math.abs(r.opacity - s.opacity), `${id} opacity at ${t}`).toBeLessThan(1e-9);
          expect(r.fill, `${id} fill at ${t}`).toEqual(s.fill);
        }
      }
    });

    it('draws the linked values: the pulse on the logo’s scale, the alternating colour of a wing', () => {
      const withLinks = linked();
      const svg = renderElement(withLinks, 0);
      const runtime = loadRuntime().create(withLinks, svg, {});
      runtime.seek(0.75, { number: 0, position: 0.5 });
      const scale = numbers(svg.querySelector('[id="logo"]')!.getAttribute('transform'));
      expect(scale[scale.length - 4]).toBeCloseTo(stateAt(withLinks, 0.75, { number: 0, position: 0.5 }).get('logo')!.transform.scaleX, 6);
      runtime.seek(1.25, { number: 1, position: 0.5 });
      expect(svg.querySelector('[id="wing-a"]')!.getAttribute('fill')).toBe('#0000ff');
      runtime.seek(1.75, { number: 2, position: 0.5 });
      expect(svg.querySelector('[id="wing-a"]')!.getAttribute('fill')).toBe('#ff0000');
    });

    it('is silent without a beat: an animated SVG, or a piece before its first beat, draws what the tracks give', () => {
      const withLinks = linked();
      const plain = loadRuntime().create(sampleDocument(), renderElement(sampleDocument(), 0), {});
      const silent = loadRuntime().create(withLinks, renderElement(withLinks, 0), {});
      for (const t of TIMES) {
        for (const beat of [undefined, null, { number: -1, position: 0.3 }]) {
          const a = plain.states(t) as Record<string, NodeState>;
          const b = silent.states(t, beat) as Record<string, NodeState>;
          for (const id of Object.keys(a)) {
            if (id === 'dot') continue; // its loudness link has no curve here either way
            expect(b[id].transform).toEqual(a[id].transform);
            expect(b[id].fill).toEqual(a[id].fill);
          }
        }
      }
    });

    it('reads the loudness of the page’s song map (window.__motionSong) when the host gives no curve', () => {
      const withLinks = linked();
      (globalThis as unknown as { __motionSong?: unknown }).__motionSong = { loudness: [0, 0.5, 1], loudness_hop: 1 };
      try {
        const runtime = loadRuntime().create(withLinks, renderElement(withLinks, 0), {});
        const opacityAt = (t: number): number => (runtime.states(t) as Record<string, NodeState>)['dot'].opacity;
        const base = (t: number): number => (stateAt(sampleDocument(), t).get('dot') as NodeState).opacity;
        expect(opacityAt(0.5)).toBeCloseTo(base(0.5), 9);
        expect(opacityAt(1.5)).toBeCloseTo(Math.max(0, base(1.5) - 0.25), 9);
        expect(opacityAt(2.5)).toBeCloseTo(Math.max(0, base(2.5) - 0.5), 9);
        expect(opacityAt(9)).toBeCloseTo(Math.max(0, base(9) - 0.5), 9);
      } finally {
        delete (globalThis as unknown as { __motionSong?: unknown }).__motionSong;
      }
    });
  });
});

