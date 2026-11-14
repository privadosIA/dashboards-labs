import { PARAM_NAME, newGroup, type BeatLink, type DrawnNodeOf, type Ease, type Keyframe, type Node, type Paint, type Param, type Property, type Transform, type VectorDocument } from './document';
import { compose, findNode, mapNode, moveInto, pathTo, removeNode, reorder, siblingsOf, walk } from './tree';

/** Why an edit was refused: a `code` the interface speaks for, and the reason in English. */
export type EditProblem = 'no-node' | 'track-parametrised' | 'param-animated' | 'param-name' | 'param-duplicate' | 'param-target' | 'no-keyframe' | 'group-animated' | 'not-a-shape' | 'beat-kind';

export class VectorEditError extends Error {
  constructor(
    readonly code: EditProblem,
    message: string,
  ) {
    super(message);
    this.name = 'VectorEditError';
  }
}

/** Two keyframes closer than this are the same moment. */
export const SAME_MOMENT = 0.001;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function edit(doc: VectorDocument, id: string, fn: (node: Node) => Node): VectorDocument {
  if (!findNode(doc.nodes, id)) throw new VectorEditError('no-node', `there is no node "${id}"`);
  return { ...doc, nodes: mapNode(doc.nodes, id, fn) };
}

/** Whether a parameter takes the place of a property of a node (a parametrised fill or stroke has no track). */
export function isParametrised(doc: Pick<VectorDocument, 'params'>, id: string, property: Property): boolean {
  return doc.params.some((p) => p.target.nodeId === id && (p.target.what as string) === property);
}

/** Changes the static value of the transform (`x`, `y`, `scaleX`, `scaleY`, `rotate`, `anchorX`, `anchorY`): what shows where no keyframe says otherwise. */
export const setTransform = (doc: VectorDocument, id: string, patch: Partial<Transform>): VectorDocument =>
  edit(doc, id, (n) => ({ ...n, transform: { ...n.transform, ...patch } }));

export function setPaint(doc: VectorDocument, id: string, which: 'fill' | 'stroke', paint: Paint): VectorDocument {
  if (isParametrised(doc, id, which)) throw new VectorEditError('track-parametrised', `the ${which} of "${id}" is a parameter`);
  return edit(doc, id, (n) => ({ ...n, [which]: paint }));
}

export const setOpacity = (doc: VectorDocument, id: string, opacity: number): VectorDocument =>
  edit(doc, id, (n) => ({ ...n, opacity: Math.min(1, Math.max(0, opacity)) }));

export const setStrokeWidth = (doc: VectorDocument, id: string, width: number): VectorDocument =>
  edit(doc, id, (n) => ({ ...n, strokeWidth: Math.max(0, width) }));

function withTrack(doc: VectorDocument, id: string, property: Property, fn: (frames: Keyframe[]) => Keyframe[]): VectorDocument {
  return edit(doc, id, (n) => {
    const frames = fn([...(n.tracks[property] ?? [])]);
    const tracks = { ...n.tracks };
    if (frames.length) tracks[property] = frames;
    else delete tracks[property];
    return { ...n, tracks };
  });
}

/** Adds a keyframe at `t`, or replaces the one already there (keeping its ease unless one is given). A parametrised paint cannot be animated. */
export function setKeyframe(doc: VectorDocument, id: string, property: Property, t: number, value: number | string, ease?: Ease): VectorDocument {
  if (isParametrised(doc, id, property)) throw new VectorEditError('param-animated', `the ${property} of "${id}" is a parameter, so it cannot have keyframes`);
  const at = Math.min(doc.duration, Math.max(0, round3(t)));
  return withTrack(doc, id, property, (frames) => {
    const i = frames.findIndex((f) => Math.abs(f.t - at) < SAME_MOMENT);
    if (i >= 0) frames[i] = { t: frames[i].t, value, ease: ease ?? frames[i].ease };
    else {
      frames.push({ t: at, value, ease: ease ?? 'linear' });
      frames.sort((a, b) => a.t - b.t);
    }
    return frames;
  });
}

