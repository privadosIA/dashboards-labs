import { firstValueFrom, type Observable } from 'rxjs';

import { AnimationFailure, type DraftInput } from '@lab/animation-core';
import { InMemoryAnimation } from './in-memory.adapter';
import { defaultChoices } from './validate';

const STEP = 100;
const WRITE = 400;

function setup(options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) {
  let now = 1_000_000;
  const port = new InMemoryAnimation({ stepMs: STEP, pollMs: 10, writeMs: WRITE, now: () => now, ...options });
  return { port, tick: (ms: number) => (now += ms) };
}

const first = <T>(o: Observable<T>) => firstValueFrom(o);
const failure = async (o: Observable<unknown>): Promise<AnimationFailure> => {
  try {
    await first(o);
  } catch (e) {
    expect(e).toBeInstanceOf(AnimationFailure);
    return e as AnimationFailure;
  }
  throw new Error('it did not fail');
};

/** A piece of the first song with at least `min` script pieces (a song has as many as it has sections). */
async function piece(port: InMemoryAnimation, min = 1) {
  for (const song of await first(port.songs())) {
    const made = await first(port.create(song, defaultChoices()));
    if (made.script.pieces.length >= min) return made;
    await first(port.remove(made.id));
  }
  throw new Error(`no song has ${min} sections`);
}

