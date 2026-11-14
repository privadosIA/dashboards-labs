import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { NEVER, Subject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type AnimationPort, type PieceDetail, type Preset, type Reference, type Song } from '@lab/animation-core';
import { CATALOG, SONGS } from '../animation/fixtures';
import { LocalStyles } from '../animation/local-styles';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { NewPiecePage, PROGRESS_TICK_MS } from './new-piece.page';
import { assistTestProviders, chooseAssistant } from '../../testing/assist';

const SONG: Song = SONGS[0];

async function create(options: { query?: Record<string, string>; createCall?: () => unknown; lang?: 'es' | 'en'; songs?: readonly Song[]; presets?: () => unknown; own?: readonly object[]; saveScript?: () => unknown; proposeAll?: () => unknown; models?: () => unknown; propose?: () => unknown; references?: readonly Reference[]; makePreset?: () => unknown; addReference?: () => unknown } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage(options.own?.length ? { 'music-motion.styles.video-anim': JSON.stringify(options.own) } : {});
  const made = { id: 'api-mm-9', design: { design: { dark: '#101018', light: '#f4f1ea', accent: '#00ffaa', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: 'rule concept' }, source: 'fallback', edited: false } } as unknown as PieceDetail;
  const createCall = vi.fn(options.createCall ?? (() => of(made)));
  const navigate = vi.fn().mockResolvedValue(true);
  const withMap = { id: 'api-mm-9', design: made.design, songMap: { duration: SONG.seconds - 0.06, sections: [{ tag: 'Intro', start: 0, end: 20 }, { tag: 'Chorus', start: 20, end: SONG.seconds - 0.06 }] } } as unknown as PieceDetail;
  const saveDesign = vi.fn(() => of(withMap));
  const saveScript = vi.fn(options.saveScript ?? (() => of(withMap)));
  const propose = vi.fn(options.propose ?? (() => of({ what: 'script', source: 'assistant', replacements: [], piece: withMap })));
  const proposeAll = vi.fn(options.proposeAll ?? (() => of({ ...withMap, proposal: { state: 'waiting', what: 'all', startedAt: 1 } })));
  const makePreset = vi.fn(options.makePreset ?? (() => of({ id: 'made-preset' } as Preset)));
  const addReference = vi.fn(options.addReference ?? (() => of({ id: 'ref-new', title: 'New video', notes: '', tags: [], state: 'analysing', createdAt: 1 } as Reference)));
  const port = { songs: () => of(options.songs ?? [SONG]), catalog: () => of(CATALOG), presets: options.presets ?? (() => of([])), references: () => of(options.references ?? []), reference: () => NEVER, addReference, makePreset, create: createCall, saveDesign, saveScript, propose, proposeAll, assistModels: options.models ?? (() => of({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5, fits: true }, { name: 'gemma4:26b', sizeBytes: 17, fits: false }] })) } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      provideRouter([]),
      provideLabForms({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: PROGRESS_TICK_MS, useValue: 10 },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map(Object.entries(options.query ?? { project: SONG.project, track: SONG.trackId, variant: String(SONG.variant) })) } } },
    ],
  });
  TestBed.overrideProvider(Router, { useValue: { navigate, createUrlTree: () => ({}), serializeUrl: () => '', events: of() } });
  const fixture = TestBed.createComponent(NewPiecePage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const go = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, createCall, navigate, saveDesign, saveScript, makePreset, addReference, propose, proposeAll, get, go, text: () => el.textContent ?? '' };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function pick(fixture: ComponentFixture<unknown>, value: string): Promise<void> {
  const radio = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  radio.click();
  await settle(fixture);
}

async function write(fixture: ComponentFixture<unknown>, value: string): Promise<void> {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="text"]')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

const button = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="create"]')!;
const checked = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')].map((r) => r.value);