/** Moves keyframe `index` to `t` (clamped to the document). It stays where it was if another keyframe is already at that moment. */
export function moveKeyframe(doc: VectorDocument, id: string, property: Property, index: number, t: number): VectorDocument {
  const at = Math.min(doc.duration, Math.max(0, round3(t)));
  const node = findNode(doc.nodes, id);
  const frame = node?.tracks[property]?.[index];
  if (!frame) throw new VectorEditError('no-keyframe', `"${id}" has no keyframe ${index} of ${property}`);
  if (node!.tracks[property]!.some((f, i) => i !== index && Math.abs(f.t - at) < SAME_MOMENT)) return doc;
  return withTrack(doc, id, property, (frames) => {
    frames[index] = { ...frame, t: at };
    return frames.sort((a, b) => a.t - b.t);
  });
}

export function removeKeyframe(doc: VectorDocument, id: string, property: Property, index: number): VectorDocument {
  if (!findNode(doc.nodes, id)?.tracks[property]?.[index]) throw new VectorEditError('no-keyframe', `"${id}" has no keyframe ${index} of ${property}`);
  return withTrack(doc, id, property, (frames) => frames.filter((_, i) => i !== index));
}

export function setEase(doc: VectorDocument, id: string, property: Property, index: number, ease: Ease): VectorDocument {
  if (!findNode(doc.nodes, id)?.tracks[property]?.[index]) throw new VectorEditError('no-keyframe', `"${id}" has no keyframe ${index} of ${property}`);
  return withTrack(doc, id, property, (frames) => frames.map((f, i) => (i === index ? { ...f, ease } : f)));
}

export const rename = (doc: VectorDocument, id: string, name: string): VectorDocument => edit(doc, id, (n) => ({ ...n, name }));
export const setVisible = (doc: VectorDocument, id: string, visible: boolean): VectorDocument => edit(doc, id, (n) => ({ ...n, visible }));
export const setLocked = (doc: VectorDocument, id: string, locked: boolean): VectorDocument => edit(doc, id, (n) => ({ ...n, locked }));

/** Makes a text or a paint a parameter of the part. The name, the target and the exclusion with tracks are checked here. */
export function addParam(doc: VectorDocument, param: Param): VectorDocument {
  if (!PARAM_NAME.test(param.name)) throw new VectorEditError('param-name', `"${param.name}" is not a name: lower case letters, digits and _, starting with a letter`);
  if (doc.params.some((p) => p.name === param.name)) throw new VectorEditError('param-duplicate', `there is already a parameter "${param.name}"`);
  const node = findNode(doc.nodes, param.target.nodeId);
  if (!node) throw new VectorEditError('param-target', `there is no node "${param.target.nodeId}"`);
  const { what } = param.target;
  const isText = node.kind === 'text' || (node.kind === 'import' && node.tag === 'text');
  if (what === 'text' && !isText) throw new VectorEditError('param-target', `"${node.name}" is not a text`);
  if (what === 'fontSize' && node.kind !== 'text') throw new VectorEditError('param-target', `"${node.name}" is not a text`);
  if ((what === 'width' || what === 'height') && node.kind !== 'rect' && node.kind !== 'ellipse' && node.kind !== 'image') {
    throw new VectorEditError('param-target', `"${node.name}" has no ${what}`);
  }
  if (what !== 'text' && node.tracks[what]?.length) throw new VectorEditError('param-animated', `the ${what} of "${node.name}" is animated`);
  if (doc.params.some((p) => p.target.nodeId === param.target.nodeId && p.target.what === what)) {
    throw new VectorEditError('param-duplicate', `the ${what} of "${node.name}" is already a parameter`);
  }
  return { ...doc, params: [...doc.params, param] };
}

export const removeParam = (doc: VectorDocument, name: string): VectorDocument => ({ ...doc, params: doc.params.filter((p) => p.name !== name) });

