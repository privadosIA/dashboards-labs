import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TicketService } from '@lab/server-connection';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { NEVER, Subject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { MUSIC_MOTION_LINKS } from '../core/external-links';
import { AnimationFailure, type AnimationPort, type Piece, type PieceDetail } from '@lab/animation-core';
import { CATALOG } from '../animation/fixtures';
import { ANIMATION } from '../animation/tokens';
import { serverDetail } from '../animation/server.fixture';
import { toDetail } from '../animation/server-mapping';
import { stubStorage } from '../../testing/memory-storage';
import { Notifier } from '../shared/notifier';
import { PiecePage } from './piece.page';
import { assistTestProviders } from '../../testing/assist';

async function create(piece: () => unknown, lang: 'es' | 'en' = 'en', extra: Partial<AnimationPort> = {}, stored: Record<string, string> = {}) {
  stubStorage(stored);
  const finished = vi.fn();
  // A piece that is being drawn is followed: unless a test says how, following says nothing and never ends.
  const port = { piece, catalog: () => of(CATALOG), follow: () => NEVER, assistModels: () => NEVER, ...extra } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      provideRouter([]),
      provideLabForms({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: Notifier, useValue: { allow: () => Promise.resolve(), finished } }, { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'api-mm-1']]) } } }],
  });
  const fixture = TestBed.createComponent(PiecePage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, finished, text: () => el.textContent ?? '' };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const piece = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), ...extra });

