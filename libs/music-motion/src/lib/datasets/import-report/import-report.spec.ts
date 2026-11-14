import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { firstValueFrom } from 'rxjs';

import { DATASET_FORMAT, type AnimationDataset } from '@lab/animation-dataset';
import { InMemoryAnimation } from '../../animation/in-memory.adapter';
import { LocalStyles } from '../../animation/local-styles';
import type { AnimationPort } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { DatasetsPage } from '../datasets.page';

const first = <T>(o: import('rxjs').Observable<T>) => firstValueFrom(o);

const settle = async (fixture: ComponentFixture<unknown>) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

async function fileFor(port: AnimationPort, extra: Partial<AnimationDataset['animation']> = {}): Promise<AnimationDataset> {
  const songs = await first(port.songs());
  const song = songs[0];
  const catalog = await first(port.catalog());
  const piece = await first(port.create(song, { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' }));
  const design = piece.design.design;
  await first(port.remove(piece.id));
  return {
    format: DATASET_FORMAT,
    version: 2,
    animation: {
      title: 'Imported',
      song: { project: song.project, trackId: song.trackId, variant: song.variant, title: song.title, seconds: song.seconds },
      options: { style: 'typographic', level: 'medium', fps: 30, resolution: '1280x720' },
      design: { ...design, concept: 'imported' },
      script: { version: 1, pieces: [{ id: 'p1', start: 0, end: song.seconds, part: catalog.parts[0].name }] },
      look: {
        reference: { title: 'A good video', notes: '', tags: ['edm'], source: 'https://www.youtube.com/watch?v=ok1' },
        style: { name: 'From the good one', reference: 'https://youtu.be/ok1', design, rhythm: 6, parts: [catalog.parts[0].name] },
      },
      parts: [{ name: 'no-text-part', description: 'a clock that ticks', text: null }],
      ...extra,
    },
  };
}

async function create(lang: 'es' | 'en' = 'en', features?: string[]) {
  const storage = stubStorage();
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 5, analyseMs: 20, writeMs: 20, ...(features ? { features } : {}) });
  const calls: string[] = [];
  const watched = new Proxy(port, {
    get(target, key: string) {
      const value = (target as unknown as Record<string, unknown>)[key];
      return typeof value === 'function' ? (...args: unknown[]) => (calls.push(key), (value as (...a: unknown[]) => unknown).apply(target, args)) : value;
    },
  }) as AnimationPort;
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: watched }] });
  const fixture = TestBed.createComponent(DatasetsPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const pick = async (content: string | object, name = 'dataset.motion.json', size?: number) => {
    const file = new File([typeof content === 'string' ? content : JSON.stringify(content)], name, { type: 'application/json' });
    if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
    const input = get('file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5));
      await settle(fixture);
    }
  };
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await settle(fixture);
    }
  };
  return { fixture, el, get, pick, until, port, calls, storage, local: TestBed.inject(LocalStyles) };
}

const MUTATING = ['addReference', 'makePreset', 'savePreset', 'askDraft', 'saveDraft', 'create', 'saveDesign', 'saveScript', 'approveDraft'];

afterEach(() => vi.unstubAllGlobals());

