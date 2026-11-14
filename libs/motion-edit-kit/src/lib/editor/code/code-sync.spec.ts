import { TestBed } from '@angular/core/testing';
import type { Design, Script, SongMap } from '@lab/animation-core';
import { CATALOG } from '@lab/animation-core/testing';
import type { Doc } from '@lab/motion-editor';

import { CODE_DEBOUNCE_MS, CodeSync, type CodeInputs } from './code-sync';

const design: Design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'grotesk', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: '' };
const songMap: SongMap = {
  duration: 48,
  bpm: 120,
  beats: Array.from({ length: 96 }, (_, i) => (i + 1) / 2),
  beatBase: 0,
  gridAnchored: true,
  sections: [
    { tag: 'Verse', start: 0, end: 24 },
    { tag: 'Chorus', start: 24, end: 48 },
  ],
  words: [],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
};
const inputs: CodeInputs = { catalog: CATALOG, songMap, level: 'simple' };
const script: Script = { version: 1, pieces: [{ id: 'a', start: 0, end: 24, part: 'blank' }, { id: 'b', start: 24, end: 48, part: 'counter', params: { to: 10 } }] };

function setup(initial: Script = script) {
  let doc: Doc = { design, script: initial };
  const applied: Script[] = [];
  const sync = new CodeSync({
    doc: () => doc,
    inputs: () => inputs,
    apply: (s) => {
      applied.push(s);
      doc = { ...doc, script: s };
    },
  });
  return { sync, applied, doc: () => doc, setScript: (s: Script) => (doc = { ...doc, script: s }) };
}

describe('CodeSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes the code from the document the first time', () => {
    const { sync } = setup();
    sync.reconcile();
    expect(sync.text()).toContain("import { script, piece, parts, section, song } from '@motion/script';");
    expect(sync.text()).toContain('to: section(\'chorus\').start,');
    expect(sync.paused()).toBe(false);
    expect(sync.sites().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('applies what the code says one debounce after the last key, as one change', () => {
    const { sync, applied } = setup();
    sync.reconcile();
    sync.edit(sync.text().replace('to: 10', 'to: 20'));
    sync.edit(sync.text().replace('to: 20', 'to: 30'));
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS - 1);
    expect(applied.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(applied.length).toBe(1);
    expect(applied[0].pieces[1].params).toEqual({ to: 30 });
  });

  it('does not write the code again over what the person typed when the document follows it', () => {
    const { sync } = setup();
    sync.reconcile();
    const typed = `// my note\n${sync.text().replace('to: 10', 'to: 20')}`;
    sync.edit(typed);
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    sync.reconcile();
    expect(sync.text()).toBe(typed);
  });

  it('leaves the document alone and pauses while the code has errors', () => {
    const { sync, applied, doc } = setup();
    sync.reconcile();
    sync.edit(sync.text().replace('to: 10', 'to: 9999'));
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    expect(applied.length).toBe(0);
    expect(sync.paused()).toBe(true);
    expect(sync.errorCount()).toBe(1);
    expect(doc().script).toEqual(script);
    // A reconcile with nothing new does not throw the code away.
    sync.reconcile();
    expect(sync.text()).toContain('to: 9999');
  });

  it('is not paused any more when the code maps again', () => {
    const { sync } = setup();
    sync.reconcile();
    const good = sync.text();
    sync.edit(good.replace('to: 10', 'to: 9999'));
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    expect(sync.paused()).toBe(true);
    sync.edit(good.replace('to: 10', 'to: 11'));
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    expect(sync.paused()).toBe(false);
  });

  it('keeps code that already maps to the document, comments included', () => {
    const { sync } = setup();
    sync.reconcile();
    const mine = `// keep me\n${sync.text()}`;
    sync.edit(mine);
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    sync.reconcile();
    expect(sync.text()).toBe(mine);
    expect(sync.takeReplaced()).toBe(false);
  });

  it('writes the code again when something else changes the document, and says it replaced what the person wrote', () => {
    const { sync, setScript } = setup();
    sync.reconcile();
    sync.edit(`// keep me\n${sync.text()}`);
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    setScript({ version: 1, pieces: [{ id: 'a', start: 0, end: 30.3, part: 'blank' }, { id: 'b', start: 30.3, end: 48, part: 'blank' }] });
    sync.reconcile();
    expect(sync.text()).not.toContain('keep me');
    expect(sync.text()).toContain('to: 30.3,');
    expect(sync.takeReplaced()).toBe(true);
    // Once per session.
    setScript(script);
    sync.edit(`// again\n${sync.text()}`);
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    setScript({ version: 1, pieces: [{ id: 'a', start: 0, end: 48, part: 'blank' }] });
    sync.reconcile();
    expect(sync.takeReplaced()).toBe(false);
  });

  it('does not say anything when the code was the one it wrote', () => {
    const { sync, setScript } = setup();
    sync.reconcile();
    setScript({ version: 1, pieces: [{ id: 'a', start: 0, end: 48, part: 'blank' }] });
    sync.reconcile();
    expect(sync.takeReplaced()).toBe(false);
  });

  it('does not write over the code while the person is typing', () => {
    const { sync, setScript } = setup();
    sync.reconcile();
    sync.edit(`${sync.text()}\n// typing`);
    setScript({ version: 1, pieces: [{ id: 'a', start: 0, end: 48, part: 'blank' }] });
    sync.reconcile();
    expect(sync.text()).toContain('// typing');
  });

  it('throws the code away and writes it again on revert', () => {
    const { sync } = setup();
    sync.reconcile();
    const original = sync.text();
    sync.edit(`${original}\n let x = 1;`);
    vi.advanceTimersByTime(CODE_DEBOUNCE_MS);
    expect(sync.paused()).toBe(true);
    sync.revert();
    expect(sync.text()).toBe(original);
    expect(sync.paused()).toBe(false);
    expect(sync.takeReplaced()).toBe(false);
  });

  it('reads the code again when the catalog or the song changes', () => {
    let current: CodeInputs = inputs;
    const doc: Doc = { design, script };
    const sync = new CodeSync({ doc: () => doc, inputs: () => current, apply: () => undefined });
    sync.reconcile();
    expect(sync.paused()).toBe(false);
    current = { ...inputs, catalog: { ...CATALOG, parts: CATALOG.parts.filter((p) => p.name !== 'counter') } };
    sync.reconcile();
    expect(sync.paused()).toBe(true);
    expect(sync.diagnostics().some((d) => d.code === 'unknown-part')).toBe(true);
  });

  it('does nothing without a document', () => {
    TestBed.runInInjectionContext(() => undefined);
    const sync = new CodeSync({ doc: () => null, inputs: () => inputs, apply: () => undefined });
    sync.reconcile();
    expect(sync.text()).toBe('');
  });
});
