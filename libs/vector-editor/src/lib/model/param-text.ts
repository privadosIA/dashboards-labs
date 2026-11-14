import { SVG_NS } from '../import/clean-svg';
import type { Node, VectorDocument } from './document';
import { findNode, pathTo } from './tree';

/** The text a text node or an imported `<text>` element holds now (what a text parameter starts with); an import's is found in its markup. */
export function textOf(doc: Pick<VectorDocument, 'nodes'>, id: string): string {
  const own = findNode(doc.nodes, id);
  if (own?.kind === 'text') return own.content;
  const path = pathTo(doc.nodes, id);
  if (!path) return '';
  let holder: Node | undefined;
  let nodes = doc.nodes;
  for (const step of path) {
    const node = nodes.find((n) => n.id === step)!;
    if (node.kind === 'import' && node.source) holder = node;
    nodes = node.children;
  }
  if (!holder || holder.kind !== 'import') return '';
  const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${holder.source}</svg>`, 'image/svg+xml');
  return (Array.from(parsed.querySelectorAll('[id]')).find((e) => e.id === id)?.textContent ?? '').trim();
}

/** A parameter name made from a node's name: lower case, digits and `_`, starting with a letter. */
export function suggestName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(base)) base = `p_${base}`.replace(/_$/, '');
  if (base === 'p') base = 'param';
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}_${n}`;
  return candidate;
}
