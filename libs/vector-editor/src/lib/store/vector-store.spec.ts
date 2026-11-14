import { sampleDocument } from '../../testing/sample-document';
import { addParam, setOpacity, setTransform } from '../model/edits';
import { VectorModelError } from '../model/json';
import { findNode } from '../model/tree';
import { COALESCE_MS, VectorStore } from './vector-store';

const x = (store: VectorStore, id = 'tag') => findNode(store.doc().nodes, id)!.transform.x;

describe('VectorStore', () => {
  let clock = 0;
  const store = () => new VectorStore(sampleDocument(), () => clock);
  beforeEach(() => (clock = 1000));

  it('undoes and redoes: two edits undone and redo once applies the first again', () => {
    const s = store();
    s.apply((d) => setTransform(d, 'tag', { x: 10 }));
    s.apply((d) => setTransform(d, 'tag', { x: 20 }));
    s.undo();
    s.undo();
    expect(x(s)).toBe(0);
    s.redo();
    expect(x(s)).toBe(10);
    expect(s.canRedo()).toBe(true);
    expect(s.canUndo()).toBe(true);
  });

  it('makes a gesture one step however many updates it has, and an unmoved gesture none', () => {
    const s = store();
    s.begin();
    for (let i = 1; i <= 30; i++) s.update((d) => setTransform(d, 'tag', { x: i }));
    s.end();
    expect(s.past()).toHaveLength(1);
    s.undo();
    expect(x(s)).toBe(0);
    s.begin();
    s.update((d) => d);
    s.end();
    expect(s.past()).toHaveLength(0);
  });

  it('joins edits with the same label within 500 ms into one step, and not later ones', () => {
    const s = store();
    s.apply((d) => setOpacity(d, 'tag', 0.9), 'opacity');
    clock += COALESCE_MS - 1;
    s.apply((d) => setOpacity(d, 'tag', 0.8), 'opacity');
    expect(s.past()).toHaveLength(1);
    clock += COALESCE_MS + 1;
    s.apply((d) => setOpacity(d, 'tag', 0.7), 'opacity');
    expect(s.past()).toHaveLength(2);
  });

  it('does not make a step of an edit that changes nothing, and clears the redo of one that does', () => {
    const s = store();
    s.apply((d) => d);
    s.apply((d) => setTransform(d, 'tag', { x: 0 }));
    expect(s.canUndo()).toBe(false);
    s.apply((d) => setTransform(d, 'tag', { x: 5 }));
    s.undo();
    s.apply((d) => setTransform(d, 'tag', { x: 6 }));
    expect(s.canRedo()).toBe(false);
  });

  it('is dirty against the last saved document and clean again after markSaved or an undo', () => {
    const s = store();
    expect(s.dirty()).toBe(false);
    s.apply((d) => setTransform(d, 'tag', { x: 5 }));
    expect(s.dirty()).toBe(true);
    s.undo();
    expect(s.dirty()).toBe(false);
    s.apply((d) => setTransform(d, 'tag', { x: 5 }));
    s.markSaved();
    expect(s.dirty()).toBe(false);
  });

  it('keeps a refused edit’s reason and changes nothing', () => {
    const s = store();
    s.apply((d) => addParam(d, { name: 'brand', type: 'string', description: 'x', default: '#fff', target: { nodeId: 'wing-a', what: 'fill' } }));
    expect(s.problem()?.code).toBe('param-animated');
    expect(s.canUndo()).toBe(false);
    s.apply((d) => setTransform(d, 'tag', { x: 1 }));
    expect(s.problem()).toBeUndefined();
  });

  it('selects, adds, toggles and forgets the ids that are no longer in the document', () => {
    const s = store();
    s.select(['dot']);
    s.select(['tag'], true);
    expect(s.selection()).toEqual(['dot', 'tag']);
    s.toggleSelect('dot');
    expect(s.selection()).toEqual(['tag']);
    expect(s.selectedNodes().map((n) => n.name)).toEqual(['Tag']);
    s.doc.update((d) => ({ ...d, nodes: [{ ...d.nodes[0], children: [] }] }));
    expect(s.selection()).toEqual([]);
  });

  it('keeps one time for every panel: seek is clamped, play restarts at the end, step goes by frames', () => {
    const s = store();
    s.seek(99);
    expect(s.playhead()).toBe(4);
    s.play();
    expect(s.playhead()).toBe(0);
    expect(s.playing()).toBe(true);
    s.togglePlay();
    expect(s.playing()).toBe(false);
    s.step(3);
    expect(s.playhead()).toBeCloseTo(0.1, 6);
    s.step(-99);
    expect(s.playhead()).toBe(0);
  });

  it('opens a document: history, selection and playhead start over; a text that is not a document changes nothing', () => {
    const s = store();
    s.apply((d) => setTransform(d, 'tag', { x: 5 }));
    s.select(['tag']);
    s.seek(2);
    const json = s.toJson();
    s.load(sampleDocument());
    expect(s.canUndo()).toBe(false);
    expect(s.selection()).toEqual([]);
    expect(s.playhead()).toBe(0);
    s.loadJson(json);
    expect(x(s)).toBe(5);
    expect(() => s.loadJson('{')).toThrow(VectorModelError);
    expect(x(s)).toBe(5);
  });
});
