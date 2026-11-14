import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type Analysis, type AnimationPort, type Preset, type Reference } from '@lab/animation-core';
import { DesignStub } from './reference.page.fixture';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { ReferencePage } from './reference.page';

const analysis = (extra: Partial<Analysis> = {}): Analysis => ({
  duration: 90,
  fps: 30,
  width: 1280,
  height: 720,
  frames: ['/f/1.jpg', '/f/2.jpg'],
  colours: [{ hex: '#e63946', share: 0.4 }, { hex: '#264653', share: 0.3 }],
  thirds: [[{ hex: '#e63946', share: 0.5 }], [{ hex: '#264653', share: 0.5 }], [{ hex: '#e9c46a', share: 0.5 }]],
  cuts: 24,
  meanShot: 3.75,
  tempo: 112,
  key: 'A minor',
  description: 'Warm colours on a dark ground.',
  ...extra,
});
const ready = (extra: Partial<Reference> = {}): Reference => ({ id: 'ref-1', title: 'A good video', notes: 'fast cuts', tags: ['pop'], state: 'ready', createdAt: 1, source: 'https://youtu.be/x', analysis: analysis(), ...extra });
const preset = (extra: Partial<Preset> = {}): Preset => ({ id: 'p1', name: 'Warm pop', referenceId: 'ref-1', createdAt: 1, design: DesignStub, rhythm: 6, parts: [], adjustments: [], ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(read: () => unknown, overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const list = new BehaviorSubject<readonly Reference[]>([]);
  const port = { reference: read, references: () => list.asObservable(), editReference: vi.fn((_id: string, p: object) => of({ ...ready(), ...p })), makePreset: vi.fn(() => of(preset())), learnings: () => of([]), ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      provideRouter([]),
      provideLabForms({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'ref-1']]) } } },
    ],
  });
  const fixture = TestBed.createComponent(ReferencePage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, port: port as unknown as { editReference: ReturnType<typeof vi.fn>; makePreset: ReturnType<typeof vi.fn> }, list, text: () => el.textContent ?? '' };
}
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

