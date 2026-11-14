/** jsdom does not lay anything out. This gives `getBBox` a box for the shapes the specs use, from their attributes (paths: from the numbers of `d`). */
function box(el: Element): { x: number; y: number; width: number; height: number } {
  const n = (name: string): number => parseFloat(el.getAttribute(name) ?? '0') || 0;
  switch (el.localName) {
    case 'circle':
      return { x: n('cx') - n('r'), y: n('cy') - n('r'), width: 2 * n('r'), height: 2 * n('r') };
    case 'rect':
    case 'image':
      return { x: n('x'), y: n('y'), width: n('width'), height: n('height') };
    case 'text':
      return { x: n('x'), y: n('y') - n('font-size'), width: (el.textContent ?? '').length * n('font-size') * 0.6, height: n('font-size') };
    case 'path': {
      const nums = (el.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 };
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    default: {
      const boxes = Array.from(el.children)
        .filter((c) => !['style', 'title', 'desc', 'defs'].includes(c.localName))
        .map(box)
        .filter((b) => b.width > 0 || b.height > 0);
      if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
    }
  }
}

/** Installs `getBBox` on every SVG element of the test document. Call it from a `beforeAll`. */
export function installBBoxPolyfill(): void {
  (SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = function (this: Element) {
    return box(this);
  };
}