describe('PiecePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the piece with its title, state and design', async () => {
    const { el } = await create(() => of(piece()));
    expect(el.querySelector('h1')!.textContent).toBe('Quiet Town');
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('Draft');
    expect(el.querySelector('app-design-form')).not.toBeNull();
    expect(el.querySelector('[data-testid="drawing"]')).toBeNull();
  });

  it('offers Export dataset on the page, also while the piece is being drawn, and says what was saved', async () => {
    const created: { name: string }[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      created.push({ name: this.download });
    });
    const { fixture, el } = await create(() => of(piece({ state: 'running', progress: 10 })));
    const button = el.querySelector<HTMLButtonElement>('header [data-testid="export-dataset"]')!;
    expect(button.disabled).toBe(false);
    button.click();
    await settle(fixture);
    await new Promise((r) => setTimeout(r));
    await settle(fixture);
    expect(created).toEqual([{ name: 'quiet-town.motion.json' }]);
    expect(el.querySelector('[data-testid="export-refused"]')?.textContent ?? '').toBe('');
    expect(el.querySelector('[data-testid="export-saved"]')!.textContent).toContain('quiet-town.motion.json');
    vi.restoreAllMocks();
  });

  it('tells the person why the words were not heard when the piece was made asking for them, and stops saying it once they are', async () => {
    vi.stubGlobal('history', { state: { notice: 'whisper-cli is not installed' } });
    const heardIt = piece({ songMap: { ...piece().songMap, wordsEstimated: false } });
    const { fixture, el } = await create(() => of(piece()), 'en', { transcribe: () => of(heardIt) });
    expect(el.querySelector('[data-testid="created-notice"]')!.textContent).toContain('whisper-cli is not installed');
    el.querySelector<HTMLButtonElement>('[data-testid="sync-words"]')!.click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="created-notice"]')).toBeNull();
    expect(el.querySelector('[data-testid="words-note"]')!.textContent).toContain('heard');
    vi.unstubAllGlobals();
  });

  it('says which style the piece started from, or that it has been deleted', async () => {
    const named = await create(() => of(piece({ preset: 'p1' })), 'en', { preset: () => of({ id: 'p1', name: 'Warm pop' }) } as never);
    expect(named.el.querySelector('[data-testid="preset-origin"]')!.textContent).toContain('Warm pop');
    TestBed.resetTestingModule();
    const gone = await create(() => of(piece({ preset: 'p1' })), 'en', { preset: () => throwError(() => new AnimationFailure('missing', 'gone')) } as never);
    expect(gone.el.querySelector('[data-testid="preset-origin"]')!.textContent).toContain('deleted');
    TestBed.resetTestingModule();
    const none = await create(() => of(piece()));
    expect(none.el.querySelector('[data-testid="preset-origin"]')).toBeNull();
  });

  it('says when the piece started from an own style kept in the browser, and says nothing for another', async () => {
    const started = { 'music-motion.styles.video-anim.started': JSON.stringify({ 'api-mm-1': 'Neon city' }) };
    const own = await create(() => of(piece()), 'en', {}, started);
    expect(own.el.querySelector('[data-testid="own-origin"]')!.textContent).toContain('It started from an own style kept in this browser: Neon city');
    TestBed.resetTestingModule();
    const spanish = await create(() => of(piece()), 'es', {}, started);
    expect(spanish.el.querySelector('[data-testid="own-origin"]')!.textContent).toContain('Partió de un estilo propio de este navegador: Neon city');
    TestBed.resetTestingModule();
    const other = await create(() => of(piece()), 'en', {}, { 'music-motion.styles.video-anim.started': JSON.stringify({ 'api-mm-2': 'Neon city' }) });
    expect(other.el.querySelector('[data-testid="own-origin"]')).toBeNull();
  });

  it('shows one of draw and propose at a time, with the song map under both', async () => {
    const { fixture, el } = await create(() => of(piece()));
    const shown = () => ['render', 'propose'].filter((id) => !el.querySelector<HTMLElement>(`#panel-${id}`)!.hidden);
    expect(shown()).toEqual(['render']);
    el.querySelector<HTMLButtonElement>('[data-testid="tab-propose"]')!.click();
    await settle(fixture);
    expect(shown()).toEqual(['propose']);
    expect(el.querySelector('app-song-map')).not.toBeNull();
  });

  it('shows the song map and marks on it the span of the piece of the script the person asks to see', async () => {
    const { fixture, el } = await create(() => of(piece({ script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 8, part: 'toggle' }, { id: 'p2', start: 8, end: 20, part: 'toggle' }] } })));
    expect(el.querySelector('app-song-map')).not.toBeNull();
    expect(el.querySelector('[data-testid="span"]')).toBeNull();
    el.querySelectorAll<HTMLButtonElement>('[data-testid="show-on-map"]')[1].click();
    await settle(fixture);
    const rect = el.querySelector('[data-testid="span"]')!;
    expect(rect.getAttribute('x')).toBe('400');
    expect(rect.getAttribute('width')).toBe('600');
  });

  it('follows a piece that is already being drawn, puts its progress on the page and shows the video when it is done', async () => {
    const changes = new Subject<Piece>();
    let reads = 0;
    const done = piece({ state: 'done', progress: 100, video: 'http://server/v.mp4', sizeBytes: 5_000_000 });
    const follow = vi.fn(() => changes.asObservable());
    const { fixture, el, finished } = await create(() => (reads++ === 0 ? of(piece({ state: 'running', progress: 10 })) : of(done)), 'en', { follow });
    expect(follow).toHaveBeenCalledWith('api-mm-1');
    changes.next(piece({ state: 'running', progress: 30 }));
    await settle(fixture);
    expect(el.querySelector('[data-testid="progress"]')!.getAttribute('aria-valuenow')).toBe('30');
    expect(el.querySelector('video')).toBeNull();
    changes.next(piece({ state: 'done', progress: 100 }));
    changes.complete();
    await settle(fixture);
    expect(el.querySelector('video')!.getAttribute('src')).toBe('http://server/v.mp4?ticket=T');
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('Done');
    expect(finished).toHaveBeenCalledWith('Piece done', 'Quiet Town is drawn.');
  });

  it('starts following when the person presses Draw', async () => {
    const follow = vi.fn(() => of(piece({ state: 'queued' })));
    const render = vi.fn(() => of({ seconds: 5, frames: 10 }));
    const { fixture, el } = await create(() => of(piece()), 'en', { follow, render } as Partial<AnimationPort>);
    expect(follow).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-testid="draw"]')!.click();
    await settle(fixture);
    expect(render).toHaveBeenCalledWith('api-mm-1');
    expect(follow).toHaveBeenCalledWith('api-mm-1');
  });

  it('tells the person when the drawing failed, and shows the error', async () => {
    let reads = 0;
    const failed = piece({ state: 'failed', error: 'Chrome closed while drawing' });
    const follow = vi.fn(() => of(piece({ state: 'running', progress: 50 }), failed));
    const { fixture, el, finished } = await create(() => (reads++ === 0 ? of(piece({ state: 'queued' })) : of(failed)), 'en', { follow });
    await settle(fixture);
    expect(finished).toHaveBeenCalledWith('The piece failed', 'Quiet Town could not be drawn.');
    expect(el.querySelector('[data-testid="failed"]')!.textContent).toContain('Chrome closed while drawing');
  });

  it('shows nothing of a piece that was deleted while it was followed', async () => {
    let reads = 0;
    const follow = vi.fn(() => of(piece({ state: 'running', progress: 5 })));
    const { fixture, el } = await create(() => (reads++ === 0 ? of(piece({ state: 'running' })) : throwError(() => new AnimationFailure('missing', 'gone'))), 'en', { follow });
    await settle(fixture);
    expect(el.querySelector('[data-testid="missing"]')).not.toBeNull();
  });

  it('says the piece is being drawn and cannot be changed meanwhile', async () => {
    const { el, text } = await create(() => of(piece({ state: 'running', progress: 40 })));
    expect(el.querySelector('[data-testid="drawing"]')).not.toBeNull();
    expect(text()).toContain('cannot be changed until it ends');
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('Drawing');
  });

  it('says the piece does not exist when the server has none', async () => {
    const { el, text } = await create(() => throwError(() => new AnimationFailure('missing', 'piece "api-mm-1" not found')));
    expect(el.querySelector('[data-testid="missing"]')).not.toBeNull();
    expect(text()).toContain('That piece no longer exists.');
    expect(el.querySelector('[data-testid="reason"]')).toBeNull();
    expect(el.querySelector('app-design-form')).toBeNull();
  });

  it('shows the reason when the piece could not be read for another cause', async () => {
    const { el, text } = await create(() => throwError(() => new AnimationFailure('other', 'connection refused')));
    expect(text()).toContain('The piece could not be read.');
    expect(el.querySelector('[data-testid="reason"]')!.textContent).toContain('connection refused');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { el } = await create(() => of(piece({ state: 'queued' })), 'es');
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('En cola');
  });

  it('says once why the assistant could not be asked for the design and the script of a piece made from a prompt', async () => {
    history.replaceState({ promptNote: { kind: 'failed', reason: 'no assistant is configured' } }, '');
    const failed = await create(() => of(piece()));
    expect(failed.el.querySelector('[data-testid="prompt-note"]')!.textContent).toContain('could not be asked for the design and the script: no assistant is configured');
    TestBed.resetTestingModule();
    history.replaceState(null, '');
    const none = await create(() => of(piece()));
    expect(none.el.querySelector('[data-testid="prompt-note"]')).toBeNull();
  });

  it('follows a proposal that is being written, says what it is doing and with which model, and who wrote each part when it ends', async () => {
    const waiting = piece({ proposal: { state: 'waiting', what: 'all', model: 'qwen3:8b', startedAt: Date.now() } });
    const writing = piece({ proposal: { state: 'writing', what: 'all', model: 'qwen3:8b', startedAt: Date.now() } });
    const done = piece({ prompt: 'a calm night', proposal: { state: 'done', what: 'all', model: 'qwen3:8b', startedAt: Date.now() - 90_000, finishedAt: Date.now(), design: { source: 'assistant' }, script: { source: 'fallback', reason: 'the assistant failed. The fixed rule does not read the prompt.' } } });
    const updates = new Subject<PieceDetail>();
    const { fixture, el } = await create(() => of(waiting), 'en', { followProposal: () => updates.asObservable() });
    const strip = () => el.querySelector('[data-testid="proposal-strip"]')!;
    expect(strip().getAttribute('data-state')).toBe('waiting');
    expect(strip().textContent).toContain('Waiting for a run to end');
    expect(strip().textContent).toContain('Model: qwen3:8b');
    updates.next(writing);
    await settle(fixture);
    expect(strip().getAttribute('data-state')).toBe('writing');
    expect(strip().textContent).toContain('writing the design and the script');
    updates.next(done);
    updates.complete();
    await settle(fixture);
    expect(strip().getAttribute('data-state')).toBe('done');
    expect(el.querySelector('[data-testid="proposal-design"]')!.textContent).toContain('written by the assistant');
    expect(el.querySelector('[data-testid="proposal-script"]')!.textContent).toContain('written by the fixed rule. the assistant failed. The fixed rule does not read the prompt.');
  });

  it('turns the proposal buttons and the saving of the design and the script off while it is waiting or writing', async () => {
    const proposing = piece({ proposal: { state: 'writing', what: 'all', startedAt: Date.now() } });
    const { el } = await create(() => of(proposing), 'en', { followProposal: () => NEVER });
    expect(el.querySelector<HTMLButtonElement>('[data-testid="save-design"]')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[data-testid="save-script"]')!.disabled).toBe(true);
    el.querySelector<HTMLButtonElement>('[data-testid="tab-propose"]')!.click();
    expect(el.querySelector('[data-testid="proposing-note"]')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-testid="propose-all"]')!.disabled).toBe(true);
  });

  it('shows no proposal for a piece that has none, and does not follow one', async () => {
    const follow = vi.fn(() => NEVER);
    const { el } = await create(() => of(piece()), 'en', { followProposal: follow });
    expect(el.querySelector('[data-testid="proposal-strip"]')).toBeNull();
    expect(follow).not.toHaveBeenCalled();
  });

  it('starts following when a proposal for both is asked from the panel', async () => {
    const updates = new Subject<PieceDetail>();
    const started = piece({ proposal: { state: 'waiting', what: 'all', startedAt: Date.now() } });
    const follow = vi.fn(() => updates.asObservable());
    const { fixture, el } = await create(() => of(piece()), 'en', { proposeAll: () => of(started), followProposal: follow });
    el.querySelector<HTMLButtonElement>('[data-testid="tab-propose"]')!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="propose-all"]')!.click();
    await settle(fixture);
    (document.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(follow).toHaveBeenCalledWith('api-mm-1');
    expect(el.querySelector('[data-testid="proposal-strip"]')).not.toBeNull();
  });
});

describe('PiecePage, the link to where the piece is edited', () => {
  it('has Edit in Motion Edit when the host gave the place, leading to that piece', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { pieceEditor: (id: string) => `/animation/motion-edit/pieces/${id}` } });
    const { el } = await create(() => of(piece()));
    const link = el.querySelector('[data-testid="edit-in-motion-edit"]')!;
    expect(link.getAttribute('href')).toBe(`/animation/motion-edit/pieces/${piece().id}`);
  });

  it('has it while the piece is being drawn too, and none when the host gave none', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { pieceEditor: () => '/e' } });
    const drawing = await create(() => of(piece({ state: 'running', progress: 10 })));
    expect(drawing.el.querySelector('[data-testid="edit-in-motion-edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    const plain = await create(() => of(piece()));
    expect(plain.el.querySelector('[data-testid="edit-in-motion-edit"]')).toBeNull();
  });
});