describe('InMemoryAnimation: scenes, review and theme', () => {
  describe('a scene for one script piece', () => {
    it('is a draft with the scene, the brief and a name that carries the piece, ready after the writing time', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const target = p.script.pieces[1];
      const input: DraftInput = { request: '', scene: { piece: p.id, scriptPiece: target.id, brief: 'a door that opens' } };
      const d = await first(port.askDraft(input));
      expect(d).toMatchObject({ state: 'writing', scene: { piece: p.id, scriptPiece: target.id }, brief: 'a door that opens' });
      tick(WRITE + 1);
      const ready = await first(port.draft(d.id));
      expect(ready.state).toBe('ready');
      expect(ready.name!.length).toBeLessThanOrEqual(32);
      expect(JSON.parse(ready.manifest!)).toMatchObject({ verse: 'own', scene: { piece: p.id, script_piece: target.id } });
    });

    it('refuses a piece or a script piece that is not there, and a picture, a reference or a base text with it', async () => {
      const { port } = setup();
      const p = await piece(port);
      expect((await failure(port.askDraft({ request: '', scene: { piece: 'nope', scriptPiece: 'p1' } }))).kind).toBe('missing');
      expect((await failure(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: 'nope' } }))).kind).toBe('missing');
      expect((await failure(port.askDraft({ request: '', frame: 'f', referenceId: 'r', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id } }))).kind).toBe('refused');
    });

    it('is not a thing the server has when its catalog lists no scene feature', async () => {
      const { port } = setup({ features: ['animate'] });
      const p = await piece(port);
      expect((await failure(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id } }))).kind).toBe('refused');
      expect((await failure(port.writeScenes(p.id))).kind).toBe('unavailable');
    });

    it('becomes a scene part on approval, kept out of the catalog unless its piece is asked for', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const d = await first(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id, brief: 'idea' } }));
      tick(WRITE + 1);
      const part = await first(port.approveDraft(d.id));
      expect(part).toMatchObject({ verse: 'own', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id } });
      expect((await first(port.catalog())).parts.some((x) => x.name === part.name)).toBe(false);
      expect((await first(port.catalog(p.id))).parts.some((x) => x.name === part.name)).toBe(true);
      expect((await first(port.catalog('another'))).parts.some((x) => x.name === part.name)).toBe(false);
      expect((await first(port.partText(part.name))).fragment).toContain('scene');
    });

    it('warns of an asset slot the theme has no drawing for', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const d = await first(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id } }));
      tick(WRITE + 1);
      const text = await first(port.draft(d.id));
      await first(port.saveDraft(d.id, { manifest: text.manifest!, fragment: '<div>{{asset:mascot}}</div>' }));
      expect((await first(port.draft(d.id))).warnings).toEqual(['{{asset:mascot}}: the theme has no drawing with that name']);
      await first(port.saveDesign(p.id, { ...p.design.design, theme: { assets: { mascot: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' } } }));
      expect((await first(port.draft(d.id))).warnings).toBeUndefined();
    });
  });

  describe('a review of a draft', () => {
    it('scores a short idea lower, and a minimum rewrites it up the climb to the attempts asked', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const ask = (brief: string, review: DraftInput['review']) => first(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id, brief }, review }));
      const short = await ask('x', true);
      const long = await ask('a very long idea about a door that opens onto the sea at dawn and then closes', true);
      const climbing = await ask('x', { min: 6, attempts: 3 });
      tick(WRITE + 1);
      const a = (await first(port.draft(short.id))).review!;
      const b = (await first(port.draft(long.id))).review!;
      expect(a.score!).toBeLessThan(b.score!);
      expect(a.verdict).toBe('fail');
      expect(a.attempts).toEqual([]);
      const c = (await first(port.draft(climbing.id))).review!;
      expect(c.attempts.map((x) => x.score)).toEqual([3, 4, 5, 6].slice(0, 4));
      expect(c.score).toBe(6);
      expect((await first(port.draft(climbing.id))).reviewAsk).toEqual({ min: 6, attempts: 3 });
    });

    it('is not asked when the draft asks for none', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const d = await first(port.askDraft({ request: '', scene: { piece: p.id, scriptPiece: p.script.pieces[0].id, brief: 'idea' } }));
      tick(WRITE + 1);
      expect((await first(port.draft(d.id))).review).toBeUndefined();
    });
  });

  describe('a batch of scenes', () => {
    it('writes one draft per script piece, one after the other by the clock, and ends done', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const total = p.script.pieces.length;
      const batch = await first(port.writeScenes(p.id, { briefMode: 'literal' }));
      expect(batch).toMatchObject({ state: 'writing', done: 0, total, briefMode: 'literal' });
      expect(batch.drafts.every((d) => d.state === 'pending' || d.state === 'writing')).toBe(true);
      tick(WRITE + 1);
      const mid = (await first(port.piece(p.id))).scenes!;
      expect(mid.done).toBe(1);
      expect(mid.drafts[0].state).toBe('ready');
      tick(WRITE * total);
      const end = (await first(port.piece(p.id))).scenes!;
      expect(end).toMatchObject({ state: 'done', done: total });
      expect(end.drafts.every((d) => d.state === 'ready' && d.draftId)).toBe(true);
    });

    it('is followed until it is over', async () => {
      const { port, tick } = setup({ pollMs: 5 });
      const p = await piece(port);
      await first(port.writeScenes(p.id));
      const seen: string[] = [];
      const done = new Promise<void>((ok) => {
        port.followScenes(p.id).subscribe({ next: (b) => seen.push(`${b.state}:${b.done}`), complete: ok });
      });
      for (let i = 0; i < p.script.pieces.length + 1; i++) {
        await new Promise((r) => setTimeout(r, 20));
        tick(WRITE + 1);
      }
      await done;
      expect(seen[0]).toMatch(/^writing:/);
      expect(seen.at(-1)).toBe(`done:${p.script.pieces.length}`);
    });

    it('refuses a second batch while one writes, a script piece that is not there, and a proposal under way', async () => {
      const { port } = setup();
      const p = await piece(port);
      expect((await failure(port.writeScenes(p.id, { scriptPieces: ['nope'] }))).kind).toBe('missing');
      await first(port.writeScenes(p.id));
      expect((await failure(port.writeScenes(p.id))).kind).toBe('busy');
    });

    it('stops after the draft that is writing when cancelled, and keeps what was written', async () => {
      const { port, tick } = setup();
      const p = await piece(port, 2);
      await first(port.writeScenes(p.id));
      tick(1);
      const cancelled = await first(port.cancelScenes(p.id));
      expect(['writing', 'cancelled']).toContain(cancelled.state);
      tick(WRITE * 2);
      const end = (await first(port.piece(p.id))).scenes!;
      expect(end.state).toBe('cancelled');
      expect(end.drafts[0].state).toBe('ready');
      expect(end.drafts.at(-1)!.state).toBe('pending');
    });

    it('approves every ready scene and puts it in the script, clearing the parameters of the part it replaces', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const total = p.script.pieces.length;
      await first(port.writeScenes(p.id));
      expect((await failure(port.approveScenes(p.id))).kind).toBe('busy');
      tick(WRITE * (total + 1));
      const answer = await first(port.approveScenes(p.id));
      expect(answer.approved).toHaveLength(total);
      expect(answer.notApproved).toEqual([]);
      const after = await first(port.piece(p.id));
      expect(after.script.pieces.every((x) => answer.approved.some((a) => a.scriptPiece === x.id && a.part === x.part))).toBe(true);
      expect(after.script.pieces.every((x) => !x.params && !x.animate)).toBe(true);
      expect(after.scenes!.drafts.every((d) => d.state === 'approved')).toBe(true);
      expect((await first(port.catalog(p.id))).parts.filter((x) => x.scene).length).toBe(total);
    });

    it('refuses an approval when the script lost a piece the scenes were written for', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      await first(port.writeScenes(p.id));
      tick(WRITE * (p.script.pieces.length + 1));
      const [head, ...rest] = p.script.pieces;
      await first(port.saveScript(p.id, { ...p.script, pieces: [{ ...rest[0], start: head.start }, ...rest.slice(1)] }));
      const f = await failure(port.approveScenes(p.id));
      expect(f.kind).toBe('refused');
      expect(f.reason).toContain(head.id);
    });

    it('does nothing without an assistant, as a server without one does', async () => {
      const { port } = setup({ assistant: 'missing' });
      const p = await piece(port);
      expect((await failure(port.writeScenes(p.id))).kind).toBe('unavailable');
    });
  });

  describe('a review of the piece', () => {
    it('runs for two steps and then scores each script piece with its verdict, two fixed notes for a weak one, and an overall judgement', async () => {
      const { port, tick } = setup();
      const p = await piece(port);
      const started = await first(port.reviewPiece(p.id));
      expect(started.state).toBe('running');
      expect((await failure(port.reviewPiece(p.id))).kind).toBe('busy');
      tick(STEP * 2);
      const done = (await first(port.piece(p.id))).review!;
      expect(done.state).toBe('done');
      expect(done.scenes.map((s) => s.scriptPiece)).toEqual(p.script.pieces.map((s) => s.id));
      for (const s of done.scenes) {
        expect(s.verdict).toBe(s.score >= 7 ? 'pass' : s.score >= 5 ? 'weak' : 'fail');
        expect(s.notes.length).toBe(s.score >= 7 ? 0 : 2);
      }
      expect(done.overall!.notes.length).toBeGreaterThan(0);
    });

    it('is not there on a server that lists no review feature', async () => {
      const { port } = setup({ features: ['animate', 'scene'] });
      const p = await piece(port);
      expect((await failure(port.reviewPiece(p.id))).kind).toBe('unavailable');
    });
  });

  describe('the theme', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

    it('is kept with the design, with the crossfade', async () => {
      const { port } = setup();
      const p = await piece(port);
      const saved = await first(port.saveDesign(p.id, { ...p.design.design, transitionSeconds: 0.4, theme: { css: '#verse{letter-spacing:.1em}', assets: { mascot: svg }, hud: { tl: 'LIVE', br: '00:42' } } }));
      expect(saved.design.design.theme).toEqual({ css: '#verse{letter-spacing:.1em}', assets: { mascot: svg }, hud: { tl: 'LIVE', br: '00:42' } });
      expect(saved.design.design.transitionSeconds).toBe(0.4);
    });

    it.each([
      ['an @import', { css: '@import url(x.css);' }, 'design.theme.css'],
      ['a url that is not data:', { css: 'a{background:url(http://x/y.png)}' }, 'design.theme.css'],
      ['a < in the css', { css: 'a{content:"<b>"}' }, 'design.theme.css'],
      ['a css that is too long', { css: 'a'.repeat(20481) }, 'design.theme.css'],
      ['six assets', { assets: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => [n, svg])) }, 'design.theme.assets'],
      ['an asset name with a capital', { assets: { Mascot: svg } }, 'design.theme.assets.Mascot'],
      ['an asset that is not an svg', { assets: { m: '<p>x</p>' } }, 'design.theme.assets.m'],
      ['an asset with a script', { assets: { m: '<svg><script>1</script></svg>' } }, 'design.theme.assets.m'],
      ['an hud text of 41 characters', { hud: { tl: 'x'.repeat(41) } }, 'design.theme.hud.tl'],
    ])('refuses %s with the reason at its field', async (_name, theme, at) => {
      const { port } = setup();
      const p = await piece(port);
      const f = await failure(port.saveDesign(p.id, { ...p.design.design, theme }));
      expect(f.kind).toBe('refused');
      expect(f.reason.startsWith(at)).toBe(true);
    });

    it('refuses a crossfade over two seconds', async () => {
      const { port } = setup();
      const p = await piece(port);
      expect((await failure(port.saveDesign(p.id, { ...p.design.design, transitionSeconds: 2.5 }))).reason).toContain('transition_seconds');
    });

    it('lists the built-in parts hud-chrome and grain, and the fonts the pages embed', async () => {
      const { port } = setup();
      const c = await first(port.catalog());
      expect(c.parts.filter((x) => ['hud-chrome', 'grain'].includes(x.name)).map((x) => x.manual)).toEqual([true, true]);
      expect(c.fontFiles!['Inter']).toMatchObject({ licence: 'OFL-1.1' });
      expect((await first(setup({ features: ['animate'] }).port.catalog())).parts.some((x) => x.name === 'grain')).toBe(false);
    });
  });
});
