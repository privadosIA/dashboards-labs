import { BUILT_IN_DATASET, MAX_ITEMS, validateDataset, type Dataset } from './dataset';

const base = (): Dataset => structuredClone(BUILT_IN_DATASET) as Dataset;

describe('validateDataset', () => {
  it('accepts the built-in dataset, which has what the screens need', () => {
    expect(validateDataset(BUILT_IN_DATASET)).toEqual([]);
    expect(BUILT_IN_DATASET.pieces.length).toBeGreaterThan(10);
    expect(BUILT_IN_DATASET.references.length).toBeGreaterThan(10);
    expect(new Set(BUILT_IN_DATASET.pieces.map((p) => p.state))).toEqual(new Set(['done', 'draft', 'failed']));
  });

  it('accepts a file with only some of the lists, and an empty one', () => {
    expect(validateDataset({})).toEqual([]);
    expect(validateDataset({ parts: [{ name: 'my-part', description: 'x' }] })).toEqual([]);
  });

  it('refuses what is not an object, and a list that is not a list or is too long', () => {
    expect(validateDataset([])[0]).toContain('JSON object');
    expect(validateDataset(null)[0]).toContain('JSON object');
    expect(validateDataset({ songs: 3 })).toEqual(['songs: must be a list']);
    expect(validateDataset({ pieces: new Array(MAX_ITEMS + 1).fill({}) })[0]).toContain(`at most ${MAX_ITEMS}`);
  });

  it('names a piece whose song is not in the file', () => {
    const d = base();
    d.songs = d.songs!.slice(2);
    const problems = validateDataset(d);
    expect(problems.some((p) => /^pieces\[0\]: the song sample-beat\/track-1\/0 is not in songs$/.test(p))).toBe(true);
  });

  it('names a style whose reference is not in the file', () => {
    const d = base();
    d.presets![0].referenceId = 'nowhere';
    expect(validateDataset(d)).toEqual(['presets[0]: the reference nowhere is not in references']);
  });

  it('refuses ids and songs used twice', () => {
    const d = base();
    d.pieces![1].id = d.pieces![0].id;
    d.references![1].id = d.references![0].id;
    d.songs!.push({ ...d.songs![0] });
    const problems = validateDataset(d);
    expect(problems).toContain(`pieces: the id "${d.pieces![0].id}" is used more than once`);
    expect(problems).toContain(`references: the id "${d.references![0].id}" is used more than once`);
    expect(problems.some((p) => p.includes('is listed more than once'))).toBe(true);
  });

  it('checks the choices of a piece with the same limits as a new piece', () => {
    const d = base();
    Object.assign(d.pieces![0], { level: 'huge', style: 'x', fps: 25, resolution: 'big', state: 'running' });
    expect(validateDataset(d)).toEqual([
      'pieces[0]: level must be one of simple, medium, advanced',
      'pieces[0]: style must be one of typographic, illustrated',
      'pieces[0]: fps must be one of 24, 30, 60',
      'pieces[0]: resolution must look like 1280x720',
      'pieces[0]: state must be done, draft or failed',
    ]);
  });

  it('wants the reason of a failed piece', () => {
    const d = base();
    const failed = d.pieces!.find((p) => p.state === 'failed')!;
    delete failed.error;
    expect(validateDataset(d)[0]).toMatch(/needs the reason in error/);
  });

  it('refuses a part the catalog already has, and a name that is not kebab-case', () => {
    expect(validateDataset({ parts: [{ name: 'counter', description: 'x' }] }, ['counter'])).toEqual(['parts[0]: the catalog already has a part named counter']);
    expect(validateDataset({ parts: [{ name: 'Not Kebab', description: 'x' }] })[0]).toContain('lowercase words');
  });

  it('refuses a reference that is not a web address and tags that are too many', () => {
    const problems = validateDataset({ references: [{ id: 'a', title: 't', notes: '', tags: new Array(11).fill('x'), source: 'file:///etc/passwd' }] });
    expect(problems).toEqual(['references[0]: tags must be a list of up to 10 short texts', 'references[0]: source must be an http or https address']);
  });

  it('says the same things in Spanish when asked', () => {
    const d = base();
    d.songs = d.songs!.slice(2);
    expect(validateDataset(d, [], 'es')[0]).toBe('pieces[0]: la canción sample-beat/track-1/0 no está en songs');
    expect(validateDataset([], [], 'es')[0]).toContain('objeto JSON');
    expect(validateDataset({ presets: [{ id: 'a', name: 'n', referenceId: 'x' }] }, [], 'es')).toEqual(['presets[0]: la referencia x no está en references']);
  });
});