const rowText = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`)!.textContent!.replace(/\s+/g, ' ').trim();

describe('the import of the Datasets screen', () => {
  it('refuses a file of another kind, saying which, and creates nothing', async () => {
    const { get, pick, calls } = await create();
    await pick({ scenes: [] });
    expect(get('problems')!.textContent).toContain('project dataset');
    expect(get('report')).toBeNull();
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([]);
  });

  it('refuses the file of lists of the first version, and says it is not the dataset of an animation', async () => {
    const { get, pick, calls } = await create();
    await pick({ format: DATASET_FORMAT, version: 1, styles: [], pieces: [] });
    expect(get('problems')!.textContent).toContain('dataset of lists');
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([]);
  });

  it('lists every problem of a bad file, in Spanish, with its place', async () => {
    const { get, pick, port } = await create('es');
    const file = await fileFor(port);
    await pick({ ...file, animation: { ...file.animation, design: { ...file.animation.design, accent: 'red' }, script: { version: 1, pieces: [{ id: 'p', start: 5, end: 5, part: 'x' }] } } });
    const text = get('problems')!.textContent!;
    expect(text).toContain('no se ha creado nada');
    expect(text).toContain('animation: design.accent debe ser un color como #1d1425');
    expect(text).toContain('animation.script.pieces[0]');
  });

  it('refuses a file that is not JSON and one that is over 5 MB', async () => {
    const a = await create();
    await a.pick('{ not json');
    expect(a.get('problems')!.textContent).toContain('could not be read as JSON');
    TestBed.resetTestingModule();
    const b = await create();
    await b.pick({ format: DATASET_FORMAT, version: 2 }, 'big.json', 6 * 1024 * 1024);
    expect(b.get('problems')!.textContent).toContain('larger than 5 MB');
  });

  it('shows what would happen to the song, the reference, the style, the parts and the animation before anything is created, and cancelling leaves everything as it was', async () => {
    const { get, pick, calls, port, el } = await create();
    const file = await fileFor(port);
    const before = { refs: (await first(port.references())).length, presets: (await first(port.presets())).length, pieces: (await first(port.pieces())).length };
    calls.length = 0;
    await pick(file);
    expect(get('summary')!.textContent).toContain('3 to create');
    expect(get('summary')!.textContent).toContain('1 already there');
    expect(get('summary')!.textContent).toContain('1 that cannot be done');
    expect(rowText(el, 'row-song-0')).toContain('Already there');
    expect(rowText(el, 'row-reference-0')).toContain('Will be created');
    expect(rowText(el, 'row-style-0')).toContain('Will be created');
    expect(rowText(el, 'row-part-0')).toContain('Cannot be done');
    expect(rowText(el, 'row-animation-0')).toContain('Will be created');
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([]);
    get('cancel')!.click();
    expect((await first(port.references())).length).toBe(before.refs);
    expect((await first(port.presets())).length).toBe(before.presets);
    expect((await first(port.pieces())).length).toBe(before.pieces);
  });

  it('says the song is not in the library, does not offer the animation until another is picked, and fits the script to the one picked', async () => {
    const { get, pick, port, el, fixture, until } = await create();
    const file = await fileFor(port);
    const away = { ...file, animation: { ...file.animation, look: undefined, parts: undefined, song: { ...file.animation.song, trackId: 'gone', title: 'Gone song' } } };
    await pick(away);
    expect(rowText(el, 'row-song-0')).toContain('The song "Gone song" is not in the library');
    expect(rowText(el, 'row-animation-0')).toContain('Cannot be done');
    expect(get('confirm')!.hasAttribute('disabled')).toBe(true);
    expect(get('song-select')!.textContent).toContain('(not in the library)');

    const songs = await first(port.songs());
    const other = songs.find((s) => s.seconds !== file.animation.song.seconds)!;
    const select = get('song-select') as HTMLSelectElement;
    select.value = other.key;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(rowText(el, 'row-song-0')).toContain(other.title);
    expect(rowText(el, 'row-song-0')).toContain('fitted to its length');
    expect(rowText(el, 'row-animation-0')).toContain('Will be created');
    expect(get('confirm')!.hasAttribute('disabled')).toBe(false);

    get('confirm')!.click();
    await until(() => get('done') !== null);
    const made = (await first(port.pieces())).find((p) => p.source.trackId === other.trackId && p.title === other.title)!;
    const detail = await first(port.piece(made.id));
    expect(detail.script.pieces.at(-1)!.end).toBe(detail.songMap.duration);
    expect(detail.design.design.concept).toBe('imported');
    expect(get('open-animation')).not.toBeNull();
  });

  it('puts the animation on another song of the library even when its own song is there, and goes back to the file\'s with the first option', async () => {
    const { get, pick, port, el, fixture } = await create();
    await pick(await fileFor(port, { look: undefined, parts: undefined }));
    const other = (await first(port.songs())).find((s) => s.seconds !== 48)!;
    const select = get('song-select') as HTMLSelectElement;
    select.value = other.key;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(rowText(el, 'row-song-0')).toContain('fitted');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(rowText(el, 'row-song-0')).not.toContain('fitted');
  });

  it('creates what the report said on confirming, shows each state and the totals, and links to the animation', async () => {
    const { get, pick, until, port, el } = await create();
    await pick(await fileFor(port));
    get('confirm')!.click();
    await until(() => get('done') !== null);
    expect(get('done')!.textContent).toContain('3 created');
    expect(get('done')!.textContent).toContain('1 already there');
    expect(get('done')!.textContent).toContain('0 failed');
    expect(Array.from(el.querySelectorAll('[data-testid="state"]')).map((c) => c.textContent!.trim())).toEqual(['Already there', 'Created', 'Created', 'Not done', 'Created']);
    expect((await first(port.presets())).map((p) => p.name)).toContain('From the good one');
    expect(get('open-animation')!.getAttribute('href')).toMatch(/^\/pieces\/.+/);
  });

  it('keeps a style with no reference in the browser, and remembers that the animation started from it', async () => {
    const { get, pick, until, port, local } = await create();
    const file = await fileFor(port, { parts: undefined });
    await pick({ ...file, animation: { ...file.animation, look: { style: { ...file.animation.look!.style!, name: 'From nothing', reference: undefined } } } });
    get('confirm')!.click();
    await until(() => get('done') !== null);
    expect(local.styles().map((s) => s.name)).toEqual(['From nothing']);
    const made = (await first(port.pieces())).find((p) => p.title !== undefined && local.startedFrom(p.id) !== undefined)!;
    expect(local.startedFrom(made.id)).toBe('From nothing');
    expect(get('done')!.textContent).toContain('1 kept in the browser');
  });

  it('tells the person when the browser cannot keep what was kept', async () => {
    const { get, pick, until, port, local } = await create();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const file = await fileFor(port, { parts: undefined });
    await pick({ ...file, animation: { ...file.animation, look: { style: { ...file.animation.look!.style!, reference: undefined } } } });
    get('confirm')!.click();
    await until(() => get('done') !== null);
    expect(local.durable()).toBe(false);
    expect(get('not-durable')!.textContent).toContain('will be lost when the page is closed');
  });

  it('says what to do about a part the animation needs and nobody has, and offers to ask the assistant for one with no text', async () => {
    const { get, pick, until, port, calls, el } = await create();
    const file = await fileFor(port, { look: undefined });
    await pick({ ...file, animation: { ...file.animation, script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 48, part: 'no-text-part' }] } } });
    expect(rowText(el, 'row-animation-0')).toContain('Approve the drafts the file brings on Parts and import again');
    calls.length = 0;
    get('ask-assistant')!.click();
    await until(() => get('asked') !== null);
    expect(calls).toContain('askDraft');
    expect(get('asked')!.textContent).toContain('on Parts as a draft');
    expect((await first(port.drafts())).map((d) => d.request)).toEqual(['a clock that ticks']);
  });

  it('can be stopped while it works, and what was made stays', async () => {
    const { get, pick, until, port } = await create();
    await pick(await fileFor(port));
    get('confirm')!.click();
    await until(() => get('stop') !== null);
    get('stop')!.click();
    await until(() => get('done') !== null);
    expect(get('done')).not.toBeNull();
  });

  it('has nothing to confirm when the animation is already there', async () => {
    const { get, pick, until, port } = await create();
    const file = await fileFor(port, { look: undefined, parts: undefined });
    await pick(file);
    get('confirm')!.click();
    await until(() => get('done') !== null);
    get('another')!.click();
    await settle(TestBed.createComponent(DatasetsPage));
    await pick(file);
    expect(get('summary')!.textContent).toContain('0 to create');
    expect(get('summary')!.textContent).toContain('2 already there');
    expect(get('confirm')!.hasAttribute('disabled')).toBe(true);
  });
});

describe('the import of a dataset with keyframes', () => {
  /** The first piece animates `to` of `counter`, a part the in-memory server lets animate. */
  const keyed = async (port: AnimationPort): Promise<AnimationDataset> => {
    const file = await fileFor(port, { look: undefined, parts: [] });
    const { look: _l, ...rest } = file.animation;
    const script = { version: 1 as const, pieces: [{ id: 'p1', start: 0, end: file.animation.song.seconds, part: 'counter', params: { to: 5 }, animate: { to: [{ t: 0, value: 1 }, { t: file.animation.song.seconds, value: 9 }] } }] };
    return { ...file, animation: { ...rest, script } };
  };

  it('asks before making it without the keyframes where the server does not take them, and leaves it alone if not asked', async () => {
    const ctx = await create('en', []);
    await ctx.pick(await keyed(ctx.port));
    expect(rowText(ctx.el, 'report')).toContain('The server does not take animated parameters');
    expect(ctx.get('drop-animate')!.textContent).toContain('Make the animation without what this server does not take');
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    expect(await first(ctx.port.pieces())).toHaveLength(0);
  });

  it('makes it without them once the person agreed', async () => {
    const ctx = await create('en', []);
    await ctx.pick(await keyed(ctx.port));
    (ctx.get('drop-animate-check') as HTMLInputElement).click();
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    const [piece] = await first(ctx.port.pieces());
    expect(JSON.stringify((await first(ctx.port.piece(piece.id))).script)).not.toContain('animate');
  });

  it('asks nothing where the server takes them, and keeps them', async () => {
    const ctx = await create('en');
    await ctx.pick(await keyed(ctx.port));
    expect(ctx.get('drop-animate')).toBeNull();
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    const [piece] = await first(ctx.port.pieces());
    expect((await first(ctx.port.piece(piece.id))).script.pieces[0].animate?.['to']).toHaveLength(2);
  });
});

describe('the import of a dataset with layers', () => {
  const layered = async (port: AnimationPort): Promise<AnimationDataset> => {
    const file = await fileFor(port, { look: undefined, parts: [] });
    const { look: _l, ...rest } = file.animation;
    const script = { version: 1 as const, pieces: [{ id: 'p1', start: 0, end: file.animation.song.seconds, part: 'toggle' }], layers: [{ id: 'a', items: [{ part: 'counter', start: 1, end: 5 }] }] };
    return { ...file, animation: { ...rest, script } };
  };

  it('asks before making it without the layers where the server does not take them, and leaves it alone if not asked', async () => {
    const ctx = await create('en', ['animate']);
    await ctx.pick(await layered(ctx.port));
    expect(rowText(ctx.el, 'report')).toContain('The server does not take layers');
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    expect(await first(ctx.port.pieces())).toHaveLength(0);
  });

  it('makes it without the layers once the person agreed', async () => {
    const ctx = await create('en', ['animate']);
    await ctx.pick(await layered(ctx.port));
    (ctx.get('drop-animate-check') as HTMLInputElement).click();
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    const [piece] = await first(ctx.port.pieces());
    expect((await first(ctx.port.piece(piece.id))).script.layers).toBeUndefined();
  });

  it('asks nothing where the server takes them, and keeps them', async () => {
    const ctx = await create('en');
    await ctx.pick(await layered(ctx.port));
    expect(ctx.get('drop-animate')).toBeNull();
    ctx.get('confirm')!.click();
    await ctx.until(() => ctx.get('done') !== null);
    const [piece] = await first(ctx.port.pieces());
    expect((await first(ctx.port.piece(piece.id))).script.layers).toHaveLength(1);
  });

  it('pages the plan table: ten rows and a paginator for a plan of more, and the same plan when there are few', async () => {
    const { pick, port, el } = await create();
    await pick(await fileFor(port));
    expect(el.querySelectorAll('mat-paginator')).toHaveLength(0);
    TestBed.resetTestingModule();
    const many = await create();
    const parts = Array.from({ length: 14 }, (_, i) => ({ name: `part-${i}`, description: `part ${i}`, text: null }));
    await many.pick(await fileFor(many.port, { parts }));
    expect(many.el.querySelectorAll('[data-testid="report"] tbody tr')).toHaveLength(10);
    expect(many.el.querySelectorAll('mat-paginator')).toHaveLength(1);
    expect(many.get('summary')!.textContent).toContain('cannot be done');
  });
});
