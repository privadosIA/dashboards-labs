import { SVG_NS } from './clean-svg';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const length = (value: string | null): number | undefined => {
  if (value === null || /%/.test(value)) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The artboard: the `viewBox`, else `width` and `height`, else nothing (the caller then uses the box of the drawing). */
export function artboardOf(root: Element): Box | undefined {
  const parts = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  const width = length(root.getAttribute('width'));
  const height = length(root.getAttribute('height'));
  return width && height ? { x: 0, y: 0, width, height } : undefined;
}

const NONE: Box = { x: 0, y: 0, width: 0, height: 0 };

function boxOf(el: Element): Box {
  try {
    const { x, y, width, height } = (el as unknown as SVGGraphicsElement).getBBox();
    return { x, y, width, height };
  } catch {
    // An element with nothing to draw has no box.
    return NONE;
  }
}

/**
 * Mounts the cleaned markup in a hidden `<svg>` of the page and measures each element with `getBBox` (in the element's own coordinates).
 * Returns the box of every element that has an id and the box of the whole drawing. Needs a browser: a document with no layout gives zeros.
 */
export function measure(markup: string, ids: readonly string[]): { boxes: Map<string, Box>; drawing: Box } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden');
  svg.innerHTML = `<g>${markup}</g>`;
  document.body.appendChild(svg);
  try {
    const boxes = new Map<string, Box>();
    for (const id of ids) {
      const el = svg.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`);
      if (el) boxes.set(id, boxOf(el));
    }
    return { boxes, drawing: boxOf(svg.firstElementChild!) };
  } finally {
    svg.remove();
  }
}

export const centre = (box: Box): { x: number; y: number } => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
