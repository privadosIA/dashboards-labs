import { firstValueFrom, tap, toArray } from 'rxjs';

import { AnimationFailure, isFinished, pictureLost, type Choices, type Piece, type Song } from '@lab/animation-core';
import { InMemoryAnimation } from './in-memory.adapter';
import { defaultChoices } from './validate';

const STEP = 100;

function setup(options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) {
  let now = 1_000_000;
  const port = new InMemoryAnimation({ stepMs: STEP, pollMs: 10, now: () => now, ...options });
  return { port, tick: (ms: number) => (now += ms) };
}

const first = <T>(o: import('rxjs').Observable<T>) => firstValueFrom(o);
const songOf = async (port: InMemoryAnimation, i = 0): Promise<Song> => (await first(port.songs()))[i];
const failure = async (o: import('rxjs').Observable<unknown>): Promise<AnimationFailure> => {
  try {
    await first(o);
  } catch (e) {
    expect(e).toBeInstanceOf(AnimationFailure);
    return e as AnimationFailure;
  }
  throw new Error('it did not fail');
};

describe('InMemoryAnimation', () => {
  it('lists the songs with a version more than once and gives the catalog', async () => {
    const { port } = setup();
    const songs = await first(port.songs());
    expect(songs.filter((s) => s.project === 'demo-musica').length).toBeGreaterThan(1);
    const catalog = await first(port.catalog());
    expect(catalog.parts.length).toBeGreaterThan(0);
    expect(catalog.fonts).toContain('Inter');
  });

  it('makes a piece complete at once, shows it in the list and covers the song with its script', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    expect(piece).toMatchObject({ state: 'draft', style: 'typographic', level: 'simple', fps: 30, width: 1280, height: 720, scriptSource: 'fallback' });
    expect(piece.design.edited).toBe(false);
    const ends = piece.script.pieces;
    expect(ends[0].start).toBe(0);
    expect(ends.at(-1)!.end).toBe(piece.songMap.duration);
    ends.slice(1).forEach((p, i) => expect(p.start).toBe(ends[i].end));
    expect(await first(port.pieces())).toHaveLength(1);
    expect((await first(port.piece(piece.id))).id).toBe(piece.id);
  });

  it('refuses choices and songs it does not know, and makes nothing', async () => {
    const { port } = setup();
    const song = await songOf(port);
    const bad = { ...defaultChoices(), level: 'huge' } as unknown as Choices;
    expect((await failure(port.create(song, bad))).kind).toBe('refused');
    expect((await failure(port.create({ ...song, variant: 9 }, defaultChoices()))).reason).toMatch(/unknown/);
    expect(await first(port.pieces())).toEqual([]);
  });

  it('saves a design as the user\'s and refuses a low-contrast accent, keeping the design', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    const design = { ...piece.design.design, accent: '#ff0000' };
    const saved = await first(port.saveDesign(piece.id, design));
    expect(saved.design).toMatchObject({ source: 'user', edited: true });
    const low = await failure(port.saveDesign(piece.id, { ...design, accent: design.dark }));
    expect(low).toMatchObject({ kind: 'refused' });
    expect(low.reason).toMatch(/contrast/);
    expect((await first(port.piece(piece.id))).design.design.accent).toBe('#ff0000');
  });

  it('saves a script, and refuses an unknown part, a gap or a limit, keeping the previous one', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    const pieces = piece.script.pieces;
    const withFirst = (change: object) => ({ version: 1 as const, pieces: pieces.map((p, i) => (i ? p : { ...p, ...change })) });
    expect((await failure(port.saveScript(piece.id, withFirst({ part: 'nope' })))).reason).toMatch(/nope/);
    expect((await failure(port.saveScript(piece.id, withFirst({ end: pieces[0].end - 1 })))).reason).toMatch(/gap/);
    expect((await failure(port.saveScript(piece.id, withFirst({ part: 'parallax-cards', params: { count: 99 } })))).reason).toMatch(/count/);
    expect((await first(port.piece(piece.id))).script).toEqual(piece.script);
    const saved = await first(port.saveScript(piece.id, withFirst({ part: 'toggle', params: { label: 'hola' } })));
    expect(saved.scriptSource).toBe('user');
    expect(saved.script.pieces[0].params).toEqual({ label: 'hola' });
  });

  describe('keyframes', () => {
    const kf = (t: number, value: string | number | boolean, ease?: 'linear' | 'in' | 'out' | 'in-out' | 'step') => ({ t, value, ...(ease ? { ease } : {}) });
    async function open(options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) {
      const { port } = setup(options);
      const piece = await first(port.create(await songOf(port), defaultChoices()));
      const pieces = piece.script.pieces;
      const length = pieces[0].end - pieces[0].start;
      return { port, piece, pieces, length, save: (change: object) => port.saveScript(piece.id, { version: 1 as const, pieces: pieces.map((p, i) => (i ? p : ({ ...p, params: {}, ...change } as typeof p))) }) };
    }

    it('says in the catalog that it takes keyframes and which parameters may animate', async () => {
      const { port } = setup();
      const catalog = await first(port.catalog());
      expect(catalog.features).toEqual(['animate', 'layers', 'svg', 'plan', 'scene', 'theme', 'review']);
      const animatable = catalog.parts.flatMap((p) => p.params.filter((q) => q.animatable).map((q) => `${p.name}.${q.name}`));
      expect(animatable).toEqual(expect.arrayContaining(['counter.to', 'counter.speed', 'toggle.label', 'toggle.on']));
      expect(catalog.parts.find((p) => p.name === 'parallax-cards')?.params.some((q) => q.animatable)).toBe(false);
    });

    it('lists the parameters of the sample\'s own parts, three of them animatable', async () => {
      const { port } = setup();
      await first(port.loadSample());
      const catalog = await first(port.catalog());
      const own = catalog.parts.filter((p) => p.source === 'user');
      expect(own.map((p) => p.name).sort()).toEqual(['confetti-burst', 'pulse-ring', 'ticker-tape']);
      expect(own.flatMap((p) => p.params.filter((q) => q.animatable).map((q) => `${p.name}.${q.name}`)).sort()).toEqual(['confetti-burst.spread', 'pulse-ring.weight', 'ticker-tape.speed']);
    });

    it('saves a piece with keyframes on its part and on an extra, and gives them back as they were saved', async () => {
      const { save, length } = await open();
      const animate = { to: [kf(0, 1, 'linear'), kf(length, 100, 'out')] };
      const saved = await first(save({ part: 'counter', params: { to: 10 }, animate, with: [{ part: 'toggle', animate: { label: [kf(0, 'a', 'step'), kf(1, 'b')] } }] }));
      expect(saved.script.pieces[0].animate).toEqual(animate);
      expect(saved.script.pieces[0].with![0].animate).toEqual({ label: [kf(0, 'a', 'step'), kf(1, 'b')] });
    });

    it.each([
      ['a parameter that cannot be animated', { part: 'parallax-cards', params: { count: 3 }, animate: { count: [kf(0, 1)] } }, /count.*cannot be animated/],
      ['a parameter the part does not have', { part: 'counter', animate: { nope: [kf(0, 1)] } }, /no parameter "nope"/],
      ['no keyframe at all', { part: 'counter', animate: { to: [] } }, /no keyframe/],
      ['a keyframe before the piece', { part: 'counter', animate: { to: [kf(-1, 1)] } }, /keyframe #1.*outside the piece/],
      ['a keyframe after the piece', { part: 'counter', animate: { to: [kf(9999, 1)] } }, /outside the piece/],
      ['keyframes that do not increase', { part: 'counter', animate: { to: [kf(2, 1), kf(2, 5)] } }, /keyframe #2.*not after the one before/],
      ['an ease the server does not know', { part: 'counter', animate: { to: [kf(0, 1, 'bounce' as 'in')] } }, /ease "bounce"/],
      ['a value outside the limits', { part: 'counter', animate: { to: [kf(0, 5000)] } }, /keyframe #1 of "to" is above 999/],
      ['a fraction for a whole-number parameter', { part: 'counter', animate: { to: [kf(0, 2.5)] } }, /whole number/],
      ['a value of another type', { part: 'toggle', animate: { on: [kf(0, 'yes')] } }, /true or false/],
    ])('refuses %s, naming the piece, and keeps the script it had', async (_name, change, reason) => {
      const { port, piece, save } = await open();
      const failed = await failure(save(change));
      expect(failed.kind).toBe('refused');
      expect(failed.reason).toMatch(/^piece p1: /);
      expect(failed.reason).toMatch(reason);
      expect((await first(port.piece(piece.id))).script).toEqual(piece.script);
    });

    it('refuses keyframes on an extra that cannot take them, in the same words', async () => {
      const { save } = await open();
      expect((await failure(save({ part: 'counter', with: [{ part: 'parallax-cards', animate: { count: [kf(0, 1)] } }] }))).reason).toMatch(/"count" of "parallax-cards" cannot be animated/);
    });

    it('is a server that does not take keyframes when it says no features, and refuses them', async () => {
      const { port, save } = await open({ features: [] });
      const catalog = await first(port.catalog());
      expect(catalog.features).toEqual([]);
      expect(catalog.parts.some((p) => p.params.some((q) => q.animatable))).toBe(false);
      expect((await failure(save({ part: 'counter', animate: { to: [kf(0, 1)] } }))).reason).toMatch(/"animate" is not something the scripts of this server have/);
      // a script without keyframes is still saved
      expect((await first(save({ part: 'counter', params: { to: 3 } }))).script.pieces[0].params).toEqual({ to: 3 });
    });
  });

  describe('layers', () => {
    const item = (start: number, end: number, part = 'parallax-cards') => ({ part, start, end });

    async function open(options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) {
      const { port } = setup(options);
      const piece = await first(port.create(await songOf(port), defaultChoices()));
      const duration = piece.script.pieces[piece.script.pieces.length - 1].end;
      return { port, piece, duration, save: (layers: unknown) => port.saveScript(piece.id, { ...piece.script, layers } as never) };
    }

    it('says in the catalog that it takes layers', async () => {
      const { port } = setup();
      expect((await first(port.catalog())).features).toContain('layers');
      expect((await first(setup({ features: ['animate'] }).port.catalog())).features).toEqual(['animate']);
    });

    it('saves a script with layers, across the cuts, and gives it back as it was', async () => {
      const { save, duration } = await open();
      const layers = [{ id: 'strip', items: [item(0, duration)] }, { id: 'top', items: [{ ...item(2, 5, 'wire-sphere'), params: { detail: 12 } }] }];
      const saved = await first(save(layers));
      expect(saved.script.layers).toEqual(layers);
    });

    it.each([
      ['an id that is not allowed', () => [{ id: 'Bad Id', items: [] }], /^layer "Bad Id": the id must be lower case letters, digits and dashes, up to 24 characters$/],
      ['a repeated id', () => [{ id: 'a', items: [] }, { id: 'a', items: [] }], /^layer "a": the id is repeated$/],
      ['more than four layers', () => ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, items: [] })), /^a script may have up to 4 layers, it has 5$/],
      ['a part that is not in the catalog', (d: number) => [{ id: 'a', items: [item(0, d, 'nope')] }], /^layer "a" item #1: the part "nope" is not in the catalog$/],
      ['an item that ends before it starts', () => [{ id: 'a', items: [item(5, 5)] }], /^layer "a" item #1 ends before it starts \(5\.00 s to 5\.00 s\)$/],
      ['an item outside the song', (d: number) => [{ id: 'a', items: [item(0, d + 5)] }], /is outside the song \(0 s to /],
      ['items that overlap', () => [{ id: 'a', items: [item(0, 6), item(5, 9, 'wire-sphere')] }], /^layer "a" item #2 overlaps item #1 \(items of a layer follow one another, in order\)$/],
      ['a part its page already draws', (d: number) => [{ id: 'a', items: [item(0, d, 'toggle')] }], /the part "toggle" is drawn twice \(the main part and layer "a" item #1\)$/],
    ])('refuses %s with the server\'s words, and keeps the script it had', async (_name, make, reason) => {
      const { port, piece, duration, save } = await open();
      const failed = await failure(save(make(duration)));
      expect(failed.kind).toBe('refused');
      expect(failed.reason).toMatch(reason);
      expect((await first(port.piece(piece.id))).script).toEqual(piece.script);
    });

    it('is a server that does not take layers when it does not say so, and refuses them', async () => {
      const { save, duration } = await open({ features: ['animate'] });
      expect((await failure(save([{ id: 'a', items: [item(0, duration)] }]))).reason).toBe('"layers" is not something the scripts of this server have');
    });
  });

  it('proposes with the fixed rule, which says so and is not an error', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    const design = await first(port.propose(piece.id, { what: 'design' }));
    expect(design).toMatchObject({ what: 'design', source: 'fallback', replacements: [] });
    expect(design.piece.design.design.dark).not.toBe(piece.design.design.dark);
    const script = await first(port.propose(piece.id, { what: 'script' }));
    expect(script.piece.script.pieces.length).toBe(piece.script.pieces.length);
  });

  it('keeps the prompt a piece is made with, and a proposal that sends one replaces it', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), { ...defaultChoices(), prompt: 'a calm night' }));
    expect(piece.prompt).toBe('a calm night');
    const proposal = await first(port.propose(piece.id, { what: 'design', prompt: 'a loud day', model: 'qwen3:8b' }));
    expect(proposal.piece.prompt).toBe('a loud day');
    expect(proposal).toMatchObject({ source: 'fallback', model: 'qwen3:8b' });
    expect(proposal.fallbackReason).toContain('does not read the prompt');
    expect((await failure(port.propose(piece.id, { what: 'script', prompt: 'x'.repeat(2001) }))).kind).toBe('refused');
  });

  it('writes design and script together by the clock: waiting, writing, done, with the reason the fixed rule wrote them', async () => {
    const { port, tick } = setup({ waitMs: 300, writeMs: 500 });
    const piece = await first(port.create(await songOf(port), { ...defaultChoices(), prompt: 'a calm night' }));
    const started = await first(port.proposeAll(piece.id, { model: 'gemma4:26b' }));
    expect(started.proposal).toMatchObject({ state: 'waiting', what: 'all', model: 'gemma4:26b' });
    tick(300);
    expect((await first(port.piece(piece.id))).proposal!.state).toBe('writing');
    tick(500);
    const done = await first(port.piece(piece.id));
    expect(done.proposal).toMatchObject({ state: 'done', design: { source: 'fallback' }, script: { source: 'fallback' } });
    expect(done.proposal!.script!.reason).toContain('does not read the prompt');
    expect(done.design.design.dark).not.toBe(piece.design.design.dark);
    expect(done.scriptSource).toBe('fallback');
  });

  it('refuses to edit or to propose while a proposal is waiting or writing, as the server does, and allows it when it is done', async () => {
    const { port, tick } = setup({ waitMs: 100, writeMs: 200 });
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    await first(port.proposeAll(piece.id, {}));
    for (const call of [port.saveDesign(piece.id, piece.design.design), port.saveScript(piece.id, piece.script), port.propose(piece.id, { what: 'design' }), port.proposeAll(piece.id, {})]) {
      expect((await failure(call)).kind).toBe('busy');
    }
    tick(100);
    expect((await failure(port.saveScript(piece.id, piece.script))).kind).toBe('busy');
    tick(200);
    const saved = await first(port.saveDesign(piece.id, piece.design.design));
    expect(saved.design.edited).toBe(true);
  });

  it('follows a proposal until it is done, once for each change', async () => {
    const port = new InMemoryAnimation({ pollMs: 5, waitMs: 30, writeMs: 60 });
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    await first(port.proposeAll(piece.id, {}));
    const seen = await first(port.followProposal(piece.id).pipe(toArray()));
    expect(seen.map((p) => p.proposal!.state)).toEqual(['waiting', 'writing', 'done']);
  });

  it('lists the models of its assistant, and fails like a server with none when it has none', async () => {
    expect((await first(setup().port.assistModels())).models.map((m) => m.name)).toEqual(['qwen3:8b', 'gemma4:26b']);
    expect((await first(setup().port.assistModels())).default).toBe('qwen3:8b');
    expect((await failure(setup({ assistant: 'missing' }).port.assistModels())).kind).toBe('unavailable');
  });

  describe('writeSvg', () => {
    const SVG_MS = 5;
    const drawer = (options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) => setup({ writeMs: SVG_MS, ...options }).port;

    it('draws by a word of the description, with an id on every shape', async () => {
      const port = drawer();
      expect(await first(port.writeSvg({ text: 'a green circle' }))).toMatch(/^<svg [^>]*viewBox="0 0 1920 1080".*id="ring"/);
      expect(await first(port.writeSvg({ text: 'cinco barras' }))).toContain('id="bar-5"');
      expect(await first(port.writeSvg({ text: 'a logo', model: 'gemma4:26b' }))).toContain('id="logo"');
      expect(await first(port.writeSvg({ text: 'anything else' }))).toContain('id="square"');
    });

    it('waits writeMs and stops when unsubscribed', async () => {
      const port = drawer({ writeMs: 50 });
      const seen: string[] = [];
      port.writeSvg({ text: 'circle' }).subscribe((s) => seen.push(s)).unsubscribe();
      await new Promise((r) => setTimeout(r, 80));
      expect(seen).toEqual([]);
    });

    it('refuses an empty text, one over the limit and an answer that is not an SVG, with the server words', async () => {
      const port = drawer();
      expect((await failure(port.writeSvg({ text: '   ' }))).kind).toBe('refused');
      const long = await failure(port.writeSvg({ text: 'x'.repeat(2001) }));
      expect(long.kind).toBe('refused');
      expect(long.reason).toMatch(/2000/);
      expect(await first(port.writeSvg({ text: 'x'.repeat(2000) }))).toContain('<svg');
      expect((await failure(port.writeSvg({ text: 'notsvg' }))).reason).toMatch(/no <svg>/);
    });

    it('is unavailable with no assistant, for a model that is not installed and on a server without the feature', async () => {
      expect((await failure(drawer({ assistant: 'missing' }).writeSvg({ text: 'circle' }))).kind).toBe('unavailable');
      expect((await failure(drawer().writeSvg({ text: 'circle', model: 'nope:1b' }))).kind).toBe('unavailable');
      expect((await failure(drawer({ features: ['animate', 'layers'] }).writeSvg({ text: 'circle' }))).kind).toBe('unavailable');
    });

    it('lists the feature in its catalog by default', async () => {
      expect((await first(drawer().catalog())).features).toContain('svg');
    });
  });

  it('draws by the clock: queued, running, then done with a video; and refuses to change a piece meanwhile', async () => {
    const { port, tick } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    const estimate = await first(port.render(piece.id));
    expect(estimate.seconds).toBeGreaterThan(0);
    expect((await first(port.piece(piece.id))).state).toBe('queued');
    tick(STEP * 3);
    const running = await first(port.piece(piece.id));
    expect(running.state).toBe('running');
    expect(running.progress).toBeGreaterThan(0);
    for (const call of [port.render(piece.id), port.saveDesign(piece.id, piece.design.design), port.saveScript(piece.id, piece.script), port.propose(piece.id, { what: 'script' }), port.remove(piece.id)]) {
      expect((await failure(call)).kind).toBe('busy');
    }
    tick(STEP * 20);
    const done = await first(port.piece(piece.id));
    expect(done).toMatchObject({ state: 'done', progress: 100 });
    expect(done.video).toMatch(/\.mp4$/);
    expect(done.sizeBytes).toBeGreaterThan(0);
  });

  it('follows a piece until it finishes and then stops', async () => {
    const { port, tick } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    await first(port.render(piece.id));
    // The clock moves on each time the piece is read, so the states go by one after another.
    const seen = await firstValueFrom(port.follow(piece.id).pipe(tap(() => tick(STEP * 2)), toArray()));
    const states = seen.map((p: Piece) => p.state);
    expect(states[0]).toBe('queued');
    expect(states).toContain('running');
    expect(states.at(-1)).toBe('done');
    expect(isFinished(seen.at(-1)!)).toBe(true);
    expect(states.filter((s) => s === 'done')).toHaveLength(1);
  });

  it('removes a piece, and the list and a later read forget it', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    await first(port.remove(piece.id));
    expect(await first(port.pieces())).toEqual([]);
    expect((await failure(port.piece(piece.id))).kind).toBe('missing');
  });

  it('keeps its pieces in the storage it is given, for the reload a change of language causes', async () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
    const a = setup({ storage });
    const piece = await first(a.port.create(await songOf(a.port), defaultChoices()));
    const b = setup({ storage });
    expect((await first(b.port.pieces())).map((p) => p.id)).toEqual([piece.id]);
    const next = await first(b.port.create(await songOf(b.port), defaultChoices()));
    expect(next.id).not.toBe(piece.id);
  });

  describe('hearing the words', () => {
    const made = async (options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}, i = 0, choices: Choices = defaultChoices()) => {
      const { port, tick } = setup({ transcribeMs: 0, ...options });
      return { port, tick, piece: await first(port.create(await songOf(port, i), choices)) };
    };

    it('makes the words stop being estimated, and makes the script again when nobody edited it', async () => {
      const { port, piece } = await made();
      expect(piece.songMap.wordsEstimated).toBe(true);
      const heard = await first(port.transcribe(piece.id));
      expect(heard.songMap.wordsEstimated).toBe(false);
      expect(heard.scriptWarning).toBeUndefined();
    });

    it('keeps an edited script and warns about it', async () => {
      const { port, piece } = await made();
      await first(port.saveScript(piece.id, piece.script));
      const heard = await first(port.transcribe(piece.id));
      expect(heard.scriptSource).toBe('user');
      expect(heard.scriptWarning).toMatch(/kept/);
    });

    it('answers the piece as it was with a notice when the song has no words', async () => {
      const { port, piece } = await made({}, 1);
      const heard = await first(port.transcribe(piece.id));
      expect(heard.notice).toMatch(/no words|has none/);
      expect(heard.songMap).toEqual(piece.songMap);
    });

    it('is refused without Whisper, while the piece is drawn, and for a piece that is gone', async () => {
      expect((await failure((await made({ whisper: 'missing' })).port.transcribe('x'))).kind).toBe('missing');
      const a = await made({ whisper: 'missing' });
      expect((await failure(a.port.transcribe(a.piece.id))).kind).toBe('unavailable');
      const b = await made();
      await first(b.port.render(b.piece.id));
      expect((await failure(b.port.transcribe(b.piece.id))).kind).toBe('busy');
    });

    it('can be asked for when the piece is made, and says why when it cannot be done', async () => {
      const heard = await made({}, 0, { ...defaultChoices(), hearWords: true });
      expect(heard.piece.songMap.wordsEstimated).toBe(false);
      const refused = await made({ whisper: 'missing' }, 0, { ...defaultChoices(), hearWords: true });
      expect(refused.piece.songMap.wordsEstimated).toBe(true);
      expect(refused.piece.notice).toMatch(/whisper/i);
    });

    it('does not keep the notice after a reload of the piece', async () => {
      const { port, piece } = await made({ whisper: 'missing' }, 0, { ...defaultChoices(), hearWords: true });
      expect((await first(port.piece(piece.id))).notice).toBeUndefined();
    });
  });

  it('keeps the extra parts, the design of a piece and an unknown field of a script it saves', async () => {
    const { port } = setup();
    const piece = await first(port.create(await songOf(port), defaultChoices()));
    const first1 = piece.script.pieces[0];
    const extra = { ...piece.script, pieces: [{ ...first1, with: [{ part: 'counter', params: { to: 5, speed: 1.5 } }], design: { accent: '#ff5a3c' }, future: 1 } as never, ...piece.script.pieces.slice(1)] };
    const saved = await first(port.saveScript(piece.id, extra));
    expect(saved.script.pieces[0]).toMatchObject({ with: [{ part: 'counter' }], design: { accent: '#ff5a3c' }, future: 1 });
    expect((await first(port.piece(piece.id))).script).toEqual(extra);
  });

  describe('references and presets', () => {
    const address = 'https://www.youtube.com/watch?v=abc';
    const ready = async (url = address) => {
      const env = setup({ analyseMs: 100 });
      const added = await first(env.port.addReference({ url, tags: ['pop'] }));
      env.tick(150);
      return { ...env, added };
    };

    it('adds a reference as analysing and, when its time has passed, it is ready with an analysis', async () => {
      const { port, tick } = setup({ analyseMs: 100 });
      const added = await first(port.addReference({ url: address, title: 'Mine', tags: ['pop'] }));
      expect(added).toMatchObject({ state: 'analysing', title: 'Mine', tags: ['pop'] });
      expect('analysis' in added).toBe(false);
      tick(150);
      const now = await first(port.reference(added.id));
      expect(now.state).toBe('ready');
      expect(now.analysis!.frames.length).toBeGreaterThan(0);
      expect(now.analysis!.colours).toHaveLength(5);
      expect(now.analysis!.description).toBeTruthy();
    });

    it('refuses what the server refuses and adds nothing: not YouTube, too long, not a video', async () => {
      const { port } = setup();
      expect((await failure(port.addReference({ url: 'https://example.com/v' }))).reason).toMatch(/YouTube/);
      expect((await failure(port.addReference({ url: 'https://youtu.be/long' }))).reason).toMatch(/20 minutes/);
      expect((await failure(port.addReference({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) }))).reason).toMatch(/not a video/);
      expect(await first(port.references())).toEqual([]);
    });

    it('has one analysed with no description (and says why) and one that fails', async () => {
      const a = await ready('https://youtu.be/nodesc');
      const noDesc = await first(a.port.reference(a.added.id));
      expect(noDesc.analysis!.description).toBeUndefined();
      expect(noDesc.analysis!.descriptionNote).toBeTruthy();
      const b = await ready('https://youtu.be/broken');
      const failed = await first(b.port.reference(b.added.id));
      expect(failed).toMatchObject({ state: 'failed' });
      expect(failed.error).toBeTruthy();
    });

    it('edits the title, the notes and the tags, refuses a title that is empty, and removes', async () => {
      const { port, added } = await ready();
      const edited = await first(port.editReference(added.id, { title: ' New ', tags: ['a', 'b'] }));
      expect(edited).toMatchObject({ title: 'New', tags: ['a', 'b'] });
      expect((await failure(port.editReference(added.id, { title: '  ' }))).kind).toBe('refused');
      await first(port.removeReference(added.id));
      expect((await failure(port.reference(added.id))).kind).toBe('missing');
    });

    it('makes a preset only from a ready reference', async () => {
      const { port, tick } = setup({ analyseMs: 100 });
      const added = await first(port.addReference({ url: address }));
      expect((await failure(port.makePreset(added.id))).reason).toMatch(/not ready/);
      expect((await failure(port.makePreset('nope'))).reason).toMatch(/does not exist/);
      tick(150);
      const preset = await first(port.makePreset(added.id, ' Warm '));
      expect(preset).toMatchObject({ name: 'Warm', referenceId: added.id, parts: [] });
      expect(preset.rhythm).toBeGreaterThanOrEqual(2);
      expect(preset.rhythm).toBeLessThanOrEqual(15);
      expect((await first(port.presets())).map((p) => p.id)).toEqual([preset.id]);
    });

    it('saves a preset as a whole and refuses with the field in the reason', async () => {
      const { port, added } = await ready();
      const preset = await first(port.makePreset(added.id));
      const saved = await first(port.savePreset(preset.id, { name: 'X', design: preset.design, rhythm: 9, parts: ['toggle'] }));
      expect(saved).toMatchObject({ name: 'X', rhythm: 9, parts: ['toggle'] });
      expect((await failure(port.savePreset(preset.id, { name: 'X', design: preset.design, rhythm: 1, parts: [] }))).reason).toMatch(/^rhythm/);
      expect((await failure(port.savePreset(preset.id, { name: 'X', design: { ...preset.design, accent: '#101018' }, rhythm: 5, parts: [] }))).reason).toMatch(/^design\.accent/);
      expect((await failure(port.savePreset(preset.id, { name: 'X', design: preset.design, rhythm: 5, parts: ['toggle', 'nope'] }))).reason).toMatch(/^parts\[1\]/);
    });

    it('keeps a preset when its reference is removed', async () => {
      const { port, added } = await ready();
      const preset = await first(port.makePreset(added.id));
      await first(port.removeReference(added.id));
      expect((await first(port.preset(preset.id))).referenceId).toBe(added.id);
      await first(port.removePreset(preset.id));
      expect((await failure(port.preset(preset.id))).kind).toBe('missing');
    });

    it('makes a piece from a preset: its design starts as the preset\'s and the piece says which; an unknown preset is refused', async () => {
      const { port, added } = await ready();
      const preset = await first(port.makePreset(added.id));
      const piece = await first(port.create(await songOf(port), { ...defaultChoices(), presetId: preset.id }));
      expect(piece.preset).toBe(preset.id);
      expect(piece.design.design.accent).toBe(preset.design.accent);
      expect((await failure(port.create(await songOf(port), { ...defaultChoices(), presetId: 'nope' }))).kind).toBe('refused');
    });

    it('keeps the references and presets in the storage it is given', async () => {
      const saved = new Map<string, string>();
      const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
      const a = setup({ storage, analyseMs: 100 });
      const added = await first(a.port.addReference({ url: address }));
      a.tick(150);
      const preset = await first(a.port.makePreset(added.id));
      const b = setup({ storage });
      expect((await first(b.port.references())).map((r) => r.id)).toEqual([added.id]);
      expect((await first(b.port.presets())).map((p) => p.id)).toEqual([preset.id]);
    });
  });

  describe('learning from a reference', () => {
    const address = 'https://www.youtube.com/watch?v=abc';
    const readyRef = async (url = address) => {
      const env = setup({ analyseMs: 100, writeMs: 200 });
      const added = await first(env.port.addReference({ url }));
      env.tick(150);
      return { ...env, added };
    };

    it('starts running, ends ready after its time, and lists what it kept: a style and a draft for each idea that is different enough', async () => {
      const { port, tick, added } = await readyRef();
      const started = await first(port.learn(added.id));
      expect(started).toMatchObject({ referenceId: added.id, state: 'running', strictness: 'normal' });
      expect(started.styles).toEqual([]);
      tick(250);
      const done = await first(port.learning(started.id));
      expect(done.state).toBe('ready');
      expect(done.styles.map((s) => [s.name, s.novel, s.state])).toEqual([['Video 1 (learned)', true, 'ready']]);
      expect(done.partDrafts.map((d) => d.name)).toEqual(['a strip of colour swatches that scrolls', 'a title that flickers like a neon sign']);
      expect(done.discarded).toHaveLength(1);
      expect(done.discarded[0]).toMatchObject({ kind: 'part', similarTo: { kind: 'part', name: 'counter' } });
      expect(done.discarded[0].reason).toMatch(/too similar/);
      // the style is a style and the drafts are drafts: they show in their own lists, nothing is in the catalog
      expect((await first(port.presets())).map((p) => p.name)).toContain('Video 1 (learned)');
      expect((await first(port.drafts())).map((d) => d.request)).toContain('a title that flickers like a neon sign');
      expect((await first(port.catalog())).parts.map((p) => p.name)).not.toContain('part-1');
    });

    it('a stricter learning keeps no more than a looser one', async () => {
      const { port, tick, added } = await readyRef();
      const low = await first(port.learn(added.id, 'low'));
      tick(250);
      const high = await first(port.learn(added.id, 'high'));
      tick(250);
      const a = await first(port.learning(low.id));
      const b = await first(port.learning(high.id));
      expect(a.partDrafts.length).toBeGreaterThanOrEqual(b.partDrafts.length);
      expect(b.discarded.length).toBeGreaterThanOrEqual(a.discarded.length);
    });

    it('answers with the learning that is already running instead of starting another', async () => {
      const { port, added } = await readyRef();
      const one = await first(port.learn(added.id));
      const two = await first(port.learn(added.id, 'high'));
      expect(two.id).toBe(one.id);
      expect(await first(port.learnings(added.id))).toHaveLength(1);
    });

    it('drops the style when the reference already has one, saying which', async () => {
      const { port, tick, added } = await readyRef();
      const preset = await first(port.makePreset(added.id, 'Mine'));
      const l = await first(port.learn(added.id));
      tick(250);
      const done = await first(port.learning(l.id));
      expect(done.styles).toEqual([]);
      expect(done.discarded.find((d) => d.kind === 'style')).toMatchObject({ similarTo: { kind: 'style', id: preset.id, name: 'Mine' } });
    });

    it('says what it could not do without a vision model, and makes no part', async () => {
      const { port, tick, added } = await readyRef('https://youtu.be/nodesc');
      const l = await first(port.learn(added.id));
      tick(250);
      const done = await first(port.learning(l.id));
      expect(done.partDrafts).toEqual([]);
      expect(done.skipped).toEqual([{ what: 'parts', reason: 'there is no vision model to describe the video' }]);
    });

    it('shows an item that no longer exists as gone, and a draft still being written as writing', async () => {
      const { port, tick, added } = await readyRef();
      const l = await first(port.learn(added.id));
      tick(210);
      const early = await first(port.learning(l.id));
      expect(early.partDrafts.map((d) => d.state)).not.toContain('gone');
      await first(port.removePreset(early.styles[0].id));
      await first(port.removeDraft(early.partDrafts[0].id));
      const later = await first(port.learning(l.id));
      expect(later.styles[0].state).toBe('gone');
      expect(later.partDrafts[0].state).toBe('gone');
    });

    it('refuses like the server: a reference that is not ready is busy, a missing one is missing, an unknown strictness is refused', async () => {
      const { port, tick } = setup({ analyseMs: 100 });
      const added = await first(port.addReference({ url: address }));
      expect((await failure(port.learn(added.id))).kind).toBe('busy');
      tick(150);
      expect((await failure(port.learn('nope'))).kind).toBe('missing');
      expect((await failure(port.learn(added.id, 'extreme' as never))).kind).toBe('refused');
      expect((await failure(port.learning('nope'))).kind).toBe('missing');
    });

    it('lists the learnings newest first, of one reference when it is given', async () => {
      const { port, tick, added } = await readyRef();
      const a = await first(port.learn(added.id));
      tick(250);
      const b = await first(port.learn(added.id));
      expect((await first(port.learnings(added.id))).map((l) => l.id)).toEqual([b.id, a.id]);
      expect(await first(port.learnings('other'))).toEqual([]);
    });
  });

  describe('part drafts', () => {
    const picture = { referenceId: 'ref-1', frame: '03.jpg' };
    const written = async (request: string, extra: object = {}) => {
      const env = setup({ writeMs: 100 });
      const draft = await first(env.port.askDraft({ request, ...extra }));
      env.tick(150);
      return { ...env, draft };
    };

    it('keeps the model that writes the part, and refuses one that is not installed naming the installed ones', async () => {
      const { port } = setup({ writeMs: 100 });
      expect((await first(port.askDraft({ request: 'a clock', model: 'gemma4:26b' }))).model).toBe('gemma4:26b');
      expect('model' in (await first(port.askDraft({ request: 'a clock' })))).toBe(false);
      const refused = await failure(port.askDraft({ request: 'a clock', model: 'nope:1b' }));
      expect(refused.kind).toBe('refused');
      expect(refused.reason).toContain('nope:1b');
      expect(refused.reason).toContain('qwen3:8b');
      expect((await first(port.drafts())).length).toBe(2);
    });

    it('asks for a part with a phrase only, and it is writing until its time has passed and then ready with a name and its text', async () => {
      const { port, tick } = setup({ writeMs: 100 });
      const draft = await first(port.askDraft({ request: ' a clock ' }));
      expect(draft).toMatchObject({ state: 'writing', request: 'a clock', withPicture: false, attempts: 1, preview: [] });
      expect('description' in draft).toBe(false);
      tick(150);
      const now = await first(port.draft(draft.id));
      expect(now.state).toBe('ready');
      expect(now.name).toBeTruthy();
      expect(JSON.parse(now.manifest!).name).toBe(now.name);
      expect(now.fragment).toBeTruthy();
      expect(now.preview.length).toBeGreaterThan(0);
      expect('manifest' in (await first(port.drafts()))[0]).toBe(false);
    });

    it('asks with a frame of a reference or an uploaded file, and says where the picture came from and what was seen in it', async () => {
      const byFrame = await written('a clock', picture);
      const read = await first(byFrame.port.draft(byFrame.draft.id));
      expect(read).toMatchObject({ withPicture: true, source: 'reference:ref-1/03.jpg' });
      expect(read.description).toBeTruthy();
      const byFile = await written('a clock', { file: new File(['x'], 'p.png', { type: 'image/png' }) });
      expect((await first(byFile.port.draft(byFile.draft.id))).source).toBe('upload');
    });

    it('refuses what the server refuses and adds nothing: a bad phrase, a bad picture, a run that is active, no Chrome', async () => {
      const { port } = setup();
      expect((await failure(port.askDraft({ request: '' }))).kind).toBe('refused');
      expect((await failure(port.askDraft({ request: 'x', file: new File(['x'], 'p.gif', { type: 'image/gif' }) }))).kind).toBe('refused');
      expect((await failure(port.askDraft({ request: 'a busy one' }))).kind).toBe('busy');
      expect((await failure(port.askDraft({ request: 'nochrome' }))).kind).toBe('unavailable');
      expect(await first(port.drafts())).toEqual([]);
    });

    it('fails by the age check when the phrase says so and there is a picture: no retry; with no picture the same words are written', async () => {
      const { port, draft } = await written('a minor with a clock', picture);
      const failed = await first(port.draft(draft.id));
      expect(failed.state).toBe('failed');
      expect(pictureLost(failed)).toBe(true);
      expect((await failure(port.retryDraft(draft.id))).reason).toMatch(/not kept/);
      const plain = await written('a minor with a clock');
      expect((await first(plain.port.draft(plain.draft.id))).state).toBe('ready');
    });

    it('retries a failed draft: it is writing again with one more attempt, and it ends ready', async () => {
      const { port, tick, draft } = await written('this will fail');
      const failed = await first(port.draft(draft.id));
      expect(failed).toMatchObject({ state: 'failed', attempts: 1 });
      expect(pictureLost(failed)).toBe(false);
      const again = await first(port.retryDraft(draft.id));
      expect(again).toMatchObject({ state: 'writing', attempts: 2 });
      tick(150);
      expect((await first(port.draft(draft.id))).state).toBe('ready');
      expect((await failure(port.retryDraft(draft.id))).reason).toMatch(/not failed/);
    });

    it('saves the text and refuses it with the problems listed, one to a line, leaving the draft as it was', async () => {
      const { port, draft } = await written('a clock');
      const text = await first(port.draft(draft.id));
      const bad = await failure(port.saveDraft(draft.id, { manifest: 'not json', fragment: '' }));
      expect(bad.kind).toBe('refused');
      expect(bad.reason.split('\n')).toHaveLength(2);
      expect((await failure(port.saveDraft(draft.id, { manifest: text.manifest!, fragment: '<div style="transition: all 1s"></div>' }))).reason).toMatch(/transitions/);
      expect((await first(port.draft(draft.id))).fragment).toBe(text.fragment);
      const renamed = JSON.stringify({ name: 'my-clock' });
      const saved = await first(port.saveDraft(draft.id, { manifest: renamed, fragment: '<div>ok</div>' }));
      expect(saved).toMatchObject({ name: 'my-clock', fragment: '<div>ok</div>' });
    });

    it('has a draft that is refused once for problems and accepted when it is changed', async () => {
      const { port, draft } = await written('this has problems');
      const text = await first(port.draft(draft.id));
      expect((await failure(port.saveDraft(draft.id, { manifest: text.manifest!, fragment: text.fragment! }))).reason).toMatch(/draws nothing/);
      expect((await first(port.saveDraft(draft.id, { manifest: text.manifest!, fragment: '<div>moving</div>' }))).state).toBe('ready');
    });

    it('does not save or approve a draft that is being written, nor approve one that failed', async () => {
      const { port } = setup({ writeMs: 100 });
      const draft = await first(port.askDraft({ request: 'a clock' }));
      expect((await failure(port.saveDraft(draft.id, { manifest: '{"name":"x"}', fragment: 'x' }))).kind).toBe('busy');
      expect((await failure(port.approveDraft(draft.id))).reason).toMatch(/not ready/);
    });

    it('approves a ready draft: the part comes back, is in the catalog from then on, and the draft is gone', async () => {
      const { port, draft } = await written('a ticking clock');
      const name = (await first(port.draft(draft.id))).name!;
      expect((await first(port.catalog())).parts.map((p) => p.name)).not.toContain(name);
      const part = await first(port.approveDraft(draft.id));
      expect(part.name).toBe(name);
      expect((await first(port.catalog())).parts.map((p) => p.name)).toContain(name);
      expect(await first(port.drafts())).toEqual([]);
      expect((await failure(port.draft(draft.id))).kind).toBe('missing');
    });

    it('says a name is taken when it is in the catalog, keeps the draft, and lets the name be changed by editing it', async () => {
      const { port, draft } = await written('a clash of names');
      const taken = await failure(port.approveDraft(draft.id));
      expect(taken.kind).toBe('busy');
      expect(taken.reason).toMatch(/already exists/);
      expect((await first(port.draft(draft.id))).state).toBe('ready');
      const text = await first(port.draft(draft.id));
      await first(port.saveDraft(draft.id, { manifest: JSON.stringify({ name: 'new-clock' }), fragment: text.fragment! }));
      expect((await first(port.approveDraft(draft.id))).name).toBe('new-clock');
    });

    it('lets a script use a part that was approved', async () => {
      const { port, draft } = await written('a ticking clock');
      const name = (await first(port.draft(draft.id))).name!;
      await first(port.approveDraft(draft.id));
      const piece = await first(port.create(await songOf(port), defaultChoices()));
      const script = { ...piece.script, pieces: piece.script.pieces.map((p, k) => (k === 0 ? { ...p, part: name, params: {} } : p)) };
      expect((await first(port.saveScript(piece.id, script))).script.pieces[0].part).toBe(name);
    });

    describe('a change asked for with a base text', () => {
      const base = { manifest: JSON.stringify({ name: 'bars', description: 'A bar', params: [] }), fragment: '<div>moving</div>' };

      it('writes a draft from the text given: the name is kept and said to be replaced, the text is changed, and it ends ready', async () => {
        const { port, tick } = setup({ writeMs: 100 });
        const asked = await first(port.askDraft({ request: 'make the bars blue', base }));
        expect(asked).toMatchObject({ state: 'writing', replaces: 'bars' });
        tick(150);
        const done = await first(port.draft(asked.id));
        expect(done).toMatchObject({ state: 'ready', name: 'bars', replaces: 'bars' });
        expect(done.manifest).toContain('make the bars blue');
        expect(done.fragment).toContain('<div>moving</div>');
        expect(done.fragment).not.toBe(base.fragment);
      });

      it('may keep a name that is in the catalog, and approving is still refused for it', async () => {
        const { port, tick } = setup({ writeMs: 100 });
        const asked = await first(port.askDraft({ request: 'bigger', base: { ...base, manifest: JSON.stringify({ name: 'toggle' }) } }));
        tick(150);
        expect((await first(port.draft(asked.id))).name).toBe('toggle');
        expect((await failure(port.approveDraft(asked.id))).kind).toBe('busy');
      });

      it('refuses a text with no name or an empty fragment, and a text that comes with a picture', async () => {
        const { port } = setup();
        expect((await failure(port.askDraft({ request: 'x', base: { manifest: '{}', fragment: '<p></p>' } }))).kind).toBe('refused');
        expect((await failure(port.askDraft({ request: 'x', base: { ...base, fragment: ' ' } }))).kind).toBe('refused');
        expect((await failure(port.askDraft({ request: 'x', base, file: new File(['x'], 'p.png', { type: 'image/png' }) }))).kind).toBe('refused');
        expect(await first(port.drafts())).toEqual([]);
      });
    });

    describe('parts of the user\'s: from a text, replaced and deleted', () => {
      const text = (name: string, fragment = '<div>moving</div>') => ({ manifest: JSON.stringify({ name, description: 'A bar', params: [] }), fragment });
      const approved = async (port: InMemoryAnimation, name: string) => first(port.approveDraft((await first(port.createDraftFromText(text(name)))).id));

      it('makes a draft from a text with no assistant: ready at once with its text, approved like any', async () => {
        const { port } = setup();
        const made = await first(port.createDraftFromText(text('bars')));
        expect(made).toMatchObject({ state: 'ready', name: 'bars', problems: [] });
        expect(JSON.parse(made.manifest!).name).toBe('bars');
        expect((await first(port.drafts())).map((d) => d.id)).toContain(made.id);
        expect((await first(port.approveDraft(made.id))).name).toBe('bars');
        expect(await first(port.partText('bars'))).toMatchObject({ fragment: '<div>moving</div>' });
      });

      it('fails a draft whose text does not pass with the problems and both files; saving a fixed text makes it ready; it is not retried', async () => {
        const { port } = setup();
        const bad = await first(port.createDraftFromText({ manifest: 'not json', fragment: '' }));
        expect(bad.state).toBe('failed');
        expect(bad.problems).toHaveLength(2);
        expect(bad).toMatchObject({ manifest: 'not json', fragment: '' });
        expect((await failure(port.retryDraft(bad.id))).reason).toMatch(/edit it and save/);
        const taken = await first(port.createDraftFromText(text('toggle')));
        expect(taken.state).toBe('failed');
        expect(taken.problems.join('\n')).toMatch(/already exists/);
        const fixed = await first(port.saveDraft(bad.id, text('fixed')));
        expect(fixed).toMatchObject({ state: 'ready', name: 'fixed', problems: [] });
      });

      it('replaces an approved part: the catalog and its text are the new ones, and a text with problems or another name changes nothing', async () => {
        const { port } = setup();
        await approved(port, 'bars');
        const part = await first(port.replacePart('bars', { manifest: JSON.stringify({ name: 'bars', description: 'Better bars', params: [] }), fragment: '<div>v2</div>' }));
        expect(part).toMatchObject({ name: 'bars', description: 'Better bars', source: 'user' });
        expect((await first(port.catalog())).parts.find((p) => p.name === 'bars')!.description).toBe('Better bars');
        expect((await first(port.partText('bars'))).fragment).toBe('<div>v2</div>');
        expect((await failure(port.replacePart('bars', text('other')))).reason).toMatch(/must stay "bars"/);
        expect((await failure(port.replacePart('bars', { manifest: 'not json', fragment: '' }))).kind).toBe('refused');
        expect((await first(port.partText('bars'))).fragment).toBe('<div>v2</div>');
      });

      it('refuses to replace or delete a part that comes with the program or does not exist', async () => {
        const { port } = setup();
        expect((await failure(port.replacePart('toggle', text('toggle')))).kind).toBe('busy');
        expect((await failure(port.removePart('toggle'))).kind).toBe('busy');
        expect((await failure(port.replacePart('nothing', text('nothing')))).kind).toBe('missing');
        expect((await failure(port.removePart('nothing'))).kind).toBe('missing');
      });

      it('deletes an approved part; one that a piece or a style uses is refused naming it unless forced', async () => {
        const { port } = setup();
        await approved(port, 'bars');
        await approved(port, 'dots');
        const piece = await first(port.create(await songOf(port), defaultChoices()));
        await first(port.saveScript(piece.id, { ...piece.script, pieces: piece.script.pieces.map((p, k) => (k === 0 ? { ...p, part: 'bars', params: {} } : p)) }));
        const refused = await failure(port.removePart('bars'));
        expect(refused.kind).toBe('busy');
        expect(refused.reason).toContain(`piece ${piece.id}`);
        expect((await first(port.catalog())).parts.map((p) => p.name)).toContain('bars');
        await first(port.removePart('bars', true));
        expect((await first(port.catalog())).parts.map((p) => p.name)).not.toContain('bars');
        expect((await failure(port.partText('bars'))).kind).toBe('missing');
        await first(port.removePart('dots'));
        expect((await failure(port.removePart('dots'))).kind).toBe('missing');
      });
    });

    it('removes a draft, and keeps drafts and approved parts in the storage it is given', async () => {
      const saved = new Map<string, string>();
      const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
      const a = setup({ storage, writeMs: 100 });
      const kept = await first(a.port.askDraft({ request: 'one' }));
      const gone = await first(a.port.askDraft({ request: 'two' }));
      await first(a.port.removeDraft(gone.id));
      a.tick(150);
      const approved = await first(a.port.askDraft({ request: 'three' }));
      a.tick(150);
      const name = (await first(a.port.draft(approved.id))).name!;
      await first(a.port.approveDraft(approved.id));
      const b = setup({ storage });
      expect((await first(b.port.drafts())).map((d) => d.id)).toEqual([kept.id]);
      expect((await first(b.port.catalog())).parts.map((p) => p.name)).toContain(name);
    });
  });

  describe('the text of a part', () => {
    it('answers the sample\'s own parts once it is loaded, and an approved draft, and says missing for the rest', async () => {
      const { port, tick } = setup();
      expect((await failure(port.partText('pulse-ring'))).kind).toBe('missing');
      await first(port.loadSample());
      const text = await first(port.partText('pulse-ring'));
      expect(text.name).toBe('pulse-ring');
      expect(JSON.parse(text.manifest)).toMatchObject({ name: 'pulse-ring', version: 1 });
      expect(text.fragment).toContain('__partSeek');
      expect((await failure(port.partText('toggle'))).kind).toBe('missing');
      expect((await failure(port.partText('no-such-part'))).kind).toBe('missing');

      const draft = await first(port.askDraft({ request: 'a ticking clock' }));
      tick(5000);
      const ready = await first(port.draft(draft.id));
      await first(port.approveDraft(draft.id));
      expect((await first(port.partText(ready.name!))).fragment).toBe(ready.fragment);
    });

    it('keeps the text of the parts across a reload, like the rest of what it holds', async () => {
      const kept = new Map<string, string>();
      const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
      const before = setup({ storage }).port;
      await first(before.loadSample());
      const reloaded = setup({ storage }).port;
      expect((await first(reloaded.partText('pulse-ring'))).fragment).toContain('__partSeek');
    });

    it('gives its song maps the first beat number and a found grid', async () => {
      const { port } = setup();
      const piece = await first(port.create(await songOf(port), defaultChoices()));
      expect(piece.songMap).toMatchObject({ beatBase: 0, gridAnchored: true });
    });

    it('gives the sample song the address of the sample video as its audio, and no other song', async () => {
      const { port } = setup();
      await first(port.loadSample());
      const songs = await first(port.songs());
      const sample = songs.find((s) => s.project === 'sample-beat' && s.variant === 0)!;
      expect(sample.audio).toBe('samples/music-motion/sample.mp4');
      expect(songs.find((s) => s.project === 'demo-musica')!.audio).toBeUndefined();
    });
  });

  describe('planning from one sentence', () => {
    it('lists plan in its features and plans without creating anything: the choices are in its catalog and the parts say whether the catalog has them', async () => {
      const { port } = setup({ writeMs: 1 });
      const catalog = await first(port.catalog());
      expect(catalog.features).toContain('plan');
      const before = (await first(port.pieces())).length;
      const plan = await first(port.plan({ text: 'a neon synthwave track about driving, 45 seconds, illustrated, light, 60 fps, with counter and year-ticker' }));
      expect(plan.song).toMatchObject({ seconds: 45, instrumental: false });
      expect(plan.song.title).toBe('a neon synthwave track about driving,');
      expect(plan.animation).toMatchObject({ style: 'illustrated', mode: 'light', fps: 60, prompt: expect.stringContaining('neon synthwave') });
      expect(catalog.styles).toContain(plan.animation.style);
      expect(plan.parts).toEqual([{ name: 'counter', exists: true }, { name: 'year-ticker', exists: false, request: 'a part that draws year ticker' }]);
      expect(plan.warnings).toEqual([]);
      expect((await first(port.pieces())).length).toBe(before);
    });

    it('warns when the sentence names no length, and keeps the defaults of the catalog', async () => {
      const { port } = setup({ writeMs: 1 });
      const plan = await first(port.plan({ text: 'a calm instrumental piece' }));
      expect(plan.song).toMatchObject({ seconds: 0, instrumental: true, lyrics: '' });
      expect(plan.animation).toMatchObject({ style: 'typographic', level: 'simple', fps: 30, mode: 'dark' });
      expect(plan.warnings).toHaveLength(1);
    });

    it('fails like the server: empty or long sentence refused, a missing assistant or feature unavailable, a busy run, a refusal', async () => {
      const { port } = setup({ writeMs: 1 });
      expect((await failure(port.plan({ text: '   ' }))).kind).toBe('refused');
      expect((await failure(port.plan({ text: 'x'.repeat(2001) }))).kind).toBe('refused');
      expect((await failure(port.plan({ text: 'busy now' }))).kind).toBe('busy');
      expect((await failure(port.plan({ text: 'please refuse' }))).kind).toBe('refused');
      expect((await failure(port.plan({ text: 'x', model: 'nope' }))).kind).toBe('unavailable');
      expect((await failure(setup({ assistant: 'missing' }).port.plan({ text: 'x' }))).kind).toBe('unavailable');
      const without = setup({ features: ['animate'] }).port;
      expect((await first(without.catalog())).features).not.toContain('plan');
      expect((await failure(without.plan({ text: 'x' }))).kind).toBe('unavailable');
    });
  });

  it('accepts the provider of a proposal or a draft and ignores it: there is no assistant behind the in-memory adapter', async () => {
    const { port } = setup();
    await first(port.loadSample());
    const proposal = await first(port.propose('sample-piece', { what: 'design', provider: 'router', model: 'x' }));
    expect(proposal.source).toBe('fallback');
    expect(proposal.provider).toBeUndefined();
    expect((await first(port.askDraft({ request: 'a clock', provider: 'router' }))).provider).toBeUndefined();
  });

  describe('the dataset', () => {
    it('is not there until it is loaded, and then fills every screen: songs, pieces in three states, references, styles and parts', async () => {
      const { port } = setup();
      expect((await first(port.pieces())).length).toBe(0);
      expect((await first(port.songs())).some((s) => s.project === 'sample-beat')).toBe(false);
      await first(port.loadSample());
      const songs = await first(port.songs());
      expect(songs.filter((s) => s.project === 'sample-beat')).toHaveLength(2);
      expect(songs.some((s) => s.project === 'neon-drive')).toBe(true);
      const pieces = await first(port.pieces());
      expect(pieces).toHaveLength(14);
      expect(new Set(pieces.map((p) => p.state))).toEqual(new Set(['done', 'draft', 'failed']));
      const done = pieces.filter((p) => p.state === 'done');
      expect(done.every((p) => p.video === 'samples/music-motion/sample.mp4' && p.sizeBytes > 0)).toBe(true);
      expect(pieces.filter((p) => p.state === 'failed').every((p) => !!p.error)).toBe(true);
      expect(pieces.filter((p) => p.state === 'draft').every((p) => p.video === undefined)).toBe(true);
      expect((await first(port.piece('sample-piece'))).script.pieces.length).toBeGreaterThan(0);
      const references = await first(port.references());
      expect(references).toHaveLength(12);
      expect(references.every((r) => r.state === 'ready' && (r.analysis?.frames.length ?? 0) > 0)).toBe(true);
      expect(await first(port.presets())).toHaveLength(4);
      const names = (await first(port.catalog())).parts.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(['confetti-burst', 'ticker-tape', 'pulse-ring']));
    });

    it('loaded twice appears once, and what the person made is not touched', async () => {
      const { port } = setup();
      await first(port.loadSample());
      const mine = await first(port.create(await songOf(port), defaultChoices()));
      await first(port.loadSample());
      const pieces = await first(port.pieces());
      expect(pieces).toHaveLength(15);
      expect(pieces.filter((p) => p.id === mine.id)).toHaveLength(1);
      expect((await first(port.references())).length).toBe(12);
      expect((await first(port.presets())).length).toBe(4);
      expect((await first(port.catalog())).parts.filter((p) => p.name === 'pulse-ring')).toHaveLength(1);
    });

    it('survives a reload, with its songs, its failed pieces and its parts', async () => {
      const kept = new Map<string, string>();
      const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
      await first(setup({ storage }).port.loadSample());
      const again = setup({ storage }).port;
      const pieces = await first(again.pieces());
      expect(pieces).toHaveLength(14);
      expect(pieces.filter((p) => p.state === 'failed')).toHaveLength(2);
      expect((await first(again.songs())).some((s) => s.project === 'paper-boats')).toBe(true);
      expect((await first(again.catalog())).parts.some((p) => p.name === 'ticker-tape')).toBe(true);
    });

    it('can make a piece from a song of the dataset', async () => {
      const { port } = setup();
      await first(port.loadSample());
      const song = (await first(port.songs())).find((s) => s.project === 'sample-beat' && s.variant === 0)!;
      const piece = await first(port.create(song, defaultChoices()));
      expect(piece.title).toBe('Sample Beat');
    });

    it('takes a song made elsewhere into the library, with the sample media unless it has its own, and makes a piece from it', async () => {
      const { port } = setup();
      const before = (await first(port.songs())).length;
      const added = await first(port.addSong({ project: 'studio-1', title: 'Night Drive', seconds: 90, instrumental: false }));
      expect(added).toMatchObject({ key: 'studio-1/track-1/0', title: 'Night Drive', seconds: 90 });
      expect(added.audio).toBeTruthy();
      const list = await first(port.songs());
      expect(list).toHaveLength(before + 1);
      expect((await first(port.create(list.find((s) => s.project === 'studio-1')!, defaultChoices()))).title).toBe('Night Drive');
      await first(port.addSong({ project: 'studio-1', title: 'Renamed', seconds: 90, instrumental: false, audio: 'http://x/a.wav' }));
      const again = (await first(port.songs())).filter((s) => s.project === 'studio-1');
      expect(again.map((s) => [s.title, s.audio])).toEqual([['Renamed', 'http://x/a.wav']]);
    });

    it('loads a dataset of its own: a file with only a song and its failed piece, with no video, and replaces an item with the same id', async () => {
      const { port } = setup();
      const song = { project: 'mine', trackId: 't', variant: 0, title: 'Mine', seconds: 20, bpm: 100, instrumental: true, lyrics: '' };
      const piece = { id: 'p1', song: { project: 'mine', trackId: 't', variant: 0 }, level: 'simple' as const, style: 'typographic' as const, fps: 30, resolution: '1280x720', state: 'failed' as const, error: 'no disk' };
      await first(port.loadDataset({ songs: [song], pieces: [piece] }, undefined));
      expect((await first(port.pieces())).map((p) => [p.id, p.state, p.error])).toEqual([['p1', 'failed', 'no disk']]);
      await first(port.loadDataset({ pieces: [{ ...piece, state: 'draft' as const, error: undefined }] }, undefined));
      expect((await first(port.pieces())).map((p) => [p.id, p.state])).toEqual([['p1', 'draft']]);
    });
  });

});
