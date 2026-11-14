import { addressKey, buildAnimationExport, canonical, countPlan, DATASET_FORMAT, fingerprint, planAnimationImport, readCurrentState, type AnimationDataset, type CurrentState, type FilePart } from '@lab/animation-dataset';
import { InMemoryAnimation } from './in-memory.adapter';
import { type AnimationPort, type Catalog, type Design, type Draft, type PieceDetail, type Preset, type Reference, type Script, type Song } from '@lab/animation-core';

const design: Design = { dark: '#1d1425', light: '#c7ad93', accent: '#6e58db', display: 'condensed', body: 'grotesk', defaultMode: 'dark', modes: { intro: 'dark' }, concept: 'neon city' };
const script: Script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 10, part: 'synth-sun' }, { id: 'p2', start: 10, end: 20, part: 'warp-grid', with: [{ part: 'nebula' }] }] };
const song: Song = { key: 'ms-1/pista_1/0', project: 'ms-1', trackId: 'pista_1', variant: 0, title: 'Neon Pulse', seconds: 135, instrumental: false };
const other: Song = { key: 'ms-2/pista_9/3', project: 'ms-2', trackId: 'pista_9', variant: 3, title: 'Other Song', seconds: 96, instrumental: false };
const catalog = { parts: ['synth-sun', 'warp-grid', 'nebula'].map((name) => ({ name, description: name, levels: ['simple'], costMs: 1, manual: false, params: [] })) } as unknown as Catalog;
const reference = (extra: Partial<Reference> = {}): Reference => ({ id: 'ref-1', title: 'A video', notes: '', tags: [], source: 'https://www.youtube.com/watch?v=abc', state: 'ready', createdAt: 1, ...extra });
const preset = (extra: Partial<Preset> = {}): Preset => ({ id: 'pre-1', name: 'Meat Proxy', referenceId: 'ref-1', createdAt: 1, design, rhythm: 8, parts: ['synth-sun'], adjustments: [], ...extra });
const piece = (): PieceDetail => ({ id: 'api-1', title: 'Neon Pulse', state: 'done', progress: 100, source: { project: 'ms-1', trackId: 'pista_1', variant: 0 }, design: { design, source: 'user', edited: true }, script }) as unknown as PieceDetail;
const draft = (name: string): Draft => ({ id: 'd-1', state: 'ready', request: 'x', withPicture: false, attempts: 1, problems: [], createdAt: 1, preview: [], name });

