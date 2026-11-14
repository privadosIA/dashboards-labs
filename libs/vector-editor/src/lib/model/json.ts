import { BEAT_KINDS, DOCUMENT_VERSION, DRAWN_KINDS, EASES, PROPERTIES, type Node, type Property, type VectorDocument } from './document';

/** A text that is not a vector document, with the reason in a sentence. */
export class VectorModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorModelError';
  }
}

/** The document as JSON text. Fields the editor does not know are kept: the document is written as it is held. */
export const toJson = (doc: VectorDocument): string => JSON.stringify(doc);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkTracks(node: Node, duration: number): void {
  for (const [property, frames] of Object.entries(node.tracks) as [Property, Node['tracks'][Property]][]) {
    const where = `node "${node.id}", property "${property}"`;
    if (!PROPERTIES.includes(property)) throw new VectorModelError(`${where}: not an animatable property`);
    if (!Array.isArray(frames)) throw new VectorModelError(`${where}: the track is not a list`);
    frames.forEach((frame, i) => {
      if (!isObject(frame) || typeof frame.t !== 'number' || !Number.isFinite(frame.t)) throw new VectorModelError(`${where}, keyframe ${i}: it has no time`);
      if (!EASES.includes(frame.ease)) throw new VectorModelError(`${where}, keyframe ${i}: unknown ease "${String(frame.ease)}"`);
      if (typeof frame.value !== 'number' && typeof frame.value !== 'string') throw new VectorModelError(`${where}, keyframe ${i}: it has no value`);
      if (frame.t < 0 || frame.t > duration) throw new VectorModelError(`${where}, keyframe ${i}: ${frame.t} s is outside 0 to ${duration} s`);
      if (i > 0 && frame.t < frames[i - 1].t) throw new VectorModelError(`${where}, keyframe ${i}: ${frame.t} s comes before keyframe ${i - 1} (${frames[i - 1].t} s)`);
    });
  }
}

function checkBeat(node: Node): void {
  if (node.beat === undefined) return;
  if (!isObject(node.beat)) throw new VectorModelError(`node "${node.id}": beat is not an object`);
  for (const [property, link] of Object.entries(node.beat)) {
    const where = `node "${node.id}", beat of "${property}"`;
    if (!PROPERTIES.includes(property as never)) throw new VectorModelError(`${where}: not an animatable property`);
    if (!isObject(link) || !BEAT_KINDS.includes(link['kind'] as never)) throw new VectorModelError(`${where}: unknown kind "${String(isObject(link) ? link['kind'] : link)}"`);
  }
}

function checkNodes(nodes: unknown, duration: number, seen: Set<string>): void {
  if (!Array.isArray(nodes)) throw new VectorModelError('nodes is not a list');
  for (const raw of nodes) {
    if (!isObject(raw) || typeof raw['id'] !== 'string' || raw['id'] === '') throw new VectorModelError('a node has no id');
    const node = raw as unknown as Node;
    if (seen.has(node.id)) throw new VectorModelError(`node "${node.id}": the id is used twice`);
    seen.add(node.id);
    const kind: unknown = raw['kind'];
    if (kind !== 'group' && kind !== 'import' && !DRAWN_KINDS.includes(kind as never)) throw new VectorModelError(`node "${node.id}": unknown kind "${String(kind)}"`);
    if (!isObject(node.transform)) throw new VectorModelError(`node "${node.id}": it has no transform`);
    if (!isObject(node.tracks)) throw new VectorModelError(`node "${node.id}": it has no tracks`);
    checkTracks(node, duration);
    checkBeat(node);
    checkNodes(node.children ?? [], duration, seen);
  }
}

/** Reads a document from its JSON (text or already parsed), refusing what cannot be drawn: a newer version, keyframes out of order. */
export function fromJson(input: string | unknown): VectorDocument {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (e) {
      throw new VectorModelError(`it is not JSON: ${(e as Error).message}`);
    }
  }
  if (!isObject(value)) throw new VectorModelError('it is not a vector document');
  if (typeof value['version'] !== 'number') throw new VectorModelError('it has no version');
  if (value['version'] > DOCUMENT_VERSION) throw new VectorModelError(`it is from a newer version of the editor (version ${value['version']})`);
  if (value['version'] !== DOCUMENT_VERSION) throw new VectorModelError(`unknown version ${value['version']}`);
  const box = value['viewBox'];
  if (!isObject(box) || !['x', 'y', 'width', 'height'].every((k) => typeof box[k] === 'number')) throw new VectorModelError('it has no viewBox');
  if (typeof value['duration'] !== 'number' || !(value['duration'] > 0)) throw new VectorModelError('it has no duration');
  if (!Array.isArray(value['params'])) throw new VectorModelError('params is not a list');
  checkNodes(value['nodes'], value['duration'], new Set());
  return value as unknown as VectorDocument;
}
