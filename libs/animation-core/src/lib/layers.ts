import { EASES, MAX_LAYERS, MAX_LAYER_ITEMS, MAX_PAGE_PARTS, FEATURE_LAYERS, type Animate, type Catalog, type Layer, type LayerItem, type Part, type PartParam, type Script, type ScriptPiece } from './model';

/** Whether the catalog says the server's scripts take layers. */
export const hasLayersFeature = (catalog: Pick<Catalog, 'features'> | null | undefined): boolean => !!catalog?.features?.includes(FEATURE_LAYERS);

/** The server's tolerance when it compares times of a script. */
const TOLERANCE = 0.01;

/** Why a value is not one the parameter takes, as the end of a sentence; empty when it is. */
export function valueProblem(q: PartParam, value: unknown): string {
  switch (q.type) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'is not a whole number';
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'is not a number';
      break;
    case 'string':
      if (typeof value !== 'string') return 'is not a text';
      return q.maxLength !== undefined && value.length > q.maxLength ? `is longer than ${q.maxLength} characters` : '';
    case 'bool':
      return typeof value === 'boolean' ? '' : 'is not true or false';
    case 'enum':
      return typeof value === 'string' && (q.options ?? []).includes(value) ? '' : `is not one of ${(q.options ?? []).join(', ')}`;
  }
  const n = value as number;
  if (q.min !== undefined && n < q.min) return `is below ${q.min}`;
  if (q.max !== undefined && n > q.max) return `is above ${q.max}`;
  return '';
}

/**
 * What is wrong with the keyframes of one part (of a piece, of an extra or of a layer item), in the words the server uses, with `prefix` naming
 * where it is (`piece p1`, `layer "strip" item #2`); empty when they are fine: the parameter exists and may animate, it has a keyframe, each `t`
 * is inside `length` and after the one before, the ease is known and the value is one the parameter takes.
 */
export function keyframeProblem(prefix: string, part: Part, animate: Animate | undefined, length: number): string {
  if (!animate) return '';
  for (const name of Object.keys(animate).sort()) {
    const q = part.params.find((x) => x.name === name);
    if (!q) return `${prefix}: the part "${part.name}" has no parameter "${name}"`;
    if (!q.animatable) return `${prefix}: the parameter "${name}" of "${part.name}" cannot be animated`;
    const list = animate[name];
    if (list.length === 0) return `${prefix}: the animation of "${name}" has no keyframe`;
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      if (k.t < 0 || k.t > length + TOLERANCE) return `${prefix}: keyframe #${i + 1} of "${name}" is at ${k.t.toFixed(2)} s, outside the piece (0 s to ${length.toFixed(2)} s)`;
      if (i > 0 && k.t <= list[i - 1].t) return `${prefix}: keyframe #${i + 1} of "${name}" is not after the one before it (${list[i - 1].t.toFixed(2)} s)`;
      if (k.ease !== undefined && !(EASES as readonly string[]).includes(k.ease)) return `${prefix}: keyframe #${i + 1} of "${name}" has the ease "${k.ease}"; use ${EASES.join(', ')}`;
      const bad = valueProblem(q, k.value);
      if (bad) return `${prefix}: keyframe #${i + 1} of "${name}" ${bad}`;
    }
  }
  return '';
}

/** Whether an item shows in a piece: they share more than a rounding. */
export const touches = (item: Pick<LayerItem, 'start' | 'end'>, piece: Pick<ScriptPiece, 'start' | 'end'>): boolean => item.start < piece.end - TOLERANCE && item.end > piece.start + TOLERANCE;

/** A problem the server would find in the layers of a script, with where it is. */
export interface LayerProblem {
  readonly text: string;
  readonly layer?: string;
  /** The place of the item in its layer, from 0. */
  readonly item?: number;
  readonly piece?: string;
}

const LAYER_ID = /^[a-z0-9-]{1,24}$/;
const layerName = (l: Pick<Layer, 'id'>): string => `layer "${l.id}"`;

