import { ApiError } from '@lab/api-client';
import { firstValueFrom, of, throwError } from 'rxjs';

import { FallbackPrompts, LocalPrompts, ServerPrompts, bundledPresets } from './adapters';
import { PromptsUnavailable, type Preset, presetKindOf } from './model';
import { MemoryPresetStore } from './own-store';
import { MAX_EXAMPLES, chooseExamples, readBundle, refusalOf, searchPresets } from './rank';

const preset = (over: Partial<Preset> & Pick<Preset, 'id' | 'kind'>): Preset => ({ title: over.id, prompt: 'p', tags: [], language: 'en', source: 's', licence: 'CC0-1.0', own: false, created_at: '2026-01-01T00:00:00Z', ...over });
const bundle = (items: unknown[]) => ({ format: 'prompt-presets', version: 1, items });
const good = { kind: 'image', title: 'T', prompt: 'a prompt', tags: ['x'], source: 'hf/x', source_id: '1', licence: 'cc0-1.0', language: 'en', nsfw: false };

describe('the bundled sample', () => {
  it('has five presets of each kind, every one with a source and a licence, none read-only broken', () => {
    const all = bundledPresets();
    expect(all.length).toBe(25);
    for (const kind of ['image', 'video', 'motion', 'music', 'animation']) expect(all.filter((p) => p.kind === kind).length).toBe(5);
    expect(all.every((p) => p.source && p.licence === 'CC0-1.0' && !p.own)).toBe(true);
    expect(new Set(all.map((p) => p.id)).size).toBe(25);
  });
});

describe('searchPresets', () => {
  it('returns only image presets whose title, prompt or tags contain the word, best match first', () => {
    const all = [
      preset({ id: 'a', kind: 'image', title: 'Quiet lake', prompt: 'a lake with a neon sign', tags: [] }),
      preset({ id: 'b', kind: 'image', title: 'Neon street', prompt: 'rain', tags: ['neon'] }),
      preset({ id: 'c', kind: 'video', title: 'Neon video', prompt: 'neon', tags: ['neon'] }),
      preset({ id: 'd', kind: 'image', title: 'Forest', prompt: 'trees', tags: ['green'] }),
    ];
    const r = searchPresets(all, { kind: 'image', q: 'neon' });
    expect(r.items.map((p) => p.id)).toEqual(['b', 'a']);
    expect(r.total).toBe(2);
  });

  it('requires every word and every tag, and limits the list while keeping the total', () => {
    const all = Array.from({ length: 5 }, (_, i) => preset({ id: `p${i}`, kind: 'music', title: `song ${i}`, prompt: 'calm pop', tags: i < 3 ? ['pop', 'calm'] : ['pop'] }));
    expect(searchPresets(all, { q: 'calm pop' }).total).toBe(5);
    expect(searchPresets(all, { q: 'calm rock' }).total).toBe(0);
    expect(searchPresets(all, { tags: ['pop', 'calm'] }).total).toBe(3);
    const limited = searchPresets(all, { limit: 2 });
    expect(limited.items.length).toBe(2);
    expect(limited.total).toBe(5);
  });
});

describe('chooseExamples', () => {
  const all = [
    preset({ id: 'n1', kind: 'image', title: 'Night city neon', prompt: 'night city neon rain', tags: ['neon', 'night'] }),
    preset({ id: 'n2', kind: 'image', title: 'Rainy night', prompt: 'rain on a night street', tags: ['rain'] }),
    preset({ id: 'x', kind: 'image', title: 'Forest', prompt: 'trees', tags: ['green'] }),
    preset({ id: 'v', kind: 'video', title: 'Night video', prompt: 'night city', tags: [] }),
  ];

  it('sends the pinned ones, up to five, and nothing else', () => {
    const pinned = Array.from({ length: 7 }, (_, i) => preset({ id: `pin${i}`, kind: 'image' }));
    expect(chooseExamples(all, pinned, { kind: 'image', text: 'whatever' }).map((p) => p.id)).toEqual(['pin0', 'pin1', 'pin2', 'pin3', 'pin4']);
    expect(MAX_EXAMPLES).toBe(5);
  });

  it('with nothing pinned sends the best matches of the kind for the words of the brief, and never one that matches nothing', () => {
    const got = chooseExamples(all, [], { kind: 'image', text: 'night city neon rain' });
    expect(got.map((p) => p.id)).toEqual(['n1', 'n2']);
    expect(chooseExamples(all, [], { kind: 'image', text: 'a quiet desert' })).toEqual([]);
  });

  it('counts the engine and the tags of the brief too', () => {
    const music = [preset({ id: 'm1', kind: 'music', engine: 'heartmula', tags: ['pop'], prompt: 'pop song' }), preset({ id: 'm2', kind: 'music', engine: 'ace-step', tags: ['pop'], prompt: 'pop song' })];
    expect(chooseExamples(music, [], { kind: 'music', engine: 'heartmula', text: 'a pop song' })[0].id).toBe('m1');
    expect(chooseExamples(music, [], { kind: 'music', text: '', tags: ['pop'] }).length).toBe(2);
  });
});

