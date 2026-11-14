/** The easings of a keyframe: how its value goes to the next keyframe's (the repository's, and the server's). */
export type Ease = 'linear' | 'in' | 'out' | 'in-out' | 'step';
export const EASES: readonly Ease[] = ['linear', 'in', 'out', 'in-out', 'step'];

/** What a track can animate. */
export type Property = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotate' | 'opacity' | 'fill' | 'stroke' | 'strokeWidth' | 'width' | 'height' | 'rx' | 'fontSize';
export const NUMBER_PROPERTIES: readonly Property[] = ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'opacity', 'strokeWidth', 'width', 'height', 'rx', 'fontSize'];
export const PAINT_PROPERTIES: readonly Property[] = ['fill', 'stroke'];
export const PROPERTIES: readonly Property[] = ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'opacity', 'fill', 'stroke', 'strokeWidth', 'width', 'height', 'rx', 'fontSize'];
/** The properties only some kinds have: the kind decides whether the properties panel and the timeline offer them. */
export const SHAPE_PROPERTIES: readonly Property[] = ['width', 'height', 'rx', 'fontSize'];

export interface Keyframe {
  /** Seconds from the start of the document, inside `[0, duration]`. */
  t: number;
  /** A number, or a `#rrggbb` colour for `fill` and `stroke`. */
  value: number | string;
  ease: Ease;
}

/** The design's variables a paint can name; they mean something only inside a piece and fall back to a colour outside. */
export type PaintVar = 'accent' | 'fg' | 'bg' | 'dark' | 'light';
export const PAINT_VARS: readonly PaintVar[] = ['accent', 'fg', 'bg', 'dark', 'light'];

/** `keep` means "as the SVG has it". */
export type Paint = { kind: 'none' } | { kind: 'color'; value: string } | { kind: 'var'; name: PaintVar } | { kind: 'keep' };

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Degrees, around the anchor. */
  rotate: number;
  /** The point the node turns and scales around, in the node's own coordinates. */
  anchorX: number;
  anchorY: number;
}

/** What a property does on the beat of a piece: add a decaying pulse on each beat, alternate between two values on even and odd beats, or follow the loudness. */
export type BeatLink =
  | { kind: 'pulse'; amount: number; decay: number }
  | { kind: 'alternate'; values: [number | string, number | string] }
  | { kind: 'loudness'; amount: number };
export type BeatKind = BeatLink['kind'];
export const BEAT_KINDS: readonly BeatKind[] = ['pulse', 'alternate', 'loudness'];
export const PULSE_DECAY = { min: 1, max: 8, default: 3 } as const;

/** The part of the page's beat the links read: the beat's number (−1 before the first one) and how far into it the time is, in `[0, 1)`. */
export interface Beat {
  number: number;
  position: number;
}

/** The loudness (0 to 1) of the song at a time of the part, when the host has a curve. */
export type LoudnessAt = (t: number) => number;

export interface NodeBase {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  opacity: number;
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  tracks: Partial<Record<Property, Keyframe[]>>;
  /** Per property, what it does on the beat: it rides on the track's value, and does nothing where no beat is given. */
  beat?: Partial<Record<Property, BeatLink>>;
}

export interface GroupNode extends NodeBase {
  kind: 'group';
  children: Node[];
}

/**
 * The cleaned markup of an imported SVG (`source`, the inside of its root) and the elements the person can select. A child of an import has
 * an empty `source`: it is a handle on the element of its parent's markup that has its `id`, and `tag` says which element that is.
 */
export interface ImportNode extends NodeBase {
  kind: 'import';
  source: string;
  tag?: string;
  children: Node[];
}

/** The shapes, text and images the editor draws itself. They have no children (the field is there so that the tree code needs no special case). */
interface DrawnNode extends NodeBase {
  children: Node[];
}

/** A rectangle at the node's origin (its top left corner); `rx` rounds the corners. */
export interface RectNode extends DrawnNode {
  kind: 'rect';
  width: number;
  height: number;
  rx: number;
}

/** An ellipse whose centre is the node's origin. */
export interface EllipseNode extends DrawnNode {
  kind: 'ellipse';
  width: number;
  height: number;
}

/** A line from the node's origin to (`x2`, `y2`) in the node's own coordinates. */
export interface LineNode extends DrawnNode {
  kind: 'line';
  x2: number;
  y2: number;
}

/** The stacks a text can name besides a free one: the page's `--display` and `--body`. */
export type TextFont = 'display' | 'body' | string;
export type TextAlign = 'start' | 'middle' | 'end';

