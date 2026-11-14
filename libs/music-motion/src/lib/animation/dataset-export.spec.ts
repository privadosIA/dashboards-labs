import { firstValueFrom, of } from 'rxjs';

import { buildAnimationExport, DATASET_FORMAT, partsUsed, validateAnimationDataset, type LocalLook } from '@lab/animation-dataset';
import { InMemoryAnimation } from './in-memory.adapter';
import type { LocalStyle } from './local-styles';
import { type AnimationPort, type Script } from '@lab/animation-core';

const first = <T>(o: import('rxjs').Observable<T>) => firstValueFrom(o);
const NOW = () => new Date('2026-11-09T10:00:00.000Z');

async function loaded() {
  let now = 1_000_000;
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 100, now: () => now });
  await first(port.loadSample());
  return { port, tick: (ms: number) => (now += ms) };
}

/** A port that fails if anything but the named calls is made, to show that what the animation does not need was not read. */
function watched(port: AnimationPort, allowed: readonly string[]) {
  const calls: string[] = [];
  const proxy = new Proxy(port, {
    get(target, key: string) {
      const value = (target as unknown as Record<string, unknown>)[key];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(key);
        if (!allowed.includes(key)) throw new Error(`the export read "${key}", which the animation does not need`);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { port: proxy, calls };
}

/** A piece made from a song, with the style of a reference when there is one. */
async function pieceWith(port: InMemoryAnimation, script?: Script, withStyle = false) {
  const song = (await first(port.songs()))[0];
  const presetId = withStyle ? (await first(port.presets()))[0].id : undefined;
  const born = await first(port.create(song, { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720', ...(presetId ? { presetId } : {}) }));
  return script ? first(port.saveScript(born.id, script)) : born;
}

const kept = (extra: Partial<LocalStyle> = {}): LocalStyle => ({ id: 'local-1', name: 'Mine', design: { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: '' }, rhythm: 7, parts: ['toggle'], createdAt: 1, ...extra });

describe('partsUsed', () => {
  it('lists the main parts and the extra ones once each', () => {
    const script: Script = { version: 1, pieces: [{ id: 'a', start: 0, end: 1, part: 'x', with: [{ part: 'y' }] }, { id: 'b', start: 1, end: 2, part: 'x', with: [{ part: 'z' }] }] };
    expect(partsUsed(script)).toEqual(['x', 'y', 'z']);
  });
});

describe('buildAnimationExport', () => {
  it('exports one animation as a dataset that its own validator accepts', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port);
    const file = await buildAnimationExport(port, piece.id, undefined, NOW);
    expect(file).toMatchObject({ format: DATASET_FORMAT, version: 2, exportedAt: '2026-11-09T10:00:00.000Z' });
    expect(file.animation).toMatchObject({
      title: piece.title,
      song: { project: piece.source.project, trackId: piece.source.trackId, variant: piece.source.variant, seconds: piece.songMap.duration },
      options: { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' },
      design: piece.design.design,
      script: piece.script,
    });
    const text = JSON.parse(JSON.stringify(file));
    expect(validateAnimationDataset(text, 'en')).toEqual({ ok: true, dataset: text });
    expect(JSON.stringify(file)).not.toMatch(/\.mp4|\.jpg|ticket|token/i);
  });

  it('reads only what the animation needs: not the lists, the songs, the other pieces nor the other styles', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port);
    const { port: watchedPort, calls } = watched(port, ['piece', 'catalog']);
    const file = await buildAnimationExport(watchedPort, piece.id, undefined, NOW);
    expect(new Set(calls)).toEqual(new Set(['piece', 'catalog']));
    expect(file.animation.look).toBeUndefined();
    expect(file.animation.parts).toBeUndefined();
  });

  it('carries the style a piece started from and the address of that style\'s reference', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port, undefined, true);
    expect(piece.preset).toBeTruthy();
    const preset = await first(port.preset(piece.preset!));
    const reference = await first(port.reference(preset.referenceId!));
    const { port: watchedPort, calls } = watched(port, ['piece', 'catalog', 'preset', 'reference']);
    const file = await buildAnimationExport(watchedPort, piece.id, undefined, NOW);
    expect(file.animation.look?.style).toMatchObject({ name: preset.name, rhythm: preset.rhythm, parts: [...preset.parts], ...(reference.source ? { reference: reference.source } : {}) });
    if (reference.source) expect(file.animation.look?.reference).toEqual({ title: reference.title, notes: reference.notes, tags: [...reference.tags], source: reference.source });
    expect(calls).not.toContain('presets');
    expect(calls).not.toContain('references');
  });

  it('takes the own style a piece started from, kept in the browser, as its look, without asking the server for a style', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port);
    const local: LocalLook = (id) => (id === piece.id ? kept({ reference: 'https://youtu.be/abc' }) : undefined);
    const { port: watchedPort, calls } = watched(port, ['piece', 'catalog']);
    const file = await buildAnimationExport(watchedPort, piece.id, local, NOW);
    expect(file.animation.look).toEqual({ style: expect.objectContaining({ name: 'Mine', rhythm: 7, parts: ['toggle'], reference: 'https://youtu.be/abc' }) });
    expect(calls).not.toContain('preset');
    expect(validateAnimationDataset(JSON.parse(JSON.stringify(file)), 'en').ok).toBe(true);
  });

  it('has no look when its style no longer exists, and is still complete', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port, undefined, true);
    await first(port.removePreset(piece.preset!));
    const file = await buildAnimationExport(port, piece.id, undefined, NOW);
    expect(file.animation.look).toBeUndefined();
    expect(file.animation.script.pieces.length).toBeGreaterThan(0);
  });

  it('exports an approved part of the user\'s without its text and leaves out the parts that come with the server', async () => {
    const { port } = await loaded();
    const catalog = await first(port.catalog());
    const mine = catalog.parts.find((p) => p.source === 'user')!;
    const builtIn = catalog.parts.find((p) => p.source !== 'user')!;
    expect(mine).toBeTruthy();
    const piece = await pieceWith(port, { version: 1, pieces: [{ id: 'a', start: 0, end: piece0Seconds(), part: builtIn.name, with: [{ part: mine.name }] }] });
    const file = await buildAnimationExport(port, piece.id, undefined, NOW);
    expect(file.animation.parts).toEqual([{ name: mine.name, description: mine.description.slice(0, 300), levels: [...mine.levels], params: mine.params.map((p) => ({ name: p.name, type: p.type, default: p.default })), text: null }]);
    expect(file.animation.parts!.map((p) => p.name)).not.toContain(builtIn.name);
  });

  it('exports the text of a ready draft that is for a part of the user\'s the script uses', async () => {
    const { port } = await loaded();
    const mine = (await first(port.catalog())).parts.find((p) => p.source === 'user')!;
    const piece = await pieceWith(port, { version: 1, pieces: [{ id: 'a', start: 0, end: piece0Seconds(), part: mine.name }] });
    const draft = { id: 'd1', state: 'ready' as const, request: 'a ticking clock', name: mine.name, manifest: `{"name":"${mine.name}"}`, fragment: '<div></div>', withPicture: false, attempts: 1, problems: [], createdAt: 1, preview: [] };
    const withDraft = Object.create(port, { drafts: { value: () => of([draft]) }, draft: { value: () => of(draft) } }) as AnimationPort;
    const file = await buildAnimationExport(withDraft, piece.id, undefined, NOW);
    expect(file.animation.parts).toEqual([expect.objectContaining({ name: mine.name, text: { request: 'a ticking clock', manifest: draft.manifest, fragment: '<div></div>' } })]);
  });

  it('does not read the drafts when the script uses only parts that come with the server', async () => {
    const { port } = await loaded();
    const piece = await pieceWith(port);
    const { port: watchedPort, calls } = watched(port, ['piece', 'catalog']);
    await buildAnimationExport(watchedPort, piece.id, undefined, NOW);
    expect(calls).not.toContain('drafts');
  });
});

/** The length of the first song, which a one-piece script has to cover. */
function piece0Seconds(): number {
  return 48;
}
