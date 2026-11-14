import type { Node } from '../model/document';
import { moveInto, pathTo, siblingsOf } from '../model/tree';

export type DropZone = 'before' | 'after' | 'into';

export interface Row {
  id: string;
  name: string;
  depth: number;
  kind: Node['kind'];
  visible: boolean;
  locked: boolean;
  hasChildren: boolean;
  /** Whether it can be dragged: what is inside an import mirrors the import's markup, whose order is fixed. */
  movable: boolean;
  /** Whether other nodes can be dropped into it. */
  accepts: boolean;
  /** An element at the last selectable level, under which there may be more that move with it. */
  atLimit: boolean;
}

/** The depth (of an import's children) after which the elements are not picked one by one. */
export const LAST_LEVEL = 6;

/** The nodes as rows, in drawing order, without the children of the collapsed ones. */
export function rowsOf(nodes: readonly Node[], collapsed: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const visit = (list: readonly Node[], depth: number, inImport: number): void => {
    for (const node of list) {
      rows.push({
        id: node.id,
        name: node.name,
        depth,
        kind: node.kind,
        visible: node.visible,
        locked: node.locked,
        hasChildren: node.children.length > 0,
        movable: inImport === 0,
        accepts: node.kind === 'group',
        atLimit: inImport === LAST_LEVEL && node.kind === 'import' && node.tag === 'g',
      });
      if (!collapsed.has(node.id)) visit(node.children, depth + 1, node.kind === 'import' && node.source ? 1 : inImport > 0 ? inImport + 1 : 0);
    }
  };
  visit(nodes, 0, 0);
  return rows;
}

/** Which part of a row a pointer is over: the top quarter is before it, the bottom quarter after it, the middle into it (a group only). */
export function zoneOf(share: number, accepts: boolean): DropZone {
  if (!accepts) return share < 0.5 ? 'before' : 'after';
  return share < 0.25 ? 'before' : share > 0.75 ? 'after' : 'into';
}

/** The tree after dropping `id` on `target` in a zone; the same tree when the drop makes no sense (onto itself, into its own descendant). */
export function dropNode(nodes: readonly Node[], id: string, target: string, zone: DropZone): Node[] {
  if (id === target) return nodes as Node[];
  if (zone === 'into') {
    const group = siblingsOf(nodes, target)?.find((n) => n.id === target);
    return moveInto(nodes, id, target, group ? group.children.length : 0);
  }
  const path = pathTo(nodes, target)!;
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const siblings = (parent ? siblingsOf(nodes, target)! : nodes).filter((n) => n.id !== id);
  const at = siblings.findIndex((n) => n.id === target) + (zone === 'after' ? 1 : 0);
  return moveInto(nodes, id, parent, at);
}
