import type { DrawnNodeOf, Node, VectorDocument } from '../model/document';
import { fontFamily } from './fonts';
import { loadRuntime } from './runtime';

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PRESERVE = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' } as const;

/** What a drawn node is inside its `<g>`: the runtime sets the attributes that move (size, radius, text size) from the state at every seek. */
function drawn(node: DrawnNodeOf): string {
  switch (node.kind) {
    case 'rect':
      return `<rect data-vector-shape="" x="0" y="0" width="${node.width}" height="${node.height}" rx="${node.rx}"/>`;
    case 'ellipse':
      return `<ellipse data-vector-shape="" cx="0" cy="0" rx="${node.width / 2}" ry="${node.height / 2}"/>`;
    case 'line':
      return `<line data-vector-shape="" x1="0" y1="0" x2="${node.x2}" y2="${node.y2}"/>`;
    case 'text':
      return (
        `<text data-vector-shape="" x="0" y="0" text-anchor="${node.align}" style="font-family: ${escapeAttr(fontFamily(node.font))}" ` +
        `font-size="${node.fontSize}" font-weight="${node.fontWeight}">${escapeText(node.content)}</text>`
      );
    case 'image':
      return `<image data-vector-shape="" x="0" y="0" width="${node.width}" height="${node.height}" preserveAspectRatio="${PRESERVE[node.preserve]}" href="${escapeAttr(node.source)}"/>`;
  }
}

/**
 * The drawing order of the document as markup: a group is a `<g>` around its children, an import is a `<g>` around its markup, a drawn
 * node (rectangle, ellipse, line, text, image) is a `<g>` around its one element.
 */
export function markupOf(nodes: readonly Node[]): string {
  return nodes
    .map((node) => {
      const inside = node.kind === 'group' ? markupOf(node.children) : node.kind === 'import' ? node.source : drawn(node);
      return `<g id="${escapeAttr(node.id)}">${inside}</g>`;
    })
    .join('');
}

export interface RenderOptions {
  /** For a page that is HTML: no namespace declarations (an inline `<svg>` needs none, and a fragment must name no address). */
  html?: boolean;
  /** Give the `<svg>` a size of its own (a file opened on its own); a part's is the frame's. */
  size?: boolean;
}

/** The `<svg>` element of a document at `t`, drawn by the runtime: what the editor shows and what the fragment draws. */
export function renderElement(doc: VectorDocument, t: number): SVGSVGElement {
  const { x, y, width, height } = doc.viewBox;
  const background = doc.background ? `<rect data-vector-background="" x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeAttr(doc.background)}"/>` : '';
  const text =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${x} ${y} ${width} ${height}" ` +
    `preserveAspectRatio="${doc.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}">${background}${markupOf(doc.nodes)}</svg>`;
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  loadRuntime().create(doc, svg, {}).seek(t);
  return svg;
}

/** The inline SVG of a document at `t`, as text. */
export function renderSvg(doc: VectorDocument, t: number, options: RenderOptions = {}): string {
  const svg = renderElement(doc, t);
  if (options.html) svg.setAttribute('data-vector-root', '');
  if (options.size) {
    svg.setAttribute('width', String(doc.viewBox.width));
    svg.setAttribute('height', String(doc.viewBox.height));
  }
  const text = new XMLSerializer().serializeToString(svg);
  return options.html ? text.replace(/ xmlns(?::xlink)?="[^"]*"/g, '') : text;
}

/** A still SVG file of the document at `t`: no script, nothing from outside. */
export const toSvg = (doc: VectorDocument, t: number): string => renderSvg(doc, t, { size: true });
