import type { Design, Script } from '@lab/animation-core';

import { COALESCE_MS, EditorStore, type Doc } from './editor-store';

const design: Design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'grotesk', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: '' };
const script = (label = 'a'): Script => ({ version: 1, pieces: [{ id: 'p1', start: 0, end: 10, part: 'toggle', params: { label } }] });
const doc = (label = 'a'): Doc => ({ design, script: script(label) });
const label = (d: Doc): string => String((d.script.pieces[0].params as { label: string }).label);
const typed = (s: EditorStore, text: string, name?: string) => s.apply((d) => ({ ...d, script: script(text) }), name);

function setup() {
  let now = 1000;
  const store = new EditorStore(doc('a'), () => now);
  return { store, tick: (ms: number) => (now += ms) };
}

describe('EditorStore', () => {
  it('starts clean, with nothing to undo', () => {
    const { store } = setup();
    expect(store.dirty()).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('is dirty after an edit and clean again when the edit is undone', () => {
    const { store } = setup();
    typed(store, 'b');
    expect(store.dirty()).toBe(true);
    expect(label(store.doc())).toBe('b');
    store.undo();
    expect(label(store.doc())).toBe('a');
    expect(store.dirty()).toBe(false);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(label(store.doc())).toBe('b');
  });

  it('is not dirty when an edit puts back what was saved, and an edit that changes nothing is no step', () => {
    const { store } = setup();
    typed(store, 'b');
    typed(store, 'a');
    expect(store.dirty()).toBe(false);
    const before = store.past().length;
    typed(store, 'a');
    expect(store.past().length).toBe(before);
  });

  it('clears redo with a new edit', () => {
    const { store } = setup();
    typed(store, 'b');
    store.undo();
    typed(store, 'c');
    expect(store.canRedo()).toBe(false);
  });

  it('makes a burst of typing in one field one step, and a pause or another field a new one', () => {
    const { store, tick } = setup();
    typed(store, 'b', 'label');
    tick(100);
    typed(store, 'bc', 'label');
    tick(100);
    typed(store, 'bcd', 'label');
    expect(store.past().length).toBe(1);
    store.undo();
    expect(label(store.doc())).toBe('a');
    store.redo();
    tick(COALESCE_MS + 10);
    typed(store, 'bcde', 'label');
    expect(store.past().length).toBe(2);
    typed(store, 'bcdef', 'other');
    expect(store.past().length).toBe(3);
  });

  it('makes a gesture one step however many updates it has, and none when it ends where it began', () => {
    const { store } = setup();
    store.begin();
    for (const t of ['b', 'c', 'd']) store.update((d) => ({ ...d, script: script(t) }));
    store.end();
    expect(store.past().length).toBe(1);
    store.undo();
    expect(label(store.doc())).toBe('a');
    store.begin();
    store.update((d) => ({ ...d, script: script('x') }));
    store.update((d) => ({ ...d, script: script('a') }));
    store.end();
    expect(store.past().length).toBe(0);
  });

  it('follows the server when it has no changes of its own, and keeps its own when it has', () => {
    const { store } = setup();
    store.replaceSaved(doc('s1'));
    expect(label(store.doc())).toBe('s1');
    expect(store.dirty()).toBe(false);
    typed(store, 'mine');
    store.replaceSaved(doc('s2'));
    expect(label(store.doc())).toBe('mine');
    expect(store.dirty()).toBe(true);
  });

  it('is clean after saving what the draft was', () => {
    const { store } = setup();
    typed(store, 'b');
    store.replaceSaved(store.doc());
    expect(store.dirty()).toBe(false);
  });

  it('takes what the server answered to a save as saved and as the draft, and keeps the history', () => {
    const { store } = setup();
    typed(store, 'b');
    store.settle(doc('b-normalised'));
    expect(store.dirty()).toBe(false);
    expect(label(store.doc())).toBe('b-normalised');
    expect(store.canUndo()).toBe(true);
  });

  it('throws the draft away for what the server has', () => {
    const { store } = setup();
    typed(store, 'b');
    store.discard();
    expect(label(store.doc())).toBe('a');
    expect(store.canUndo()).toBe(false);
  });
});