const nothing: CurrentState = { songs: [song, other], catalog, references: [], presets: [], drafts: [], pieces: [] };
const goodPart = (name: string): FilePart => ({ name, description: name, text: { request: 'a thing', manifest: JSON.stringify({ name }), fragment: '<div></div>' } });
/** An animation file; `look` and `parts` are given or left out. */
const file = (animation: Partial<AnimationDataset['animation']> = {}): AnimationDataset => ({
  format: DATASET_FORMAT,
  version: 2,
  animation: { title: 'Neon Pulse', song: { project: 'ms-1', trackId: 'pista_1', variant: 0, title: 'Neon Pulse', seconds: 135 }, options: { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' }, design, script, ...animation },
});
const withLook: Partial<AnimationDataset['animation']> = {
  look: { style: { name: 'Meat Proxy', reference: 'https://www.youtube.com/watch?v=abc', design, rhythm: 8, parts: ['synth-sun'] }, reference: { title: 'A video', notes: '', tags: [], source: 'https://youtu.be/abc' } },
};
const actions = (plan: ReturnType<typeof planAnimationImport>) => plan.items.map((i) => `${i.kind}:${i.action}${i.reason ? `:${i.reason}` : ''}`);

describe('addressKey and fingerprint', () => {
  it('reads the ways of writing one YouTube video as one', () => {
    const keys = ['https://youtu.be/abc?si=1', 'https://www.youtube.com/watch?v=abc&t=3', 'https://m.youtube.com/watch?v=abc', 'https://music.youtube.com/watch?v=abc', 'https://youtube.com/shorts/abc'].map(addressKey);
    expect(new Set(keys)).toEqual(new Set(['yt:abc']));
    expect(addressKey('https://example.com/v/1/')).toBe('https://example.com/v/1');
    expect(addressKey('not an address')).toBe('not an address');
  });

  it('writes a value the same whatever the order of its fields, and sees a plain style as none', () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(canonical({ a: [2, { d: 1 }], b: 1 }));
    const a = fingerprint(song, { ...design, verseStyle: 'plain' }, script);
    expect(a).toBe(fingerprint(song, design, script));
    expect(a).not.toBe(fingerprint(song, { ...design, verseStyle: 'karaoke' }, script));
  });
});

describe('planAnimationImport', () => {
  it('makes a bare animation on its own song: the song is there and the animation is new', () => {
    const plan = planAnimationImport(file(), nothing);
    expect(actions(plan)).toEqual(['song:exists', 'animation:create']);
    expect(plan.song).toEqual(song);
    expect(plan.fitted).toBe(false);
  });

  it('makes what is not there, in the order song, reference, style, parts, animation', () => {
    const plan = planAnimationImport(file({ ...withLook, parts: [goodPart('my-part')] }), nothing);
    expect(actions(plan)).toEqual(['song:exists', 'reference:create', 'style:create', 'part:create', 'animation:create']);
    expect(plan.items[2].base).toEqual({ made: true });
    expect(countPlan(plan)).toEqual({ create: 4, exists: 1, 'keep-local': 0, impossible: 0 });
  });

  it('says a reference, a style, a part and the animation are already there, whichever way the address is written', () => {
    const plan = planAnimationImport(file({ ...withLook, parts: [goodPart('nebula')] }), { ...nothing, references: [reference()], presets: [preset()], pieces: [piece()] });
    expect(actions(plan)).toEqual(['song:exists', 'reference:exists', 'style:exists', 'part:exists', 'animation:exists']);
    expect(plan.items[2].presetId).toBe('pre-1');
  });

  it('starts a new style from a reference that is ready, and keeps it in the browser when there is none to start from', () => {
    const ready = planAnimationImport(file(withLook), { ...nothing, references: [reference()] });
    expect(ready.items.find((i) => i.kind === 'style')).toMatchObject({ action: 'create', base: { existing: 'ref-1' } });
    const failed = planAnimationImport(file(withLook), { ...nothing, references: [reference({ state: 'failed' })] });
    expect(failed.items.find((i) => i.kind === 'style')).toMatchObject({ action: 'keep-local', reason: 'no-ready-reference' });
    const noAddress = planAnimationImport(file({ look: { style: { name: 'Mine', design, rhythm: 8, parts: [] } } }), nothing);
    expect(actions(noAddress)).toEqual(['song:exists', 'style:keep-local:no-ready-reference', 'animation:create']);
  });

  it('keeps a style in the browser when parts it needs are nobody\'s, and says which', () => {
    const plan = planAnimationImport(file({ look: { style: { name: 'Mine', design, rhythm: 8, parts: ['synth-sun', 'ghost'] } } }), nothing);
    expect(plan.items.find((i) => i.kind === 'style')).toMatchObject({ action: 'keep-local', reason: 'parts-missing', detail: ['ghost'] });
  });

  it('sees a style already kept in this browser as already there', () => {
    const plan = planAnimationImport(file({ look: { style: { name: 'Mine', design, rhythm: 8, parts: [] } } }), { ...nothing, localStyles: [{ name: 'Mine' }] });
    expect(plan.items.find((i) => i.kind === 'style')!.action).toBe('exists');
  });

  it('plans a reference from the style address alone, and says a reference with no address cannot be made again', () => {
    const only = planAnimationImport(file({ look: { style: { name: 'Mine', reference: 'https://youtu.be/zzz', design, rhythm: 8, parts: [] } } }), nothing);
    expect(actions(only)).toEqual(['song:exists', 'reference:create', 'style:create', 'animation:create']);
    const none = planAnimationImport(file({ look: { reference: { title: 'An upload', notes: '', tags: [] } } }), nothing);
    expect(actions(none)).toEqual(['song:exists', 'reference:impossible:no-address', 'animation:create']);
  });

  it('offers a part with text as a draft, and says a part with no text or a bad one is not possible', () => {
    const bad: FilePart = { name: 'bad-part', description: 'x', text: { request: 'r', manifest: '{"name":"other"}', fragment: '' } };
    const plan = planAnimationImport(file({ parts: [goodPart('my-part'), { name: 'no-text', description: 'a part', text: null }, bad] }), nothing);
    expect(actions(plan).filter((a) => a.startsWith('part'))).toEqual(['part:create', 'part:impossible:part-no-text', 'part:impossible:draft-invalid']);
  });

  it('says a part is already there when the catalog has it or a draft of it is waiting', () => {
    const plan = planAnimationImport(file({ parts: [goodPart('nebula'), goodPart('drafted')] }), { ...nothing, drafts: [draft('drafted')] });
    expect(actions(plan).filter((a) => a.startsWith('part'))).toEqual(['part:exists', 'part:exists']);
  });

  it('says the animation is not possible while a part its script uses is not approved, even when the file brings it as a draft', () => {
    const lacking = { ...nothing, catalog: { parts: catalog.parts.filter((p) => p.name !== 'nebula') } as unknown as Catalog };
    const without = planAnimationImport(file(), lacking);
    expect(without.items.at(-1)).toMatchObject({ kind: 'animation', action: 'impossible', reason: 'parts-missing', detail: ['nebula'] });
    const noText = planAnimationImport(file({ parts: [{ name: 'nebula', description: 'x', text: null }] }), lacking);
    expect(noText.items.at(-1)).toMatchObject({ action: 'impossible', reason: 'parts-missing' });
    const brings = planAnimationImport(file({ parts: [goodPart('nebula')] }), lacking);
    expect(actions(brings)).toEqual(['song:exists', 'part:create', 'animation:impossible:parts-missing']);
    const approved = planAnimationImport(file({ parts: [goodPart('nebula')] }), nothing);
    expect(actions(approved)).toEqual(['song:exists', 'part:exists', 'animation:create']);
  });

  it('says the song is not in the library and the animation is not possible until another is picked', () => {
    const away = { ...nothing, songs: [other] };
    const plan = planAnimationImport(file(), away);
    expect(actions(plan)).toEqual(['song:impossible:song-missing', 'animation:impossible:song-missing']);
    expect(plan.song).toBeNull();
    const picked = planAnimationImport(file(), away, other);
    expect(actions(picked)).toEqual(['song:exists:fitted', 'animation:create:fitted']);
    expect(picked.song).toEqual(other);
    expect(picked.fitted).toBe(true);
  });

  it('puts the animation on another song of the library, fitted, and is always a new animation there', () => {
    const plan = planAnimationImport(file(), { ...nothing, pieces: [piece()] }, other);
    expect(plan.fitted).toBe(true);
    expect(plan.items.at(-1)).toMatchObject({ kind: 'animation', action: 'create', reason: 'fitted' });
    expect(plan.items[0]).toMatchObject({ kind: 'song', reason: 'fitted', detail: ['Neon Pulse'] });
  });

  it('picking the file\'s own song is the same as picking none', () => {
    const plan = planAnimationImport(file(), { ...nothing, pieces: [piece()] }, song);
    expect(plan.fitted).toBe(false);
    expect(plan.items.at(-1)!.action).toBe('exists');
  });

  it('counts an animation that differs only in a plain verse style as the same one', () => {
    const plan = planAnimationImport(file({ design: { ...design, verseStyle: 'plain' } }), { ...nothing, pieces: [piece()] });
    expect(plan.items.at(-1)!.action).toBe('exists');
  });

  it('counts a different script on the same song as a new animation', () => {
    const edited = file({ script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'warp-grid' }] } });
    expect(planAnimationImport(edited, { ...nothing, pieces: [piece()] }).items.at(-1)!.action).toBe('create');
  });
});

