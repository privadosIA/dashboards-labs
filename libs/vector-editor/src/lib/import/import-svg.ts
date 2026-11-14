import type { ImportNode, Node, VectorDocument } from '../model/document';
import { identityTransform } from '../model/document';
import { cleanSvg, innerMarkup, parseSvg, styledByCss, type Removed } from './clean-svg';
import { identify, MAX_DEPTH, namespaceIds, NOT_DRAWN, SELECTABLE } from './identify';
import { artboardOf, centre, measure, type Box } from './measure';

/** Over this the file is refused. */
export const MAX_BYTES = 2 * 1024 * 1024;
/** Over this the person is warned: the SVG is in the part twice and the part goes into every page of the script (the server takes up to `SERVER_BODY_LIMIT`). */
export const WARN_BYTES = 300 * 1024;

export type ImportWarning = 'large';

export interface ImportReport {
  removed: Removed;
  /** Elements whose fill or stroke a stylesheet decides: they stay "as the SVG has it". */
  styledByCss: string[];
  /** Elements deeper than the selectable levels: they move with their parent. */
  tooDeep: number;
  /** Ids the import had to change to keep them unique, and how many it made. */
  renamed: Array<{ from: string; to: string }>;
  made: number;
  bytes: number;
  warnings: ImportWarning[];
}

export interface Imported {
  node: ImportNode;
  viewBox: VectorDocument['viewBox'];
  report: ImportReport;
}

export interface ImportOptions {
  /** The ids already in the document the import goes into, so that the new ones do not repeat them. */
  taken?: Iterable<string>;
  /** The import's own id (default `import`, made unique against `taken`). */
  id?: string;
  /**
   * "Add to the current": the import's ids are namespaced (\`<id>-<its id>\`) so that it cannot collide with another, and it is placed at the
   * centre of this artboard scaled to fit half of it. Without it the import keeps its own ids and stands where the SVG draws it.
   */
  addTo?: VectorDocument['viewBox'];
}

/** How much of the artboard an added import takes (each side). */
export const ADDED_FIT = 0.5;

const text = (el: Element, tag: string): string | undefined =>
  Array.from(el.children)
    .find((c) => c.localName === tag)
    ?.textContent?.trim() || undefined;

/** The selectable elements under `el` as nodes, flattening what is not drawn where it stands and what is not selectable. */
function build(el: Element, depth: number, boxes: Map<string, Box>, prefix = ''): ImportNode[] {
  const out: ImportNode[] = [];
  for (const child of Array.from(el.children)) {
    const tag = child.localName;
    if (NOT_DRAWN.has(tag)) continue;
    if (!SELECTABLE.has(tag)) {
      out.push(...build(child, depth, boxes, prefix));
      continue;
    }
    if (depth > MAX_DEPTH) continue;
    const id = child.getAttribute('id')!;
    // An import added to a document has its ids prefixed; the name the person sees is the id the SVG gave.
    const own = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
    const at = centre(boxes.get(id) ?? { x: 0, y: 0, width: 0, height: 0 });
    out.push({
      id,
      name: text(child, 'title') ?? (/^v-\d+$/.test(own) ? tag : own),
      kind: 'import',
      source: '',
      tag,
      visible: true,
      locked: false,
      transform: { ...identityTransform(), anchorX: at.x, anchorY: at.y },
      opacity: 1,
      fill: { kind: 'keep' },
      stroke: { kind: 'keep' },
      tracks: {},
      children: tag === 'g' ? build(child, depth + 1, boxes, prefix) : [],
    });
  }
  return out;
}

function countDeep(el: Element, depth: number): number {
  let n = 0;
  for (const child of Array.from(el.children)) {
    if (NOT_DRAWN.has(child.localName)) continue;
    const next = SELECTABLE.has(child.localName) ? depth + 1 : depth;
    if (SELECTABLE.has(child.localName) && depth > MAX_DEPTH) n++;
    n += countDeep(child, next);
  }
  return n;
}

/** The transform that puts a drawing of box \`drawn\` (centre \`at\`) at the centre of the artboard, scaled to take ADDED_FIT of it. */
function placement(artboard: VectorDocument['viewBox'], drawn: Box, at: { x: number; y: number }): { x: number; y: number; scaleX: number; scaleY: number } {
  const fit = Math.min((artboard.width * ADDED_FIT) / (drawn.width || 1), (artboard.height * ADDED_FIT) / (drawn.height || 1));
  const scale = Math.round(fit * 1e6) / 1e6;
  return { x: artboard.x + artboard.width / 2 - at.x, y: artboard.y + artboard.height / 2 - at.y, scaleX: scale, scaleY: scale };
}

/**
 * Turns the text of an SVG file into an `import` node: parsed, cleaned, every selectable element given a unique id, measured for its anchor,
 * and mirrored as a tree six levels deep. Refuses what is not an SVG and what is over 2 MB.
 */
export function importSvg(source: string, options: ImportOptions = {}): Imported | { problem: string } {
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > MAX_BYTES) return { problem: `The file is ${(bytes / 1048576).toFixed(1)} MB: over 2 MB it is not imported.` };
  const parsed = parseSvg(source);
  if ('problem' in parsed) return parsed;
  const { root, removed } = cleanSvg(parsed.root);
  const taken = new Set(options.taken ?? []);
  const { made, renamed } = identify(root, options.addTo ? [] : taken);
  let id = options.id ?? 'import';
  if (options.addTo) {
    // The ids this import brings are all new once prefixed, so the import's own id is the only one to keep free.
    const own = new Set(Array.from(root.querySelectorAll('[id]')).map((el) => el.id));
    for (let n = 2; taken.has(id) || [...taken].some((t) => t.startsWith(`${id}-`)) || own.has(id); n++) id = `${options.id ?? 'import'}-${n}`;
    namespaceIds(root, id);
  }
  const markup = innerMarkup(root);
  const ids = Array.from(root.querySelectorAll('[id]')).map((el) => el.id);
  const { boxes, drawing } = measure(markup, ids);
  const viewBox = artboardOf(root) ?? (drawing.width > 0 ? drawing : { x: 0, y: 0, width: 100, height: 100 });
  const children = build(root, 1, boxes, options.addTo ? `${id}-` : '') as Node[];
  if (!options.addTo) for (let n = 2; taken.has(id) || ids.includes(id); n++) id = `${options.id ?? 'import'}-${n}`;
  const at = centre(drawing);
  const node: ImportNode = {
    id,
    name: text(root, 'title') ?? 'Import',
    kind: 'import',
    source: markup,
    tag: 'svg',
    visible: true,
    locked: false,
    transform: { ...identityTransform(), ...(options.addTo ? placement(options.addTo, drawing.width > 0 ? drawing : viewBox, at) : {}), anchorX: at.x, anchorY: at.y },
    opacity: 1,
    fill: { kind: 'keep' },
    stroke: { kind: 'keep' },
    tracks: {},
    children,
  };
  return {
    node,
    viewBox,
    report: {
      removed,
      styledByCss: styledByCss(root),
      tooDeep: countDeep(root, 1),
      renamed,
      made: made.length,
      bytes,
      warnings: bytes > WARN_BYTES ? ['large'] : [],
    },
  };
}