/** One line of text with one style; its origin is where the baseline starts (aligned by `align`). `fill` is the text's colour. */
export interface TextNode extends DrawnNode {
  kind: 'text';
  content: string;
  font: TextFont;
  fontSize: number;
  fontWeight: number;
  align: TextAlign;
}

/** A picture as a `data:` URL, drawn in the box `width` × `height` from the node's origin. */
export interface ImageNode extends DrawnNode {
  kind: 'image';
  source: string;
  width: number;
  height: number;
  preserve: 'contain' | 'cover' | 'stretch';
}

export type DrawnKind = 'rect' | 'ellipse' | 'line' | 'text' | 'image';
export const DRAWN_KINDS: readonly DrawnKind[] = ['rect', 'ellipse', 'line', 'text', 'image'];
export type DrawnNodeOf = RectNode | EllipseNode | LineNode | TextNode | ImageNode;

export type Node = GroupNode | ImportNode | DrawnNodeOf;

export type ParamTarget = { nodeId: string; what: 'text' | 'fill' | 'stroke' | 'width' | 'height' | 'fontSize' };

/** A text or a paint that the piece sets: in the exported part it is a parameter of the manifest. */
export interface Param {
  name: string;
  type: 'string' | 'number';
  description: string;
  default: string;
  max_length?: number;
  min?: number;
  max?: number;
  target: ParamTarget;
}

export interface VectorDocument {
  version: 1;
  /** What the person calls the document: the file's name and the part's default name. */
  name?: string;
  /** The part of the catalog this document was opened from or sent as, so the next send can replace it. */
  partName?: string;
  viewBox: { x: number; y: number; width: number; height: number };
  /** Seconds. */
  duration: number;
  fps: 30 | 60;
  fit: 'contain' | 'cover';
  background?: string;
  nodes: Node[];
  params: Param[];
}

export const DOCUMENT_VERSION = 1;
export const PARAM_NAME = /^[a-z][a-z0-9_]*$/;

export const identityTransform = (): Transform => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0, anchorY: 0 });

export function newDocument(patch: Partial<Omit<VectorDocument, 'version'>> = {}): VectorDocument {
  return {
    version: DOCUMENT_VERSION,
    viewBox: { x: 0, y: 0, width: 1920, height: 1080 },
    duration: 4,
    fps: 30,
    fit: 'contain',
    nodes: [],
    params: [],
    ...patch,
  };
}

/**
 * A shape with the defaults of its kind at the origin, for the drawing tools and the edits to start from. A text and a line take the part's accent
 * colour, which shows on the dark frame of a piece and on the light artboard of the studio alike (white would vanish on the artboard).
 */
export function newShape(kind: DrawnKind, id: string, name: string, patch: Partial<DrawnNodeOf> = {}): DrawnNodeOf {
  const base = { id, name, visible: true, locked: false, transform: identityTransform(), opacity: 1, tracks: {}, children: [] as Node[] };
  const own: Record<DrawnKind, DrawnNodeOf> = {
    rect: { ...base, kind: 'rect', width: 200, height: 120, rx: 0, fill: { kind: 'color', value: '#ffd166' }, stroke: { kind: 'none' }, strokeWidth: 0 },
    ellipse: { ...base, kind: 'ellipse', width: 160, height: 160, fill: { kind: 'color', value: '#ffd166' }, stroke: { kind: 'none' }, strokeWidth: 0 },
    line: { ...base, kind: 'line', x2: 200, y2: 0, fill: { kind: 'none' }, stroke: { kind: 'var', name: 'accent' }, strokeWidth: 4 },
    text: { ...base, kind: 'text', content: 'Text', font: 'display', fontSize: 96, fontWeight: 700, align: 'start', fill: { kind: 'var', name: 'accent' }, stroke: { kind: 'none' }, strokeWidth: 0 },
    image: { ...base, kind: 'image', source: '', width: 400, height: 300, preserve: 'contain' },
  };
  return { ...own[kind], ...patch } as DrawnNodeOf;
}

/** A group with nothing in it and nothing animated. */
export function newGroup(id: string, name: string, children: Node[] = []): GroupNode {
  return { id, name, kind: 'group', visible: true, locked: false, transform: identityTransform(), opacity: 1, tracks: {}, children };
}

/** The ids of every node of a list, at any depth. */
export function allIds(nodes: readonly Node[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    ids.push(...allIds(node.children));
  }
  return ids;
}

/** An id nobody in the document has: `<prefix>-1`, `<prefix>-2`, … */
export function newId(doc: Pick<VectorDocument, 'nodes'>, prefix = 'n'): string {
  const taken = new Set(allIds(doc.nodes));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