/** Adds a drawn node at the end of `parentId`'s children (or of the root), so it draws on top. */
export function addNode(doc: VectorDocument, node: Node, parentId: string | null = null, index?: number): VectorDocument {
  if (parentId !== null && !findNode(doc.nodes, parentId)) throw new VectorEditError('no-node', `there is no node "${parentId}"`);
  const at = index ?? (parentId === null ? doc.nodes.length : findNode(doc.nodes, parentId)!.children.length);
  return { ...doc, nodes: moveInto([...doc.nodes, node], node.id, parentId, at) };
}

/** Changes what a shape is made of (`width`, `height`, `rx`, `x2`, `y2`, `preserve`, `source`); only the fields its kind has are taken. */
export function setShape(doc: VectorDocument, id: string, patch: Partial<Record<'width' | 'height' | 'rx' | 'x2' | 'y2' | 'preserve' | 'source', number | string>>): VectorDocument {
  return edit(doc, id, (n) => {
    if (n.kind === 'group' || n.kind === 'import' || n.kind === 'text') throw new VectorEditError('not-a-shape', `"${n.name}" is not a shape`);
    const next: Record<string, unknown> = { ...n };
    for (const [key, value] of Object.entries(patch)) {
      if (key in n) next[key] = typeof value === 'number' && key !== 'x2' && key !== 'y2' ? Math.max(0, value) : value;
    }
    return next as unknown as Node;
  });
}

/** Changes a text node: its words and its style. */
export function setText(doc: VectorDocument, id: string, patch: Partial<Pick<Extract<DrawnNodeOf, { kind: 'text' }>, 'content' | 'font' | 'fontSize' | 'fontWeight' | 'align'>>): VectorDocument {
  return edit(doc, id, (n) => {
    if (n.kind !== 'text') throw new VectorEditError('not-a-shape', `"${n.name}" is not a text`);
    return { ...n, ...patch, ...(patch.fontSize !== undefined ? { fontSize: Math.max(1, patch.fontSize) } : {}) };
  });
}

/** A copy of the nodes with new ids (`<id>-copy`, `-copy-2`…), names ending in "copy" and the tracks copied; ids already in `taken` are avoided. */
function cloneNodes(nodes: readonly Node[], taken: Set<string>): Node[] {
  return nodes.map((n) => {
    let id = `${n.id}-copy`;
    for (let k = 2; taken.has(id); k++) id = `${n.id}-copy-${k}`;
    taken.add(id);
    return { ...JSON.parse(JSON.stringify({ ...n, children: [] })), id, name: `${n.name} copy`, children: cloneNodes(n.children, taken) } as Node;
  });
}

/** Duplicates the nodes right above themselves; returns the document and the ids of the copies. An import's children cannot be duplicated alone. */
export function duplicate(doc: VectorDocument, ids: readonly string[]): { doc: VectorDocument; ids: string[] } {
  const taken = new Set<string>();
  for (const n of walk(doc.nodes)) taken.add(n.id);
  let nodes = doc.nodes;
  const made: string[] = [];
  for (const id of ids) {
    const source = findNode(nodes, id);
    if (!source) throw new VectorEditError('no-node', `there is no node "${id}"`);
    const [copy] = cloneNodes([source], taken);
    const parent = pathTo(nodes, id)!.slice(-2, -1)[0] ?? null;
    const at = siblingsOf(nodes, id)!.findIndex((n) => n.id === id) + 1;
    nodes = moveInto([...nodes, copy], copy.id, parent, at);
    made.push(copy.id);
  }
  return { doc: { ...doc, nodes }, ids: made };
}