/** A port that fails if anything but the named calls is made. */
function watched(port: AnimationPort, allowed: readonly string[]) {
  const calls: string[] = [];
  const proxy = new Proxy(port, {
    get(target, key: string) {
      const value = (target as unknown as Record<string, unknown>)[key];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(key);
        if (!allowed.includes(key)) throw new Error(`reading the state called "${key}", which this animation does not need`);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { port: proxy, calls };
}

describe('readCurrentState', () => {
  async function loaded() {
    const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 100 });
    await import('rxjs').then((r) => r.firstValueFrom(port.loadSample()));
    return port;
  }
  const first = async <T>(o: import('rxjs').Observable<T>) => (await import('rxjs')).firstValueFrom(o);

  it('reads only the songs and the catalog for a bare animation on a song nobody has made a piece from', async () => {
    const port = await loaded();
    const { port: w, calls } = watched(port, ['songs', 'catalog', 'pieces']);
    const state = await readCurrentState(w, file({ song: { project: 'nope', trackId: 'x', variant: 0, title: 'x', seconds: 10 } }));
    expect(new Set(calls)).toEqual(new Set(['songs', 'catalog']));
    expect(state.pieces).toEqual([]);
  });

  it('reads the details of the pieces on the file\'s own song only, and the references and styles only when the file has a look', async () => {
    const port = await loaded();
    const mine = (await first(port.pieces()))[0];
    const exported = await buildAnimationExport(port, mine.id);
    const { port: w, calls } = watched(port, ['songs', 'catalog', 'pieces', 'piece']);
    const state = await readCurrentState(w, { ...exported, animation: { ...exported.animation, look: undefined, parts: undefined } });
    expect(calls).not.toContain('references');
    expect(calls).not.toContain('presets');
    expect(calls).not.toContain('drafts');
    expect(state.pieces.length).toBeGreaterThan(0);
    expect(state.pieces.every((p) => p.source.trackId === exported.animation.song.trackId)).toBe(true);
  });

  it('reads the references and styles for a look and the drafts for parts', async () => {
    const port = await loaded();
    const { port: w, calls } = watched(port, ['songs', 'catalog', 'pieces', 'piece', 'references', 'presets', 'drafts']);
    await readCurrentState(w, file({ ...withLook, parts: [goodPart('my-part')] }));
    expect(calls).toEqual(expect.arrayContaining(['references', 'presets', 'drafts']));
  });

  it('plans the export of an animation as already there on the same server', async () => {
    const port = await loaded();
    const mine = (await first(port.pieces()))[0];
    const exported = await buildAnimationExport(port, mine.id);
    const plan = planAnimationImport(exported, await readCurrentState(port, exported));
    expect(plan.items.at(-1)!.action).toBe('exists');
  });
});