describe('ReferencePage', () => {
  it('shows what the server read: the key frames with the ticket, the colours of the video and of each third, the facts and the description', async () => {
    const { el } = await create(() => of(ready()));
    expect(get(el, 'big-frame')!.getAttribute('src')).toBe('/f/1.jpg?ticket=T');
    expect(el.querySelectorAll('[data-testid="frames"] img')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="colours"] .swatch')).toHaveLength(2 + 3);
    expect(get(el, 'third-1')).not.toBeNull();
    const facts = get(el, 'facts')!.textContent!;
    for (const part of ['1:30', '1280×720', '24', '3.75', '112', 'A minor']) expect(facts).toContain(part);
    expect(get(el, 'description')!.textContent).toContain('Warm colours on a dark ground.');
    expect(get(el, 'origin')!.textContent).toContain('https://youtu.be/x');
  });

  it('shows another key frame when it is chosen', async () => {
    const { fixture, el } = await create(() => of(ready()));
    el.querySelectorAll<HTMLButtonElement>('[data-testid="frames"] button')[1].click();
    await settle(fixture);
    expect(get(el, 'big-frame')!.getAttribute('src')).toBe('/f/2.jpg?ticket=T');
  });

  it('says why there is no description, and leaves out the tempo and key it does not have', async () => {
    const { el } = await create(() => of(ready({ analysis: analysis({ description: undefined, descriptionNote: 'there is no vision model', tempo: undefined, key: undefined }) })));
    expect(get(el, 'no-description')!.textContent).toContain('there is no vision model');
    expect(get(el, 'tempo')).toBeNull();
    expect(get(el, 'key')).toBeNull();
  });

  it('says it is analysing, follows it until it is ready and then shows the analysis', async () => {
    const analysing = ready({ state: 'analysing', analysis: undefined });
    const { fixture, el, list } = await create(() => of(analysing));
    // the list starts empty, before its first read: that is not "gone"
    expect(get(el, 'missing')).toBeNull();
    expect(get(el, 'analysing')).not.toBeNull();
    expect(get(el, 'analysis')).toBeNull();
    expect((get(el, 'make-preset') as HTMLButtonElement).disabled).toBe(true);
    expect(get(el, 'not-ready')).not.toBeNull();
    list.next([ready()]);
    await settle(fixture);
    expect(get(el, 'analysing')).toBeNull();
    expect(get(el, 'analysis')).not.toBeNull();
    expect((get(el, 'make-preset') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says the reference is gone when the server says so while it was being followed', async () => {
    let first = true;
    const { fixture, el, list } = await create(() => (first ? ((first = false), of(ready({ state: 'analysing', analysis: undefined }))) : throwError(() => new AnimationFailure('missing', 'gone'))));
    list.next([]);
    await settle(fixture);
    expect(get(el, 'missing')).not.toBeNull();
  });

  it('shows the reason a reference failed', async () => {
    const { el } = await create(() => of(ready({ state: 'failed', error: 'no video stream', analysis: undefined })));
    expect(get(el, 'failed')!.textContent).toContain('no video stream');
  });

  it('shows an uploaded video as such', async () => {
    const { el } = await create(() => of(ready({ source: undefined })));
    expect(get(el, 'origin')!.textContent).toContain('Uploaded video');
  });

  it('edits the title, the notes and the tags and shows what the server saved', async () => {
    const { fixture, el, port } = await create(() => of(ready()));
    const title = el.querySelector<HTMLInputElement>('input[id*="_input_title_"]')!;
    expect(title.value).toBe('A good video');
    title.value = 'Renamed';
    title.dispatchEvent(new Event('input'));
    const tags = el.querySelector<HTMLInputElement>('input[id*="_input_tags_"]')!;
    expect(tags.value).toBe('pop');
    tags.value = 'pop, fast';
    tags.dispatchEvent(new Event('input'));
    await settle(fixture);
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(port.editReference).toHaveBeenCalledWith('ref-1', { title: 'Renamed', notes: 'fast cuts', tags: ['pop', 'fast'] });
    expect(get(el, 'saved')).not.toBeNull();
    expect(el.querySelector('h1')!.textContent).toContain('Renamed');
  });

  it('does not save an empty title', async () => {
    const { fixture, el } = await create(() => of(ready()));
    const title = el.querySelector<HTMLInputElement>('input[id*="_input_title_"]')!;
    title.value = '';
    title.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect((get(el, 'save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('makes a style and shows what had to be adjusted of the video\'s colours', async () => {
    const { fixture, el, port } = await create(() => of(ready()), { makePreset: vi.fn(() => of(preset({ adjustments: ['accent #333 became #ff5a3c'] }))) });
    (get(el, 'make-preset') as HTMLButtonElement).click();
    await settle(fixture);
    expect(port.makePreset).toHaveBeenCalledWith('ref-1');
    expect(get(el, 'made')!.textContent).toContain('Warm pop');
    expect(get(el, 'adjustments')!.textContent).toContain('accent #333 became #ff5a3c');
  });

  it('shows the server\'s reason when it cannot make the style', async () => {
    const { fixture, el } = await create(() => of(ready()), { makePreset: () => throwError(() => new AnimationFailure('refused', 'the reference is not ready')) });
    (get(el, 'make-preset') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'make-refused')!.textContent).toContain('the reference is not ready');
  });

  it('says the reference does not exist, or why it could not be read', async () => {
    const gone = await create(() => throwError(() => new AnimationFailure('missing', 'reference not found')));
    expect(get(gone.el, 'missing')!.textContent).toContain('no longer exists');
    TestBed.resetTestingModule();
    const broken = await create(() => throwError(() => new AnimationFailure('other', 'down')));
    expect(get(broken.el, 'reason')!.textContent).toContain('down');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(() => of(ready()), {}, 'es');
    expect(text()).toContain('Fotogramas clave');
    expect(text()).toContain('Hacer un estilo con ella');
  });

  it('opens the address of the video in another tab, and shows an uploaded one as plain text', async () => {
    const { el } = await create(() => of(ready()));
    const a = get(el, 'origin')!.querySelector<HTMLAnchorElement>('a')!;
    expect(a.getAttribute('href')).toBe('https://youtu.be/x');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    TestBed.resetTestingModule();
    const uploaded = await create(() => of(ready({ source: undefined })));
    expect(get(uploaded.el, 'origin')!.querySelector('a')).toBeNull();
  });

});