describe('readBundle', () => {
  it('refuses an item without a licence naming its index and takes the rest', () => {
    const { toAdd, report } = readBundle(bundle([good, { ...good, source_id: '2', licence: '' }, { ...good, source_id: '3' }]), []);
    expect(toAdd.length).toBe(2);
    expect(report).toEqual({ added: 2, already: 0, refused: [{ index: 1, reason: 'it has no licence' }] });
  });

  it('refuses no source, no kind, no prompt and a prompt over 2000 characters', () => {
    expect(refusalOf({ ...good, source: undefined })).toBe('it has no source');
    expect(refusalOf({ ...good, kind: 'x' })).toBe('it has no valid kind');
    expect(refusalOf({ ...good, prompt: ' ' })).toBe('it has no prompt');
    expect(refusalOf({ ...good, prompt: 'x'.repeat(2001) })).toContain('2000');
    expect(refusalOf(good)).toBeNull();
  });

  it('keeps source, source_id, licence, nsfw and language, and counts what is already there', () => {
    const { toAdd } = readBundle(bundle([good]), []);
    expect(toAdd[0]).toMatchObject({ source: 'hf/x', source_id: '1', licence: 'cc0-1.0', nsfw: false, language: 'en', kind: 'image' });
    const again = readBundle(bundle([good, good]), [{ source: 'hf/x', source_id: '1' }]);
    expect(again.report).toEqual({ added: 0, already: 2, refused: [] });
  });

  it('says it is not a bundle when the format is wrong', () => {
    expect(readBundle({ format: 'other' }, []).report.refused[0].index).toBe(-1);
  });
});

describe('LocalPrompts', () => {
  it('searches the sample and the person\'s own, adds one as own, and deletes only own ones', async () => {
    const local = new LocalPrompts(new MemoryPresetStore());
    expect((await firstValueFrom(local.list({ kind: 'image', q: 'neon' }))).items.every((p) => p.kind === 'image')).toBe(true);
    const made = await firstValueFrom(local.add({ kind: 'image', title: 'Mine', prompt: 'a zebra on the moon', tags: ['zebra'], language: 'en', source: 'user', licence: 'own' }));
    expect(made.own).toBe(true);
    expect((await firstValueFrom(local.list({ q: 'zebra' }))).items.map((p) => p.id)).toEqual([made.id]);
    await firstValueFrom(local.remove(made.id));
    expect((await firstValueFrom(local.list({ q: 'zebra' }))).total).toBe(0);
    await expect(firstValueFrom(local.remove('sample-1'))).rejects.toThrow(/read-only/);
  });

  it('imports a bundle once: the second time every item is already there, and imported items are read-only', async () => {
    const local = new LocalPrompts(new MemoryPresetStore());
    const first = await firstValueFrom(local.importBundle(bundle([good, { ...good, source_id: '2' }])));
    expect(first).toMatchObject({ added: 2, already: 0 });
    const second = await firstValueFrom(local.importBundle(bundle([good, { ...good, source_id: '2' }])));
    expect(second).toMatchObject({ added: 0, already: 2 });
    const [item] = (await firstValueFrom(local.list({ q: 'a prompt' }))).items;
    expect(item.own).toBe(false);
    await expect(firstValueFrom(local.remove(item.id))).rejects.toThrow(/read-only/);
  });
});

