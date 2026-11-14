import { firstValueFrom, throwError } from 'rxjs';

import { buildAnimationExport, countPlan, countResults, DATASET_FORMAT, planAnimationImport, readCurrentState, runAnimationImport, type AnimationDataset, type FileStyle, type RunOptions } from '@lab/animation-dataset';
import { AnimationFailure, type AnimationPort, type Song } from '@lab/animation-core';
import { InMemoryAnimation } from './in-memory.adapter';

const first = <T>(o: import('rxjs').Observable<T>) => firstValueFrom(o);

/** A port whose clocks are short, so waiting for an analysis or a draft takes milliseconds. */
const fresh = (options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) => new InMemoryAnimation({ stepMs: 100, pollMs: 5, analyseMs: 20, writeMs: 20, ...options });

/** The file of an animation made by hand: on the first song of the port, with a look from a good video and a part that has text. */
async function fileFor(port: AnimationPort, extra: Partial<AnimationDataset['animation']> = {}): Promise<AnimationDataset> {
  const song = (await first(port.songs()))[0];
  const catalog = await first(port.catalog());
  const piece = await first(port.create(song, { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' }));
  const design = { ...piece.design.design, concept: 'imported' };
  const script = { version: 1 as const, pieces: [{ id: 'p1', start: 0, end: song.seconds, part: catalog.parts[0].name, lines: [{ line: 1, text: 'old words' }] }] };
  await first(port.remove(piece.id));
  return {
    format: DATASET_FORMAT,
    version: 2,
    animation: {
      title: song.title,
      song: { project: song.project, trackId: song.trackId, variant: song.variant, title: song.title, seconds: song.seconds },
      options: { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' },
      design,
      script,
      look: {
        reference: { title: 'A good video', notes: 'n', tags: ['edm'], source: 'https://www.youtube.com/watch?v=ok1' },
        style: { name: 'From the good one', reference: 'https://youtu.be/ok1', design, rhythm: 6, parts: [catalog.parts[0].name] },
      },
      parts: [{ name: 'my-new-part', description: 'a new part', text: { request: 'a clock that ticks', manifest: JSON.stringify({ name: 'my-new-part', description: 'a new part' }), fragment: '<div>tick</div>' } }],
      ...extra,
    },
  };
}

const options = (kept: FileStyle[] = [], extra: Partial<RunOptions> = {}): RunOptions => ({ keepLocal: (s) => (kept.push(s), true), waitMs: 3000, pollMs: 5, ...extra });

async function importInto(port: AnimationPort, file: AnimationDataset, run: RunOptions, picked?: Song) {
  const plan = planAnimationImport(file, await readCurrentState(port, file), picked);
  return { plan, results: await runAnimationImport(file, plan, port, run) };
}

describe('runAnimationImport', () => {
  it('makes everything the plan says, in order, and reports each item', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const progress: number[] = [];
    const { plan, results } = await importInto(target, file, options([], { onProgress: (r) => progress.push(r.length) }));
    expect(countPlan(plan).create).toBe(4);
    expect(results.map((r) => `${r.kind}:${r.state}`)).toEqual(['song:exists', 'reference:created', 'style:created', 'part:created', 'animation:created']);
    expect(progress).toEqual([1, 2, 3, 4, 5]);

    expect((await first(target.references())).map((r) => r.title)).toContain('A good video');
    const presets = await first(target.presets());
    const preset = presets.find((p) => p.name === 'From the good one')!;
    expect(preset).toMatchObject({ rhythm: 6 });
    const drafts = await first(target.drafts());
    expect(drafts).toHaveLength(1);
    expect(await first(target.draft(drafts[0].id))).toMatchObject({ state: 'ready', manifest: JSON.stringify({ name: 'my-new-part', description: 'a new part' }), fragment: '<div>tick</div>' });

    const made = results.find((r) => r.kind === 'animation')!;
    const detail = await first(target.piece(made.pieceId!));
    expect(detail.preset).toBe(preset.id);
    expect(detail.design.design.concept).toBe('imported');
    expect(detail.script.pieces[0]).toMatchObject({ id: 'p1', start: 0 });
    expect(detail.script.pieces[0].lines).toEqual([{ line: 1, text: 'old words' }]);
    expect(countResults(results)).toEqual({ created: 4, exists: 1, 'kept-local': 0, failed: 0, skipped: 0 });
  });

  it('makes nothing twice: importing the same file again finds everything there', async () => {
    const target = fresh();
    const file = await fileFor(fresh());
    const { results: made } = await importInto(target, { ...file, animation: { ...file.animation, parts: undefined } }, options());
    expect(made.every((r) => r.state !== 'failed')).toBe(true);
    const counts = async () => ({ references: (await first(target.references())).length, presets: (await first(target.presets())).length, drafts: (await first(target.drafts())).length, pieces: (await first(target.pieces())).length });
    const before = await counts();
    const again = await importInto(target, { ...file, animation: { ...file.animation, parts: undefined } }, options());
    expect(countPlan(again.plan)).toEqual({ create: 0, exists: 4, 'keep-local': 0, impossible: 0 });
    expect(again.results.every((r) => r.state === 'exists')).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it('still makes the animation when the look fails, keeping the style in the browser and saying so', async () => {
    const file = await fileFor(fresh(), {});
    const broken = { ...file, animation: { ...file.animation, look: { reference: { title: 'A broken video', notes: '', tags: [], source: 'https://www.youtube.com/watch?v=broken1' }, style: { ...file.animation.look!.style!, reference: 'https://youtu.be/broken1' } } } };
    const target = fresh();
    const kept: FileStyle[] = [];
    const started: [string, string][] = [];
    const { results } = await importInto(target, broken, options(kept, { startedFromLocal: (id, name) => started.push([id, name]) }));
    expect(results.map((r) => `${r.kind}:${r.state}`)).toEqual(['song:exists', 'reference:failed', 'style:kept-local', 'part:created', 'animation:created']);
    expect(results.find((r) => r.kind === 'reference')!.reason).toBe('the video could not be read');
    expect(kept.map((s) => s.name)).toEqual(['From the good one']);
    expect(started).toEqual([[results.find((r) => r.kind === 'animation')!.pieceId, 'From the good one']]);
    expect((await first(target.piece(started[0][0]))).preset).toBeUndefined();
  });

  it('goes on when the server refuses the style, and lists it with the server\'s reason', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const plan = planAnimationImport(file, await readCurrentState(target, file));
    const results = await runAnimationImport(file, plan, wrap(target, { savePreset: () => throwError(() => new AnimationFailure('refused', 'rhythm: no')) }), options());
    expect(results.find((r) => r.kind === 'style')).toMatchObject({ state: 'failed', reason: 'rhythm: no' });
    expect(results.find((r) => r.kind === 'part')!.state).toBe('created');
    expect(results.find((r) => r.kind === 'animation')!.state).toBe('created');
  });

  it('lists the animation as failed with the server\'s reason when it is refused', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const plan = planAnimationImport(file, await readCurrentState(target, file));
    const results = await runAnimationImport(file, plan, wrap(target, { saveScript: () => throwError(() => new AnimationFailure('refused', 'the script must cover the whole song')) }), options());
    expect(results.find((r) => r.kind === 'animation')).toMatchObject({ state: 'failed', reason: 'the script must cover the whole song' });
    expect(results.find((r) => r.kind === 'style')!.state).toBe('created');
  });

  it('removes the piece it made when the server refuses the script or the design, and still says why', async () => {
    const file = await fileFor(fresh());
    for (const refused of [{ saveScript: () => throwError(() => new AnimationFailure('refused', 'bad script')) }, { saveDesign: () => throwError(() => new AnimationFailure('refused', 'bad design')) }]) {
      const target = fresh();
      const plan = planAnimationImport(file, await readCurrentState(target, file));
      const results = await runAnimationImport(file, plan, wrap(target, refused), options());
      expect(results.find((r) => r.kind === 'animation')).toMatchObject({ state: 'failed', reason: expect.stringMatching(/bad (script|design)/) });
      expect(await first(target.pieces())).toEqual([]);
    }
  });

  it('keeps the first reason when the piece cannot be removed either', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const plan = planAnimationImport(file, await readCurrentState(target, file));
    const results = await runAnimationImport(file, plan, wrap(target, { saveScript: () => throwError(() => new AnimationFailure('refused', 'bad script')), remove: () => throwError(() => new Error('gone wrong')) }), options());
    expect(results.find((r) => r.kind === 'animation')).toMatchObject({ state: 'failed', reason: 'bad script' });
  });

  it('puts the animation on another song, fitting its script to that song\'s map and dropping the old lines', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const songs = await first(target.songs());
    const picked = songs.find((s) => s.seconds !== file.animation.song.seconds)!;
    expect(picked).toBeTruthy();
    const { plan, results } = await importInto(target, { ...file, animation: { ...file.animation, look: undefined, parts: undefined } }, options(), picked);
    expect(plan.fitted).toBe(true);
    const made = results.find((r) => r.kind === 'animation')!;
    expect(made).toMatchObject({ state: 'created', code: 'fitted' });
    const detail = await first(target.piece(made.pieceId!));
    expect(detail.source.trackId).toBe(picked.trackId);
    expect(detail.script.pieces[0].start).toBe(0);
    expect(detail.script.pieces.at(-1)!.end).toBe(detail.songMap.duration);
    expect(detail.script.pieces.every((p) => p.lines === undefined)).toBe(true);
    expect(detail.design.design.concept).toBe('imported');
  });

  it('keeps a style in the browser when its reference does not finish in time', async () => {
    const file = await fileFor(fresh());
    const target = fresh({ analyseMs: 60_000 });
    const kept: FileStyle[] = [];
    const { results } = await importInto(target, { ...file, animation: { ...file.animation, parts: undefined } }, options(kept, { waitMs: 80, pollMs: 10 }));
    expect(results.find((r) => r.kind === 'reference')).toMatchObject({ state: 'failed', reason: 'the analysis did not finish in time' });
    expect(results.find((r) => r.kind === 'style')!.state).toBe('kept-local');
    expect(kept).toHaveLength(1);
    expect(results.find((r) => r.kind === 'animation')!.state).toBe('created');
  });

  it('stops before the next item when asked to, and leaves the rest alone', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const stop = new AbortController();
    stop.abort();
    const { results } = await importInto(target, file, options([], { signal: stop.signal }));
    expect(results.map((r) => `${r.kind}:${r.state}`)).toEqual(['song:exists', 'reference:skipped', 'style:skipped', 'part:skipped', 'animation:skipped']);
    expect(await first(target.presets())).toHaveLength((await first(fresh().presets())).length);
  });

  it('fails a style, saying the browser is full, when it cannot keep it, and still makes the animation', async () => {
    const file = await fileFor(fresh());
    const { results } = await importInto(fresh(), { ...file, animation: { ...file.animation, look: { style: { ...file.animation.look!.style!, reference: undefined } }, parts: undefined } }, { keepLocal: () => false, waitMs: 1000 });
    expect(results.find((r) => r.kind === 'style')).toMatchObject({ state: 'failed', reason: expect.stringMatching(/cannot keep/) });
    expect(results.find((r) => r.kind === 'animation')!.state).toBe('created');
  });

  it('leaves alone what the plan says cannot be done, with the planned reason, and makes no animation without its song', async () => {
    const file = await fileFor(fresh());
    const target = fresh();
    const lonely = { ...file, animation: { ...file.animation, look: undefined, parts: [{ name: 'no-text', description: 'x', text: null }], song: { ...file.animation.song, trackId: 'gone' } } };
    const before = (await first(target.pieces())).length;
    const { results } = await importInto(target, lonely, options());
    expect(results.map((r) => [r.kind, r.state, r.code])).toEqual([['song', 'skipped', 'song-missing'], ['part', 'skipped', 'part-no-text'], ['animation', 'skipped', 'song-missing']]);
    expect((await first(target.pieces())).length).toBe(before);
  });

  it('makes an exported animation again after it was deleted, with its look', async () => {
    const port = fresh();
    await first(port.loadSample());
    const mine = (await first(port.pieces()))[0];
    const withStyle = await first(port.create((await first(port.songs()))[0], { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720', presetId: (await first(port.presets()))[0].id }));
    const exported = await buildAnimationExport(port, withStyle.id);
    expect(mine).toBeTruthy();
    await first(port.remove(withStyle.id));
    const { results } = await importInto(port, exported, options());
    const made = results.find((r) => r.kind === 'animation')!;
    expect(made.state).toBe('created');
    const again = await first(port.piece(made.pieceId!));
    expect(again.preset).toBe(withStyle.preset);
    expect(again.script).toEqual(withStyle.script);
  });
});

/** The port with some calls replaced. */
function wrap(port: AnimationPort, replace: Partial<Record<keyof AnimationPort, (...a: never[]) => unknown>>): AnimationPort {
  return new Proxy(port, {
    get(target, key: string) {
      const own = replace[key as keyof AnimationPort];
      if (own) return own;
      const value = (target as unknown as Record<string, unknown>)[key];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
