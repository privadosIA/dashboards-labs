import type { Doc } from './editor-store';
import { clearDraft, readDraft, summarizeDraft, worthOffering, writeDraft, type DraftBox } from './draft-storage';

const doc = (title: string, pieces: { id: string; part: string }[] = []): Doc => ({ design: { title } as never, script: { pieces } as never });

const fake = (): DraftBox & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('draft storage', () => {
  it('keeps and reads back a draft per piece', () => {
    const box = fake();
    expect(writeDraft('a', { doc: doc('x'), base: doc('b'), at: 5 }, box)).toBe(true);
    expect(readDraft('a', box)?.doc).toEqual(doc('x'));
    expect(readDraft('b', box)).toBeNull();
  });

  it('forgets a draft', () => {
    const box = fake();
    writeDraft('a', { doc: doc('x'), base: doc('b'), at: 5 }, box);
    clearDraft('a', box);
    expect(readDraft('a', box)).toBeNull();
  });

  it('ignores what is not a draft', () => {
    const box = fake();
    box.setItem('motion-edit:draft:a', '{"doc":1}');
    expect(readDraft('a', box)).toBeNull();
    box.setItem('motion-edit:draft:a', 'not json');
    expect(readDraft('a', box)).toBeNull();
  });

  it('does not fail when the storage is blocked or full', () => {
    const broken: DraftBox = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('no'); } };
    expect(writeDraft('a', { doc: doc('x'), base: doc('b'), at: 5 }, broken)).toBe(false);
    expect(readDraft('a', broken)).toBeNull();
    expect(() => clearDraft('a', broken)).not.toThrow();
    expect(writeDraft('a', { doc: doc('x'), base: doc('b'), at: 5 }, null)).toBe(false);
  });

  it('offers a draft only when it differs from the server', () => {
    const d = { doc: doc('x'), base: doc('b'), at: 5 };
    expect(worthOffering(d, doc('x'))).toBe(false);
    expect(worthOffering(d, doc('b'))).toBe(true);
  });

  it('summarizes what a draft changes and whether the server moved on', () => {
    const server = doc('a', [{ id: 'p1', part: 'x' }, { id: 'p2', part: 'y' }]);
    const draft = { doc: doc('b', [{ id: 'p1', part: 'z' }, { id: 'p3', part: 'y' }]), base: server, at: 1 };
    expect(summarizeDraft(draft, server)).toEqual({ pieces: 3, design: true, layers: false, serverMoved: false });
    expect(summarizeDraft({ ...draft, base: doc('old') }, server).serverMoved).toBe(true);
  });
});