describe('ServerPrompts and FallbackPrompts', () => {
  const api = (answer: () => unknown) => ({ get: () => answer(), post: () => answer(), delete: () => answer() }) as never;
  const missing = () => throwError(() => new ApiError(404, 'unknown', 'not found'));

  it('reads the list from /api/prompts and says unavailable when the server has none', async () => {
    const ok = new ServerPrompts(api(() => of({ items: [preset({ id: 's', kind: 'image' })], total: 9 })));
    expect(await firstValueFrom(ok.list({}))).toMatchObject({ total: 9 });
    await expect(firstValueFrom(new ServerPrompts(api(missing)).list({}))).rejects.toBeInstanceOf(PromptsUnavailable);
  });

  it('falls back to the local store once the server has none, and keeps using it', async () => {
    const calls: string[] = [];
    const server = { list: () => (calls.push('server'), throwError(() => new PromptsUnavailable())), add: () => throwError(() => new PromptsUnavailable()), remove: () => of(undefined), importBundle: () => of({ added: 0, already: 0, refused: [] }) };
    const fb = new FallbackPrompts(server, new LocalPrompts(new MemoryPresetStore()));
    expect((await firstValueFrom(fb.list({ kind: 'music' }))).total).toBe(5);
    expect(fb.shared).toBe(false);
    await firstValueFrom(fb.list({}));
    expect(calls).toEqual(['server']);
  });

  it('passes through an error that is not a missing store', async () => {
    const server = { list: () => throwError(() => new Error('boom')), add: () => of({} as Preset), remove: () => of(undefined), importBundle: () => of({ added: 0, already: 0, refused: [] }) };
    await expect(firstValueFrom(new FallbackPrompts(server, new LocalPrompts()).list({}))).rejects.toThrow('boom');
  });

  it('maps a studio kind to its preset kind', () => {
    expect(['video', 'images', 'graphics', 'songs', 'piece'].map((k) => presetKindOf(k as never))).toEqual(['video', 'image', 'motion', 'music', 'animation']);
  });
});

describe('ServerPrompts against the contract', () => {
  const recorder = (answer: () => unknown) => {
    const calls: { method: string; path: string; options: unknown }[] = [];
    const api = { get: (path: string, options: unknown) => (calls.push({ method: 'get', path, options }), answer()), post: (path: string, options: unknown) => (calls.push({ method: 'post', path, options }), answer()), delete: (path: string, options: unknown) => (calls.push({ method: 'delete', path, options }), answer()) };
    return { api: api as never, calls };
  };

  it('asks for at most 200 at a time, the most the server lists', async () => {
    const { api, calls } = recorder(() => of({ items: [], total: 0 }));
    await firstValueFrom(new ServerPrompts(api).list({ kind: 'music', q: 'pop', tags: ['calm', 'night'], limit: 500 }));
    expect(calls[0]).toEqual({ method: 'get', path: '/api/prompts', options: { query: { kind: 'music', q: 'pop', tags: 'calm,night', limit: 200 } } });
    await firstValueFrom(new ServerPrompts(api).list({}));
    expect((calls[1].options as { query: { limit: number } }).query.limit).toBe(50);
  });

  it('saves a preset with the fields the contract names and no more (the server makes it own, from "user")', async () => {
    const { api, calls } = recorder(() => of({ id: 'x' }));
    await firstValueFrom(new ServerPrompts(api).add({ kind: 'image', title: 'T', prompt: 'p', tags: ['a'], language: 'en', source: 'user', licence: 'own', engine: 'e', negative: 'n', nsfw: true }));
    expect(calls[0]).toEqual({ method: 'post', path: '/api/prompts', options: { body: { kind: 'image', title: 'T', prompt: 'p', negative: 'n', tags: ['a'], engine: 'e', language: 'en' } } });
  });

  it('says a bundled preset is read-only on a 403, and a missing one is not a missing store', async () => {
    const forbidden = recorder(() => throwError(() => new ApiError(403, 'forbidden', 'bundled')));
    await expect(firstValueFrom(new ServerPrompts(forbidden.api).remove('p'))).rejects.toThrow(/read-only/);
    const gone = recorder(() => throwError(() => new ApiError(404, 'not_found', 'no such preset')));
    await expect(firstValueFrom(new ServerPrompts(gone.api).remove('p'))).rejects.not.toBeInstanceOf(PromptsUnavailable);
    const noStore = recorder(() => throwError(() => new ApiError(404, 'unknown', 'not found')));
    await expect(firstValueFrom(new ServerPrompts(noStore.api).remove('p'))).rejects.toBeInstanceOf(PromptsUnavailable);
  });
});