describe('NewPiecePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the words to be heard only when the box is ticked', async () => {
    const { el, fixture, createCall } = await create();
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await settle(fixture);
    button(el).click();
    await settle(fixture);
    expect(createCall).toHaveBeenCalledWith(SONG, { style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720', hearWords: true });
  });

  it('offers the saved styles in the look step, and makes the piece with the one that is picked', async () => {
    const presets = () => of([{ id: 'p1', name: 'Warm pop' }, { id: 'p2', name: 'Cold jazz' }]);
    const { fixture, el, createCall, go, get } = await create({ presets });
    await go('change-look');
    expect(get('styles')!.textContent).toContain('Warm pop');
    get('style-p2')!.click();
    await settle(fixture);
    await go('next');
    await go('next');
    expect(get('look')!.textContent).toContain('Cold jazz');
    button(el).click();
    await settle(fixture);
    expect(createCall).toHaveBeenCalledWith(SONG, expect.objectContaining({ presetId: 'p2' }));
  });

  it('sends no style when none is picked, and still makes pieces when the styles cannot be read', async () => {
    const { el, fixture, createCall } = await create({ presets: () => throwError(() => new Error('404')) });
    button(el).click();
    await settle(fixture);
    expect('presetId' in ((createCall.mock.calls[0] as unknown[])[1] as object)).toBe(false);
  });

  it('hands the page of the piece the reason the words were not heard', async () => {
    const { el, fixture, navigate } = await create({ createCall: () => of({ id: 'api-mm-9', notice: 'no whisper' } as PieceDetail) });
    button(el).click();
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/pieces/api-mm-9'], { state: { notice: 'no whisper' } });
  });


  it('names the song and offers the catalog\'s styles, levels and frame rates with the defaults chosen', async () => {
    const { el, text } = await create();
    expect(el.querySelector('[data-testid="song"]')!.textContent).toContain('Quiet Town');
    expect(text()).toContain('0:48');
    for (const value of ['typographic', 'illustrated', 'simple', 'medium', 'advanced', '24', '30', '60']) expect(el.querySelector(`input[type="radio"][value="${value}"]`), value).not.toBeNull();
    expect(checked(el).sort()).toEqual(['30', 'simple', 'typographic']);
    expect(el.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('1280x720');
    expect(button(el).disabled).toBe(false);
  });

  it('makes the piece with the defaults and opens it', async () => {
    const { el, fixture, createCall, navigate } = await create();
    button(el).click();
    await settle(fixture);
    expect(createCall).toHaveBeenCalledWith(SONG, { style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' });
    expect(navigate).toHaveBeenCalledWith(['/pieces/api-mm-9']);
  });

  it('draws the illustrated style at 24 fps unless another rate was chosen', async () => {
    const a = await create();
    await pick(a.fixture, 'illustrated');
    expect(checked(a.el)).toContain('24');
    TestBed.resetTestingModule();
    const b = await create();
    await pick(b.fixture, '60');
    await pick(b.fixture, 'illustrated');
    expect(checked(b.el)).toContain('60');
  });

  it('warns that advanced at 60 fps is slow', async () => {
    const { fixture, el } = await create();
    expect(el.querySelector('[data-testid="slow"]')).toBeNull();
    await pick(fixture, 'advanced');
    await pick(fixture, '60');
    expect(el.querySelector('[data-testid="slow"]')).not.toBeNull();
  });

  it('does not let a resolution that is not width x height through', async () => {
    const { fixture, el, createCall } = await create();
    await write(fixture, 'big');
    expect(button(el).disabled).toBe(true);
    button(el).click();
    expect(createCall).not.toHaveBeenCalled();
    await write(fixture, '1920x1080');
    expect(button(el).disabled).toBe(false);
  });

  it('shows the server\'s reason beside the choices and makes nothing when it refuses', async () => {
    const { fixture, el, navigate, text } = await create({ createCall: () => throwError(() => new AnimationFailure('refused', 'level "advanced" needs more than this machine has')) });
    button(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('The server does not accept it: level "advanced" needs more than this machine has');
    expect(navigate).not.toHaveBeenCalled();
    expect(button(el).disabled).toBe(false);
    expect(text()).toContain('Create piece');
  });

  it('says so when the song is no longer in the library', async () => {
    const { el, text } = await create({ query: { project: 'gone', track: 't', variant: '0' } });
    expect(el.querySelector('[data-testid="missing"]')).not.toBeNull();
    expect(text()).toContain('That song is no longer in the library.');
    expect(el.querySelector('[data-testid="create"]')).toBeNull();
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create({ lang: 'es' });
    expect(text()).toContain('Nueva animación');
    expect(text()).toContain('Tipográfico');
    expect(text()).toContain('Crear pieza');
  });
});

describe('NewPiecePage and the styles kept in the browser', () => {
  afterEach(() => vi.unstubAllGlobals());
  const design = { dark: '#101018', light: '#f4f1ea', accent: '#00ffaa', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: { intro: 'dark', chorus: 'light' }, concept: 'neon' };
  const own = [{ id: 'l1', name: 'Neon city', design, rhythm: 8, parts: [CATALOG.parts[0].name, CATALOG.parts[1].name], createdAt: 1 }];

  async function chooseOwn(fixture: ComponentFixture<unknown>, el: HTMLElement) {
    (el.querySelector('[data-testid="change-look"]') as HTMLElement).click();
    await settle(fixture);
    const card = el.querySelector('[data-testid="own-l1"]') as HTMLElement;
    expect(card.textContent).toContain('in this browser');
    card.click();
    await settle(fixture);
    (el.querySelector('[data-testid="next"]') as HTMLElement).click();
    await settle(fixture);
    (el.querySelector('[data-testid="next"]') as HTMLElement).click();
    await settle(fixture);
  }

  it('offers them beside the server\'s styles, marked, in the look step', async () => {
    const { el, fixture, go, get } = await create({ own, presets: () => of([{ id: 'p1', name: 'Warm pop' }]) });
    await go('change-look');
    expect(get('style-p1')!.textContent).toContain('Warm pop');
    expect(get('own-l1')!.textContent).toContain('Neon city');
    expect(get('own-l1')!.textContent).toContain('in this browser');
    void el;
    void fixture;
  });

  it('makes the piece with no style of the server, gives it the style\'s design and a script of its parts at its rhythm, and remembers where it came from', async () => {
    const { el, fixture, createCall, saveDesign, saveScript, navigate } = await create({ own });
    await chooseOwn(fixture, el);
    button(el).click();
    await settle(fixture);
    expect((createCall.mock.calls[0] as unknown as [unknown, object])[1]).not.toHaveProperty('presetId');
    expect(saveDesign).toHaveBeenCalledWith('api-mm-9', design);
    const script = (saveScript.mock.calls[0] as unknown as [string, { version: number; pieces: { part: string; start: number; end: number; section?: string; mode?: string }[] }])[1];
    expect(script.version).toBe(1);
    expect(script.pieces[0]).toMatchObject({ part: CATALOG.parts[0].name, start: 0, end: 8, section: 'intro', mode: 'dark' });
    expect(script.pieces[1]).toMatchObject({ part: CATALOG.parts[1].name, start: 8, end: 16 });
    // The script covers what the piece's song map says, not the library's rounded length: the server refuses any other.
    expect(script.pieces.at(-1)!.end).toBeCloseTo(SONG.seconds - 0.06, 3);
    expect(script.pieces.map((p) => p.part).every((n) => own[0].parts.includes(n))).toBe(true);
    expect(TestBed.inject(LocalStyles).startedFrom('api-mm-9')).toBe('Neon city');
    expect(navigate).toHaveBeenCalledWith(['/pieces/api-mm-9']);
  });

  it('shows the server\'s reason and stays when it refuses the script, naming nothing as started from', async () => {
    const { el, fixture, navigate } = await create({ own, saveScript: () => throwError(() => new AnimationFailure('refused', 'script.pieces[0]: part "x" is not in the catalog')) });
    await chooseOwn(fixture, el);
    button(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('is not in the catalog');
    expect(TestBed.inject(LocalStyles).startedFrom('api-mm-9')).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('NewPiecePage as a flow of steps', () => {
  afterEach(() => vi.unstubAllGlobals());
  const own = (id: string): Reference => ({ id, title: `Video ${id}`, notes: '', tags: [], source: `https://youtu.be/${id}`, state: 'ready', createdAt: 1, analysis: { duration: 90, fps: 30, width: 1280, height: 720, frames: [`/f/${id}/01.jpg`], colours: [], thirds: [], cuts: 1, meanShot: 3 } });
  const step = (el: HTMLElement) => el.querySelector('[data-testid="step-of"]')!.textContent!.trim();

  it('starts at the look, without a song in the address, with the three steps named', async () => {
    const { el, get } = await create({ query: {} });
    expect(step(el)).toBe('Step 1 of 3');
    expect(get('steps')!.textContent).toContain('Idea and look');
    expect(get('steps')!.textContent).toContain('Song');
    expect(get('steps')!.textContent).toContain('Options');
    expect(get('prompt-step')).not.toBeNull();
    expect(get('look-step')).not.toBeNull();
    expect(get('create')).toBeNull();
  });

  it('starts at the options with a song in the address, and can go back to the look and forward again keeping the song', async () => {
    const { el, get, go } = await create();
    expect(step(el)).toBe('Step 3 of 3');
    expect(get('song')!.textContent).toContain(SONG.title);
    await go('change-look');
    expect(step(el)).toBe('Step 1 of 3');
    await go('next');
    expect(get('song-chosen')!.textContent).toContain(SONG.title);
    await go('next');
    expect(get('create')).not.toBeNull();
  });

  it('goes from the look to the song and, once a song is picked, to the options', async () => {
    const { el, get, go, fixture } = await create({ query: {} });
    await go('next');
    expect(step(el)).toBe('Step 2 of 3');
    expect((get('next') as HTMLButtonElement).disabled).toBe(true);
    expect(get('song-none')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('app-song-card button')!.click();
    await settle(fixture);
    expect(step(el)).toBe('Step 3 of 3');
    expect(get('song')!.textContent).toContain(SONG.title);
  });

  it('does not let the options be reached without a song', async () => {
    const { get } = await create({ query: {} });
    expect((get('step-2') as HTMLButtonElement).disabled).toBe(true);
    expect((get('step-1') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says the library has no songs, and where they are made, and still lets the look be chosen', async () => {
    const { get, go } = await create({ query: {}, songs: [] });
    await go('next');
    expect(get('song-empty')!.textContent).toContain('no songs');
    expect(get('song-empty')!.textContent).toContain('music panel');
    expect((get('next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('makes a style from the reference chosen, then the piece from that style', async () => {
    const { fixture, el, get, go, createCall, makePreset } = await create({ references: [own('a')], makePreset: () => of({ id: 'made-1' }) });
    await go('change-look');
    await go('reference-a');
    await go('next');
    await go('next');
    expect(get('look')!.textContent).toContain('Video a');
    button(el).click();
    await settle(fixture);
    expect(makePreset).toHaveBeenCalledWith('a');
    expect(createCall).toHaveBeenCalledWith(SONG, expect.objectContaining({ presetId: 'made-1' }));
  });

  it('reuses the style already made from the reference instead of making another', async () => {
    const { fixture, el, go, createCall, makePreset } = await create({ references: [own('a')], presets: () => of([{ id: 'old-style', name: 'Old', referenceId: 'a' }]) });
    await go('change-look');
    await go('reference-a');
    await go('next');
    await go('next');
    button(el).click();
    await settle(fixture);
    expect(makePreset).not.toHaveBeenCalled();
    expect(createCall).toHaveBeenCalledWith(SONG, expect.objectContaining({ presetId: 'old-style' }));
  });

  it('shows the server\'s reason when it cannot make the style, and makes no piece', async () => {
    const { fixture, el, get, go, createCall } = await create({ references: [own('a')], makePreset: () => throwError(() => new AnimationFailure('refused', 'the reference is not ready yet')) });
    await go('change-look');
    await go('reference-a');
    await go('next');
    await go('next');
    button(el).click();
    await settle(fixture);
    expect(get('refused')!.textContent).toContain('the reference is not ready yet');
    expect(createCall).not.toHaveBeenCalled();
    expect(button(el).disabled).toBe(false);
  });

  it('makes the piece from no look as before when none is chosen', async () => {
    const { fixture, el, createCall, makePreset } = await create();
    button(el).click();
    await settle(fixture);
    expect(makePreset).not.toHaveBeenCalled();
    expect((createCall.mock.calls[0] as unknown as [unknown, object])[1]).not.toHaveProperty('presetId');
  });
});

describe('NewPiecePage and the prompt', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Writes the text in the first step (where the box is) and comes back to the options, where the animation is made. */
  async function toPrompt(c: Awaited<ReturnType<typeof create>>, text: string) {
    await c.go('change-text');
    const area = c.el.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    await c.go('next');
    await c.go('next');
  }
  const createFromPrompt = async (c: Awaited<ReturnType<typeof create>>) => {
    c.get('create')!.click();
    await settle(c.fixture);
  };

  it('is on the first step, above the look, optional, and says what is done with the text', async () => {
    const c = await create({ query: {} });
    expect(c.get('prompt-step')!.textContent).toContain('optional');
    expect(c.get('prompt-hint')!.textContent).toContain('kept with the piece');
    expect(c.get('prompt-hint')!.textContent).toContain('the fixed rule writes them, and it does not read the text');
    expect(c.get('counter')!.textContent).toContain('0 of 2000');
    expect(c.get('prompt-step')!.compareDocumentPosition(c.get('look-step')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(c.el.textContent).toContain('writes the design and the script');
  });

  it('shows the text in the options, with a way to change it', async () => {
    const c = await create();
    expect(c.get('text')!.textContent).toContain('none');
    await toPrompt(c, 'neon city');
    expect(c.get('text')!.textContent).toContain('neon city');
  });

  it('makes the piece as always, with no prompt and no proposal, when the text is empty or only spaces', async () => {
    const c = await create();
    await toPrompt(c, '   ');
    await createFromPrompt(c);
    expect(c.createCall).toHaveBeenCalledTimes(1);
    expect((c.createCall.mock.calls[0] as unknown as unknown[])[1]).not.toHaveProperty('prompt');
    expect(c.saveDesign).not.toHaveBeenCalled();
    expect(c.proposeAll).not.toHaveBeenCalled();
    expect(c.navigate).toHaveBeenCalledWith(['/pieces/api-mm-9']);
  });

  it('makes the piece with the text as its prompt, asks the assistant for design and script in the background, and goes to the piece at once', async () => {
    const c = await create();
    await toPrompt(c, '  neon synthwave city, fast cuts  ');
    await createFromPrompt(c);
    expect((c.createCall.mock.calls[0] as unknown as unknown[])[1]).toMatchObject({ prompt: 'neon synthwave city, fast cuts' });
    expect(c.saveDesign).not.toHaveBeenCalled();
    expect(c.propose).not.toHaveBeenCalled();
    expect(c.proposeAll).toHaveBeenCalledWith('api-mm-9', {});
    expect(c.navigate).toHaveBeenCalledWith(['/pieces/api-mm-9']);
  });

  it('accepts a long text, up to 2000 characters', async () => {
    const c = await create();
    await toPrompt(c, 'x'.repeat(1500));
    expect((c.get('create') as HTMLButtonElement).disabled).toBe(false);
    await createFromPrompt(c);
    expect((c.createCall.mock.calls[0] as unknown as unknown[])[1]).toMatchObject({ prompt: 'x'.repeat(1500) });
  });

  it('sends the assistant chosen on the first step: the model of the routing, or an external provider with its model', async () => {
    const c = await create();
    await c.go('change-text');
    expect(c.get('assistant-field')).not.toBeNull();
    expect(c.get('add-provider-open')).not.toBeNull();
    chooseAssistant(c.fixture, { provider: '', model: 'gemma4:26b' });
    await settle(c.fixture);
    const area = c.el.querySelector('textarea')!;
    area.value = 'a look';
    area.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    await c.go('next');
    await c.go('next');
    await createFromPrompt(c);
    expect(c.proposeAll).toHaveBeenCalledWith('api-mm-9', { model: 'gemma4:26b' });

    TestBed.resetTestingModule();
    const d = await create();
    await d.go('change-text');
    chooseAssistant(d.fixture, { provider: 'router', model: 'gpt-x' });
    await settle(d.fixture);
    await d.go('next');
    await d.go('next');
    await toPrompt(d, 'a look');
    await createFromPrompt(d);
    expect(d.proposeAll).toHaveBeenCalledWith('api-mm-9', { provider: 'router', model: 'gpt-x' });
  });

  it('shows on the options step what the animation is made of, with the assistant, and what happens when it is created', async () => {
    const c = await create();
    await c.go('change-text');
    chooseAssistant(c.fixture, { provider: 'router', model: 'gpt-x' });
    await settle(c.fixture);
    await c.go('next');
    await c.go('next');
    expect(c.get('summary')).not.toBeNull();
    expect(c.get('assistant')!.textContent).toContain('router · gpt-x');
    expect(c.get('song')).not.toBeNull();
    expect(c.get('next-steps')!.querySelectorAll('li').length).toBe(3);
  });

  it('still makes the piece when the models of the routing cannot be read', async () => {
    const c = await create({ models: () => throwError(() => new AnimationFailure('unavailable', 'no assistant')) });
    await c.go('change-text');
    await c.go('next');
    await c.go('next');
    await toPrompt(c, 'a look');
    await createFromPrompt(c);
    expect(c.proposeAll).toHaveBeenCalledWith('api-mm-9', {});
  });

  it('keeps the piece and says why the assistant could not be asked when the server refuses it', async () => {
    const c = await create({ proposeAll: () => throwError(() => new AnimationFailure('refused', 'no assistant is configured')) });
    await toPrompt(c, 'a look');
    await createFromPrompt(c);
    expect(c.navigate).toHaveBeenCalledWith(['/pieces/api-mm-9'], { state: { promptNote: { kind: 'failed', reason: expect.stringContaining('no assistant is configured') } } });
  });

  it('keeps the notice about the words and the note about the assistant together', async () => {
    const c = await create({ createCall: () => of({ id: 'api-mm-9', notice: 'whisper is missing', design: { design: { dark: '#101018', light: '#f4f1ea', accent: '#00ffaa', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: 'c' }, source: 'fallback', edited: false } }), proposeAll: () => throwError(() => new AnimationFailure('refused', 'no assistant')) });
    await toPrompt(c, 'a look');
    await createFromPrompt(c);
    expect(c.navigate).toHaveBeenCalledWith(['/pieces/api-mm-9'], { state: { notice: 'whisper is missing', promptNote: { kind: 'failed', reason: expect.stringContaining('no assistant') } } });
  });

  it('keeps the notice about the words when the proposal starts', async () => {
    const c = await create({ createCall: () => of({ id: 'api-mm-9', notice: 'whisper is missing', design: { design: { dark: '#101018', light: '#f4f1ea', accent: '#00ffaa', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: 'c' }, source: 'fallback', edited: false } }) });
    await toPrompt(c, 'a look');
    await createFromPrompt(c);
    expect(c.navigate).toHaveBeenCalledWith(['/pieces/api-mm-9'], { state: { notice: 'whisper is missing' } });
  });

  it('with an own style keeps the text as the prompt of the piece and leaves the design and the script of the style alone', async () => {
    const design = { dark: '#101018', light: '#f4f1ea', accent: '#00ffaa', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: 'own' };
    const own = [{ id: 'l1', name: 'Neon city', design, rhythm: 8, parts: [CATALOG.parts[0].name], createdAt: 1 }];
    const c = await create({ own });
    await c.go('change-look');
    c.get('own-l1')!.click();
    await settle(c.fixture);
    expect(c.get('own-note')!.textContent).toContain('own style');
    await c.go('next');
    await c.go('next');
    await toPrompt(c, 'a look');
    await createFromPrompt(c);
    expect((c.createCall.mock.calls[0] as unknown as unknown[])[1]).toMatchObject({ prompt: 'a look' });
    expect(c.saveDesign).toHaveBeenLastCalledWith('api-mm-9', expect.objectContaining({ concept: 'own' }));
    expect(c.proposeAll).not.toHaveBeenCalled();
    expect(c.saveScript).toHaveBeenCalledTimes(1);
  });

  it('does not let a text longer than the piece keeps through, and says how many characters it has', async () => {
    const c = await create();
    await c.go('change-text');
    const area = c.el.querySelector('textarea')!;
    area.value = 'x'.repeat(2001);
    area.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    expect(c.get('counter')!.textContent).toContain('2001 of 2000');
    await c.go('next');
    await c.go('next');
    expect((c.get('create') as HTMLButtonElement).disabled).toBe(true);
    expect(c.createCall).not.toHaveBeenCalled();
  });
});

describe('NewPiecePage and its progress', () => {
  afterEach(() => vi.unstubAllGlobals());
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('shows nothing while the person is only choosing', async () => {
    const c = await create();
    expect(c.get('progress')).toBeNull();
  });

  it('shows at the top that the piece is being made, with the seconds that go by, so it never looks stuck', async () => {
    const pending = new Subject<PieceDetail>();
    const c = await create({ createCall: () => pending });
    c.get('create')!.click();
    await settle(c.fixture);
    expect(c.get('progress')).not.toBeNull();
    expect(c.get('stage')!.textContent).toContain('Creating the piece');
    expect(c.get('progress')!.textContent).toContain('Do not close this page');
    expect(c.get('created-note')).toBeNull();
    const before = c.get('elapsed')!.textContent;
    await wait(60);
    await settle(c.fixture);
    expect(c.get('elapsed')!.textContent).not.toBe(before);
    expect(c.get('elapsed')!.textContent).toMatch(/\d+ s so far/);
    expect((c.get('create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not hold the page while the assistant is asked: the proposal runs in the background', async () => {
    const asking = new Subject<unknown>();
    const c = await create({ proposeAll: () => asking });
    await toPromptOutside(c, 'neon city');
    c.get('create')!.click();
    await settle(c.fixture);
    expect(c.get('stage')!.textContent).toContain('Creating the piece');
    expect(c.get('script-note')).toBeNull();
    asking.next({ id: 'api-mm-9', proposal: { state: 'waiting', what: 'all', startedAt: 1 } });
    asking.complete();
    await settle(c.fixture);
    expect(c.navigate).toHaveBeenCalled();
  });

  it('takes the panel away and lets the person try again when the server refuses', async () => {
    const c = await create({ createCall: () => throwError(() => new AnimationFailure('refused', 'no room left')) });
    c.get('create')!.click();
    await settle(c.fixture);
    expect(c.get('progress')).toBeNull();
    expect(c.get('refused')!.textContent).toContain('no room left');
    expect((c.get('create') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says the stage in Spanish', async () => {
    const pending = new Subject<PieceDetail>();
    const c = await create({ createCall: () => pending, lang: 'es' });
    c.get('create')!.click();
    await settle(c.fixture);
    expect(c.get('stage')!.textContent).toContain('Creando la pieza');
    expect(c.get('elapsed')!.textContent).toMatch(/Van \d+ s/);
  });
});

/** Writes the text on the first step and comes back to the options, for the tests outside the prompt describe. */
async function toPromptOutside(c: Awaited<ReturnType<typeof create>>, text: string) {
  await c.go('change-text');
  const area = c.el.querySelector('textarea')!;
  area.value = text;
  area.dispatchEvent(new Event('input'));
  await settle(c.fixture);
  await c.go('next');
  await c.go('next');
}
