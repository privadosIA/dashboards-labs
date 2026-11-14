import type { Node, Property, VectorDocument } from './document';
import { SAME_MOMENT, removeKeyframe, setKeyframe, setOpacity, setPaint, setShape, setStrokeWidth, setText, setTransform } from './edits';
import { propertyAt } from './evaluate';
import { findNode } from './tree';

/** The index of the keyframe of a property at `t`, or -1. */
export function keyframeIndexAt(node: Node, property: Property, t: number): number {
  return node.tracks[property]?.findIndex((f) => Math.abs(f.t - t) < SAME_MOMENT) ?? -1;
}

/** Sets what a property has when no track says otherwise. */
export function setStatic(doc: VectorDocument, id: string, property: Property, value: number | string): VectorDocument {
  switch (property) {
    case 'opacity':
      return setOpacity(doc, id, Number(value));
    case 'strokeWidth':
      return setStrokeWidth(doc, id, Number(value));
    case 'fill':
    case 'stroke':
      return setPaint(doc, id, property, value === 'none' ? { kind: 'none' } : { kind: 'color', value: String(value) });
    case 'width':
    case 'height':
    case 'rx':
      return setShape(doc, id, { [property]: Number(value) });
    case 'fontSize':
      return setText(doc, id, { fontSize: Number(value) });
    default:
      return setTransform(doc, id, { [property]: Number(value) });
  }
}

/**
 * The rule of every gesture and every field: a property with a keyframe **at the playhead** has that keyframe changed; a property with
 * keyframes elsewhere gets one **added** at the playhead (auto-key); a property with none changes its static value.
 */
export function editProperty(doc: VectorDocument, id: string, property: Property, t: number, value: number | string): VectorDocument {
  const node = findNode(doc.nodes, id);
  if (node?.tracks[property]?.length) return setKeyframe(doc, id, property, t, value);
  return setStatic(doc, id, property, value);
}

/** What a keyframe made from nothing starts with: the value the property shows now, or something to start from when a paint has no colour. */
function startValue(node: Node, property: Property, t: number): number | string {
  const v = propertyAt(node, property, t);
  if (v !== undefined) return v;
  return property === 'fill' || property === 'stroke' ? '#808080' : property === 'strokeWidth' ? 1 : 0;
}

/** The diamond beside a property: a keyframe at the playhead with the value shown now, or the one there removed. */
export function toggleKeyframe(doc: VectorDocument, id: string, property: Property, t: number): VectorDocument {
  const node = findNode(doc.nodes, id);
  if (!node) return doc;
  const index = keyframeIndexAt(node, property, t);
  return index >= 0 ? removeKeyframe(doc, id, property, index) : setKeyframe(doc, id, property, t, startValue(node, property, t));
}
