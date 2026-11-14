import { newGroup, newId, allIds, type Node } from './document';
import { findNode, mapNode, moveInto, pathTo, reorder, removeNode, walk } from './tree';

const tree = (): Node[] => [newGroup('a', 'A', [newGroup('a1', 'A1'), newGroup('a2', 'A2')]), newGroup('b', 'B'), newGroup('c', 'C')];
const ids = (nodes: readonly Node[]): string[] => nodes.map((n) => n.id);

describe('the tree', () => {
  it('finds a node and its path at any depth, and walks parents before children', () => {
    expect(findNode(tree(), 'a2')?.name).toBe('A2');
    expect(pathTo(tree(), 'a2')).toEqual(['a', 'a2']);
    expect(pathTo(tree(), 'zz')).toBeUndefined();
    expect([...walk(tree())].map((n) => n.id)).toEqual(['a', 'a1', 'a2', 'b', 'c']);
  });

  it('changes one node and shares the rest', () => {
    const before = tree();
    const after = mapNode(before, 'a2', (n) => ({ ...n, name: 'new' }));
    expect(findNode(after, 'a2')?.name).toBe('new');
    expect(after[1]).toBe(before[1]);
    expect(mapNode(before, 'zz', (n) => n)).toBe(before);
  });

  it('reorders among siblings, at the top and inside a group', () => {
    expect(ids(reorder(tree(), 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(ids(findNode(reorder(tree(), 'a2', 0), 'a')!.children)).toEqual(['a2', 'a1']);
    expect(ids(reorder(tree(), 'a', 99))).toEqual(['b', 'c', 'a']);
  });

  it('moves a node into a group and out to the top, and never into itself', () => {
    const into = moveInto(tree(), 'b', 'a', 1);
    expect(ids(findNode(into, 'a')!.children)).toEqual(['a1', 'b', 'a2']);
    expect(ids(into)).toEqual(['a', 'c']);
    expect(ids(moveInto(tree(), 'a1', null, 0))).toEqual(['a1', 'a', 'b', 'c']);
    const same = tree();
    expect(moveInto(same, 'a', 'a1', 0)).toBe(same);
  });

  it('removes a node and finds a free id', () => {
    expect(allIds(removeNode(tree(), 'a1'))).toEqual(['a', 'a2', 'b', 'c']);
    expect(newId({ nodes: tree() }, 'a')).toBe('a-1');
    expect(newId({ nodes: [newGroup('a-1', 'x')] }, 'a')).toBe('a-2');
  });
});
