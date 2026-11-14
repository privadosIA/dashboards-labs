import { PULSE_DECAY, type BeatLink, type Beat, type Ease, type Keyframe, type LoudnessAt, type Node, type Paint, type Property, type Transform, type VectorDocument } from './document';

/**
 * The share of the way (0 to 1) a value has travelled after a share `p` of the time. These are the formulas of `easeShare` in
 * `@lab/animation-core/keyframes.ts` (and the server's); they are copied here because this library does not depend on the music domain,
 * and `runtime.spec.ts` pins the runtime's copy to this one.
 */
export function easeShare(ease: Ease | undefined, p: number): number {
  switch (ease) {
    case 'in':
      return p * p * p;
    case 'out':
      return 1 - Math.pow(1 - p, 3);
    case 'in-out':
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    default:
      return p;
  }
}

const HEX = /^#([0-9a-f]{6})$/i;

function mixColour(a: string, b: string, share: number): string {
  const x = HEX.exec(a)![1];
  const y = HEX.exec(b)![1];
  let out = '#';
  for (let i = 0; i < 6; i += 2) {
    const from = parseInt(x.slice(i, i + 2), 16);
    const to = parseInt(y.slice(i, i + 2), 16);
    out += Math.round(from + (to - from) * share).toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * The value of a track at second `t`: the first keyframe's before it, the last one's after it; between two, a number goes from the earlier
 * value to the later with the earlier keyframe's ease, a `#rrggbb` colour goes channel by channel, and anything else, and every value under
 * `step`, holds the earlier value. An empty track has no value.
 */
export function valueAt(track: readonly Keyframe[] | undefined, t: number): number | string | undefined {
  const n = track?.length ?? 0;
  if (!track || n === 0) return undefined;
  if (t <= track[0].t) return track[0].value;
  if (t >= track[n - 1].t) return track[n - 1].value;
  let i = 0;
  while (i < n - 1 && t >= track[i + 1].t) i++;
  const a = track[i];
  const b = track[i + 1];
  if (a.ease === 'step') return a.value;
  const share = easeShare(a.ease, (t - a.t) / (b.t - a.t));
  if (typeof a.value === 'number' && typeof b.value === 'number') return a.value + (b.value - a.value) * share;
  if (typeof a.value === 'string' && typeof b.value === 'string' && HEX.test(a.value) && HEX.test(b.value)) return mixColour(a.value, b.value, share);
  return a.value;
}

/** What a node looks like at one time. `opacity` and `visible` are the node's own (the browser multiplies them down the tree). */
export interface NodeState {
  transform: Transform;
  opacity: number;
  visible: boolean;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number | undefined;
  /** What only some kinds have, at this time: `width`, `height`, `rx` of a shape and `fontSize` of a text. */
  shape: { width?: number; height?: number; rx?: number; fontSize?: number };
  /** The opacity with the ancestors' multiplied in, and whether every ancestor is visible too: what the person actually sees. */
  effectiveOpacity: number;
  shown: boolean;
}

const num = (track: Keyframe[] | undefined, t: number, fallback: number): number => {
  const v = valueAt(track, t);
  return typeof v === 'number' ? v : fallback;
};

function paintAt(track: Keyframe[] | undefined, t: number, fallback: Paint | undefined): Paint {
  const v = valueAt(track, t);
  if (typeof v === 'string') return v === 'none' ? { kind: 'none' } : { kind: 'color', value: v };
  return fallback ?? { kind: 'keep' };
}

const SHAPE_KEYS = ['width', 'height', 'rx', 'fontSize'] as const;

function shapeAt(node: Node, t: number): NodeState['shape'] {
  const own = node as unknown as Record<string, unknown>;
  const out: NodeState['shape'] = {};
  for (const key of SHAPE_KEYS) if (typeof own[key] === 'number') out[key] = num(node.tracks[key], t, own[key] as number);
  return out;
}

/**
 * What a beat link does to a number: `pulse` adds `amount × (1 − position)^decay` once the first beat has struck, `alternate` takes the value of
 * the even or odd beat, `loudness` adds `amount` times the song's loudness at `t`. Nothing without a beat (or, for loudness, without a curve).
 */
export function linkedNumber(value: number, link: BeatLink | undefined, t: number, beat?: Beat | null, loudnessAt?: LoudnessAt): number {
  if (!link) return value;
  if (link.kind === 'loudness') return loudnessAt ? value + link.amount * Math.min(1, Math.max(0, loudnessAt(t) || 0)) : value;
  if (!beat || !(beat.number >= 0)) return value;
  if (link.kind === 'alternate') {
    const v = link.values[beat.number % 2];
    return typeof v === 'number' ? v : value;
  }
  const decay = Math.min(PULSE_DECAY.max, Math.max(PULSE_DECAY.min, link.decay || PULSE_DECAY.default));
  return value + link.amount * Math.pow(1 - Math.min(1, Math.max(0, beat.position)), decay);
}

/** The same for a paint: only `alternate` applies. */
export function linkedPaint(paint: Paint, link: BeatLink | undefined, beat?: Beat | null): Paint {
  if (!link || link.kind !== 'alternate' || !beat || !(beat.number >= 0)) return paint;
  const v = link.values[beat.number % 2];
  return typeof v === 'string' ? (v === 'none' ? { kind: 'none' } : { kind: 'color', value: v }) : paint;
}

/** The state of one node at `t`, without its ancestors. Beat links ride on what the tracks give; without a beat they do nothing. */
export function nodeStateAt(node: Node, t: number, beat?: Beat | null, loudnessAt?: LoudnessAt): Omit<NodeState, 'effectiveOpacity' | 'shown'> {
  const base = plainStateAt(node, t);
  const links = node.beat;
  if (!links) return base;
  const at = (property: Property, value: number): number => linkedNumber(value, links[property], t, beat, loudnessAt);
  const shape: NodeState['shape'] = { ...base.shape };
  for (const key of SHAPE_KEYS) if (shape[key] !== undefined) shape[key] = at(key, shape[key]!);
  return {
    transform: {
      ...base.transform,
      x: at('x', base.transform.x),
      y: at('y', base.transform.y),
      scaleX: at('scaleX', base.transform.scaleX),
      scaleY: at('scaleY', base.transform.scaleY),
      rotate: at('rotate', base.transform.rotate),
    },
    opacity: Math.min(1, Math.max(0, at('opacity', base.opacity))),
    visible: base.visible,
    fill: linkedPaint(base.fill, links.fill, beat),
    stroke: linkedPaint(base.stroke, links.stroke, beat),
    strokeWidth: base.strokeWidth === undefined && !links.strokeWidth ? undefined : at('strokeWidth', base.strokeWidth ?? 0),
    shape,
  };
}

function plainStateAt(node: Node, t: number): Omit<NodeState, 'effectiveOpacity' | 'shown'> {
  const tr = node.transform;
  const k = node.tracks;
  return {
    transform: {
      x: num(k.x, t, tr.x),
      y: num(k.y, t, tr.y),
      scaleX: num(k.scaleX, t, tr.scaleX),
      scaleY: num(k.scaleY, t, tr.scaleY),
      rotate: num(k.rotate, t, tr.rotate),
      anchorX: tr.anchorX,
      anchorY: tr.anchorY,
    },
    opacity: Math.min(1, Math.max(0, num(k.opacity, t, node.opacity))),
    visible: node.visible,
    fill: paintAt(k.fill, t, node.fill),
    stroke: paintAt(k.stroke, t, node.stroke),
    strokeWidth: valueAt(k.strokeWidth, t) === undefined ? node.strokeWidth : num(k.strokeWidth, t, node.strokeWidth ?? 0),
    shape: shapeAt(node, t),
  };
}

/** Every node's state at `t`, by id, with opacity and visibility cascaded from its ancestors. */
export function stateAt(doc: Pick<VectorDocument, 'nodes'>, t: number, beat?: Beat | null, loudnessAt?: LoudnessAt): Map<string, NodeState> {
  const out = new Map<string, NodeState>();
  const visit = (nodes: readonly Node[], opacity: number, shown: boolean): void => {
    for (const node of nodes) {
      const own = nodeStateAt(node, t, beat, loudnessAt);
      const state: NodeState = { ...own, effectiveOpacity: opacity * own.opacity, shown: shown && own.visible };
      out.set(node.id, state);
      visit(node.children, state.effectiveOpacity, state.shown);
    }
  };
  visit(doc.nodes, 1, true);
  return out;
}

/** The static value of a property of a node, before any track. */
export function staticValue(node: Node, property: Property): number | string | undefined {
  switch (property) {
    case 'fill':
    case 'stroke': {
      const paint = node[property];
      return paint?.kind === 'color' ? paint.value : paint?.kind === 'none' ? 'none' : undefined;
    }
    case 'opacity':
      return node.opacity;
    case 'strokeWidth':
      return node.strokeWidth;
    case 'width':
    case 'height':
    case 'rx':
    case 'fontSize':
      return property in node ? (node as unknown as Record<string, number>)[property] : undefined;
    default:
      return node.transform[property];
  }
}

/** The value a property shows at `t`: the track's, else the static one. Paints that are not a colour have none. */
export function propertyAt(node: Node, property: Property, t: number): number | string | undefined {
  return valueAt(node.tracks[property], t) ?? staticValue(node, property);
}
