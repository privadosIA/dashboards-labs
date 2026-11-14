import type { Node, Transform } from './document';

/** The node with this id at any depth. */
export function findNode(nodes: readonly Node[], id: string): Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inside = findNode(node.children, id);
    if (inside) return inside;
  }
  return undefined;
}

/** The ids from the top of the tree down to the node (included), or nothing when it is not there. */
export function pathTo(nodes: readonly Node[], id: string): string[] | undefined {
  for (const node of nodes) {
    if (node.id === id) return [node.id];
    const inside = pathTo(node.children, id);
    if (inside) return [node.id, ...inside];
  }
  return undefined;
}

/** Every node, parents before their children, in drawing order. */
export function* walk(nodes: readonly Node[]): Generator<Node> {
  for (const node of nodes) {
    yield node;
    yield* walk(node.children);
  }
}

/** The list with the node changed by `fn`; the rest is shared, not copied. */
export function mapNode(nodes: readonly Node[], id: string, fn: (node: Node) => Node): Node[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return fn(node);
    }
    const children = mapNode(node.children, id, fn);
    if (children.every((c, i) => c === node.children[i])) return node;
    changed = true;
    return { ...node, children } as Node;
  });
  return changed ? next : (nodes as Node[]);
}

function without(nodes: readonly Node[], id: string): { rest: Node[]; removed?: Node } {
  let removed: Node | undefined;
  const rest: Node[] = [];
  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    const inside = without(node.children, id);
    if (inside.removed) {
      removed = inside.removed;
      rest.push({ ...node, children: inside.rest } as Node);
    } else rest.push(node);
  }
  return { rest, removed };
}

export function removeNode(nodes: readonly Node[], id: string): Node[] {
  return without(nodes, id).rest;
}

/** The siblings of a node: the list that holds it. */
export function siblingsOf(nodes: readonly Node[], id: string): readonly Node[] | undefined {
  if (nodes.some((n) => n.id === id)) return nodes;
  for (const node of nodes) {
    const inside = siblingsOf(node.children, id);
    if (inside) return inside;
  }
  return undefined;
}

function insertAt(list: readonly Node[], at: number, node: Node): Node[] {
  const index = Math.max(0, Math.min(at, list.length));
  return [...list.slice(0, index), node, ...list.slice(index)];
}

/** Puts the node at position `to` (0 draws first, at the back) among its siblings. */
export function reorder(nodes: readonly Node[], id: string, to: number): Node[] {
  const siblings = siblingsOf(nodes, id);
  if (!siblings) return nodes as Node[];
  const from = siblings.findIndex((n) => n.id === id);
  const target = Math.max(0, Math.min(to, siblings.length - 1));
  if (from === target) return nodes as Node[];
  const parent = pathTo(nodes, id)!.slice(-2, -1)[0];
  const move = (list: readonly Node[]): Node[] => {
    const rest = list.filter((n) => n.id !== id);
    return insertAt(rest, target, list[from]);
  };
  return parent ? mapNode(nodes, parent, (p) => ({ ...p, children: move(p.children) }) as Node) : move(nodes);
}

/**
 * Moves a node into a group or an import (`parentId`) or to the top (`null`) at position `index`. A node cannot go inside itself or its own
 * descendants: the tree is left as it was.
 */
export function moveInto(nodes: readonly Node[], id: string, parentId: string | null, index: number): Node[] {
  const moving = findNode(nodes, id);
  if (!moving) return nodes as Node[];
  if (parentId !== null) {
    if (pathTo([moving], parentId)) return nodes as Node[];
    if (!findNode(nodes, parentId)) return nodes as Node[];
  }
  const { rest, removed } = without(nodes, id);
  if (!removed) return nodes as Node[];
  if (parentId === null) return insertAt(rest, index, removed);
  return mapNode(rest, parentId, (p) => ({ ...p, children: insertAt(p.children, index, removed) }) as Node);
}

/** A 2D affine matrix as the SVG writes it: `[a b c d e f]`, a point goes to `(a·x + c·y + e, b·x + d·y + f)`. */
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The matrix of a node's own transform, in the order the runtime writes it: translate, anchor, rotate, scale, minus anchor. */
export function matrixOf(t: Transform): Matrix {
  const r = (t.rotate * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const linear: Matrix = [cos * t.scaleX, sin * t.scaleX, -sin * t.scaleY, cos * t.scaleY, 0, 0];
  return multiply(multiply([1, 0, 0, 1, t.x + t.anchorX, t.y + t.anchorY], linear), [1, 0, 0, 1, -t.anchorX, -t.anchorY]);
}

/** The transform of every ancestor of the node and its own, multiplied: where the node stands in the artboard (static values only). */
export function worldTransform(nodes: readonly Node[], id: string): Matrix {
  const path = pathTo(nodes, id) ?? [];
  let m = IDENTITY;
  let level: readonly Node[] = nodes;
  for (const step of path) {
    const node = level.find((n) => n.id === step)!;
    m = multiply(m, matrixOf(node.transform));
    level = node.children;
  }
  return m;
}

/**
 * The transform a child must have to stand where it stood once its group is gone: the group's matrix composed into the child's, written
 * back as translate/rotate/scale around the child's anchor. A shear (non-uniform scale over a rotation) cannot be written and is dropped.
 */
export function compose(parent: Transform, child: Transform): Transform {
  const m = multiply(matrixOf(parent), matrixOf(child));
  const scaleX = Math.hypot(m[0], m[1]);
  const det = m[0] * m[3] - m[1] * m[2];
  const scaleY = scaleX === 0 ? 0 : det / scaleX;
  const rotate = scaleX === 0 ? 0 : (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const { anchorX: ax, anchorY: ay } = child;
  const lx = m[0] * ax + m[2] * ay;
  const ly = m[1] * ax + m[3] * ay;
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  return { x: round(m[4] - ax + lx - 0), y: round(m[5] - ay + ly), scaleX: round(scaleX), scaleY: round(scaleY), rotate: round(rotate), anchorX: ax, anchorY: ay };
}