/** Wraps the nodes in a new group at the place of the topmost of them (the group starts at identity, so nothing moves). */
export function group(doc: VectorDocument, ids: readonly string[], id: string, name = 'Group'): VectorDocument {
  const found = ids.filter((i) => findNode(doc.nodes, i));
  if (found.length === 0) throw new VectorEditError('no-node', 'there is nothing to group');
  // Same parent only: the first selected node's parent decides, the others are ignored when they live elsewhere.
  const parentOf = (i: string): string | null => pathTo(doc.nodes, i)!.slice(-2, -1)[0] ?? null;
  const parent = parentOf(found[0]);
  const same = found.filter((i) => parentOf(i) === parent);
  const siblings = parent === null ? doc.nodes : findNode(doc.nodes, parent)!.children;
  const order = same.map((i) => siblings.findIndex((n) => n.id === i)).sort((a, b) => a - b);
  const members = order.map((i) => siblings[i]);
  const g = newGroup(id, name, members);
  let nodes: Node[] = doc.nodes;
  for (const m of members) nodes = removeNode(nodes, m.id);
  // The members were all at or before the topmost one, so once they are out the group goes where that one was.
  nodes = moveInto([...nodes, g], g.id, parent, order[order.length - 1] - (order.length - 1));
  return { ...doc, nodes };
}

/** Takes the children out of a group, in its place, keeping where they stand. Refused while the group has tracks (its motion cannot be pushed into them). */
export function ungroup(doc: VectorDocument, id: string): VectorDocument {
  const g = findNode(doc.nodes, id);
  if (!g) throw new VectorEditError('no-node', `there is no node "${id}"`);
  if (g.kind !== 'group') throw new VectorEditError('not-a-shape', `"${g.name}" is not a group`);
  if (Object.values(g.tracks).some((frames) => frames?.length)) {
    throw new VectorEditError('group-animated', `"${g.name}" is animated: its motion cannot be passed on to what is inside, so it is not ungrouped`);
  }
  const parent = pathTo(doc.nodes, id)!.slice(-2, -1)[0] ?? null;
  const at = siblingsOf(doc.nodes, id)!.findIndex((n) => n.id === id);
  let nodes = doc.nodes;
  g.children.forEach((child, k) => {
    const moved = { ...child, transform: compose(g.transform, child.transform) } as Node;
    nodes = moveInto(mapNode(nodes, child.id, () => moved), child.id, parent, at + k + 1);
  });
  return { ...doc, nodes: removeNode(nodes, id) };
}

const arrange = (doc: VectorDocument, id: string, to: (index: number, last: number) => number): VectorDocument => {
  const siblings = siblingsOf(doc.nodes, id);
  if (!siblings) throw new VectorEditError('no-node', `there is no node "${id}"`);
  const from = siblings.findIndex((n) => n.id === id);
  return { ...doc, nodes: reorder(doc.nodes, id, to(from, siblings.length - 1)) };
};

export const sendBackward = (doc: VectorDocument, id: string): VectorDocument => arrange(doc, id, (i) => i - 1);
export const sendForward = (doc: VectorDocument, id: string): VectorDocument => arrange(doc, id, (i) => i + 1);
export const sendToBack = (doc: VectorDocument, id: string): VectorDocument => arrange(doc, id, () => 0);
export const sendToFront = (doc: VectorDocument, id: string): VectorDocument => arrange(doc, id, (_, last) => last);

/** Sets what a property does on the beat. A paint can only `alternate`, and an `alternate` of a number needs numbers (of a paint, colours). */
export function setBeatLink(doc: VectorDocument, id: string, property: Property, link: BeatLink): VectorDocument {
  const paint = property === 'fill' || property === 'stroke';
  if (paint && link.kind !== 'alternate') throw new VectorEditError('beat-kind', `a ${property} can only alternate between two colours on the beat`);
  if (link.kind === 'alternate' && link.values.some((v) => (typeof v === 'string') !== paint)) {
    throw new VectorEditError('beat-kind', paint ? 'alternate needs two colours' : 'alternate needs two numbers');
  }
  return edit(doc, id, (n) => ({ ...n, beat: { ...n.beat, [property]: link } }));
}

export function removeBeatLink(doc: VectorDocument, id: string, property: Property): VectorDocument {
  return edit(doc, id, (n) => {
    const beat = { ...n.beat };
    delete beat[property];
    const { beat: _gone, ...rest } = n;
    void _gone;
    return (Object.keys(beat).length ? { ...rest, beat } : rest) as Node;
  });
}