/** The parts the page of piece `i` draws: its main part, its extras and the items of the layers that touch it, in drawing order. */
export function pageParts(script: Script, i: number): string[] {
  const p = script.pieces[i];
  if (!p) return [];
  const out = [p.part, ...(p.with ?? []).map((w) => w.part)];
  for (const l of script.layers ?? []) for (const it of l.items) if (touches(it, p)) out.push(it.part);
  return out;
}

/**
 * Every problem the server would refuse in the layers of a script, in the order it checks them and in its words: first each layer (its id, its
 * size, each item: part, parameters, range, overlap, keyframes), then each piece's page (a part drawn twice, more than the most parts). The editor
 * never makes one of these and marks one it is given; the server's answer wins.
 */
export function layerProblems(script: Script, catalog: Pick<Catalog, 'parts'>): LayerProblem[] {
  const layers = script.layers ?? [];
  if (layers.length === 0 || script.pieces.length === 0) return [];
  const out: LayerProblem[] = [];
  if (layers.length > MAX_LAYERS) out.push({ text: `a script may have up to ${MAX_LAYERS} layers, it has ${layers.length}` });
  const end = script.pieces[script.pieces.length - 1].end;
  const ids = new Set<string>();
  for (const l of layers) {
    if (!LAYER_ID.test(l.id)) out.push({ layer: l.id, text: `${layerName(l)}: the id must be lower case letters, digits and dashes, up to 24 characters` });
    if (ids.has(l.id)) out.push({ layer: l.id, text: `${layerName(l)}: the id is repeated` });
    ids.add(l.id);
    if (l.items.length > MAX_LAYER_ITEMS) out.push({ layer: l.id, text: `${layerName(l)}: a layer may have up to ${MAX_LAYER_ITEMS} items, it has ${l.items.length}` });
    l.items.forEach((it, i) => {
      const n = `${layerName(l)} item #${i + 1}`;
      const at = { layer: l.id, item: i };
      const part = catalog.parts.find((p) => p.name === it.part);
      if (!part) return void out.push({ ...at, text: `${n}: the part "${it.part}" is not in the catalog` });
      for (const [name, value] of Object.entries(it.params ?? {})) {
        const q = part.params.find((x) => x.name === name);
        if (!q) {
          out.push({ ...at, text: `${n}: part ${part.name} has no parameter "${name}"` });
          continue;
        }
        const bad = valueProblem(q, value);
        if (bad) out.push({ ...at, text: `${n}: parameter ${name} ${bad}` });
      }
      if (it.end <= it.start) out.push({ ...at, text: `${n} ends before it starts (${it.start.toFixed(2)} s to ${it.end.toFixed(2)} s)` });
      else if (it.start < -TOLERANCE || it.end > end + TOLERANCE) out.push({ ...at, text: `${n} (${it.start.toFixed(2)} s to ${it.end.toFixed(2)} s) is outside the song (0 s to ${end.toFixed(2)} s)` });
      if (i > 0 && it.start < l.items[i - 1].end - TOLERANCE) out.push({ ...at, text: `${n} overlaps item #${i} (items of a layer follow one another, in order)` });
      const moving = keyframeProblem(n, part, it.animate, it.end - it.start);
      if (moving) out.push({ ...at, text: moving });
    });
  }
  script.pieces.forEach((p, i) => {
    const name = `piece "${p.id}" (#${i + 1})`;
    const used = new Map<string, string>([[p.part, 'the main part']]);
    let count = 1;
    for (const w of p.with ?? []) {
      used.set(w.part, 'an extra part (with)');
      count++;
    }
    for (const l of layers) {
      l.items.forEach((it, k) => {
        if (!touches(it, p)) return;
        count++;
        const by = used.get(it.part);
        if (by !== undefined) out.push({ piece: p.id, layer: l.id, item: k, text: `${name}: the part "${it.part}" is drawn twice (${by} and ${layerName(l)} item #${k + 1})` });
        else used.set(it.part, `${layerName(l)} item #${k + 1}`);
      });
    }
    if (count > MAX_PAGE_PARTS) out.push({ piece: p.id, text: `${name}: its page would draw ${count} parts, the most is ${MAX_PAGE_PARTS}` });
  });
  return out;
}
