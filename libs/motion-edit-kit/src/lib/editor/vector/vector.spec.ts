import { installBBoxPolyfill, sampleDocument, SAMPLE_SVG } from '@lab/vector-editor/testing';
import { setKeyframe, toPart } from '@lab/vector-editor';
import type { Script } from '@lab/animation-core';

import { selectedBlock } from './selected-block';
import { documentOfPart, documentOfSvg, VectorSession } from './vector-session';

const script: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 4, part: 'toggle' },
    { id: 'p2', start: 4, end: 12, part: 'pulse-ring', with: [{ part: 'spin-logo', params: {} }] },
  ],
  layers: [{ id: 'l1', items: [{ part: 'wire-sphere', start: 5, end: 7 }] }],
};

describe('selectedBlock', () => {
  it('gives the part and the stretch of a piece, of an extra (the piece’s stretch) and of a layer item (its own)', () => {
    expect(selectedBlock(script, { piece: 'p1' }, null)).toEqual({ part: 'toggle', start: 0, end: 4 });
    expect(selectedBlock(script, { piece: 'p2', extra: 0 }, null)).toEqual({ part: 'spin-logo', start: 4, end: 12 });
    expect(selectedBlock(script, null, { layer: 'l1', item: 0 })).toEqual({ part: 'wire-sphere', start: 5, end: 7 });
  });

  it('gives nothing for no selection, a text line, a missing extra or a missing item', () => {
    expect(selectedBlock(script, null, null)).toBeNull();
    expect(selectedBlock(script, { piece: 'p1', line: 0 }, null)).toBeNull();
    expect(selectedBlock(script, { piece: 'p2', extra: 3 }, null)).toBeNull();
    expect(selectedBlock(script, { piece: 'nope' }, null)).toBeNull();
    expect(selectedBlock(script, null, { layer: 'l1', item: 9 })).toBeNull();
  });
});

describe('documentOfPart and documentOfSvg', () => {
  beforeAll(() => installBBoxPolyfill());

  it('reads the document a vector part carries, named by what the part says it does, with the part’s name', () => {
    const made = toPart(sampleDocument(), { name: 'spin-logo', description: 'A logo that turns' });
    if ('problems' in made) throw new Error(made.problems.join());
    const read = documentOfPart({ name: 'spin-logo', manifest: made.manifest, fragment: made.fragment });
    expect('doc' in read && read.doc.partName).toBe('spin-logo');
    expect('doc' in read && read.doc.name).toBe('A logo that turns');
  });

  it('says a part is not a vector part when it carries no model', () => {
    expect(documentOfPart({ name: 'toggle', manifest: '{}', fragment: '<div>hi</div>' })).toEqual({ problem: expect.stringContaining('not a vector part') });
  });

  it('makes a new document from an SVG, named after the file, and refuses what is not one', () => {
    const made = documentOfSvg('logo.svg', SAMPLE_SVG);
    expect('doc' in made && made.doc.name).toBe('logo');
    expect('doc' in made && made.doc.nodes).toHaveLength(1);
    expect(documentOfSvg('x.svg', 'hello')).toEqual({ problem: expect.stringContaining('not an SVG') });
  });
});

describe('VectorSession', () => {
  it('opens a part clean, counts changes apart from the script, and goes back to what was saved on discard', () => {
    const session = new VectorSession();
    expect(session.open()).toBe(false);
    session.openPart({ ...sampleDocument(), partName: 'spin-logo' });
    expect(session.partName()).toBe('spin-logo');
    expect(session.dirty()).toBe(false);
    session.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 99));
    expect(session.dirty()).toBe(true);
    session.discard();
    expect(session.dirty()).toBe(false);
    expect(session.open()).toBe(true);
  });

  it('opens a new document as work not yet kept, closes it on discard, and takes the name it was sent under without a step of history', () => {
    const session = new VectorSession();
    session.openNew(sampleDocument());
    expect(session.partName()).toBeNull();
    expect(session.dirty()).toBe(true);
    session.saved('my-logo');
    expect(session.partName()).toBe('my-logo');
    expect(session.dirty()).toBe(false);
    expect(session.store()!.canUndo()).toBe(false);
    expect(session.store()!.doc().partName).toBe('my-logo');
    const fresh = new VectorSession();
    fresh.openNew(sampleDocument());
    fresh.discard();
    expect(fresh.open()).toBe(false);
  });
});
