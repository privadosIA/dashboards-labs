import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, type Preset, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import type { Look } from '../look';
import { ANALYSIS_POLL_MS, LookStep } from './look-step';

const ref = (id: string, extra: Partial<Reference> = {}): Reference => ({ id, title: `Video ${id}`, notes: '', tags: ['edm', 'neon'], source: `https://youtu.be/${id}`, state: 'ready', createdAt: 1, analysis: { duration: 90, fps: 30, width: 1280, height: 720, frames: [`/f/${id}/01.jpg`], colours: [], thirds: [], cuts: 1, meanShot: 3 }, ...extra });
const preset = (id: string, name: string): Preset => ({ id, name, createdAt: 1, design: { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: {}, concept: '' }, rhythm: 6, parts: [], adjustments: [] });

const settle = async (fixture: ComponentFixture<unknown>) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

async function create(options: { references?: Reference[]; presets?: () => unknown; stored?: Record<string, string>; read?: (id: string) => unknown; addReference?: (...a: unknown[]) => unknown; lang?: 'es' | 'en' } = {}) {
  stubStorage(options.stored ?? {});
  const list = new BehaviorSubject<readonly Reference[]>(options.references ?? []);
  const addReference = vi.fn(options.addReference ?? ((input: { url: string }) => of(ref('new', { state: 'analysing', title: input.url, source: input.url }))));
  const reference = vi.fn(options.read ?? ((id: string) => of(ref(id))));
  const port = { references: () => list.asObservable(), presets: options.presets ?? (() => of([])), addReference, reference } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang: options.lang ?? 'en', client: 'video-anim' } }, provideLabForms({ lang: options.lang ?? 'en' }), { provide: ANIMATION, useValue: port }, { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } }, { provide: ANALYSIS_POLL_MS, useValue: 15 }],
  });
  const fixture = TestBed.createComponent(LookStep);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const look = () => fixture.componentInstance.look() as Look;
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  const write = async (value: string) => {
    const input = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  return { fixture, el, get, look, click, write, list, addReference, reference };
}

afterEach(() => vi.unstubAllGlobals());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('LookStep', () => {
  it('starts with no look chosen and says what that means', async () => {
    const { get, look } = await create();
    expect(look()).toEqual({ kind: 'none' });
    expect(get('look-none')!.getAttribute('aria-pressed')).toBe('true');
    expect(get('look-none')!.textContent).toContain('fixed rule');
  });

  it('shows the references with a key frame (through the ticket), title and tags, and says when there are none', async () => {
    const empty = await create();
    expect(empty.get('no-references')!.textContent).toContain('no references yet');
    TestBed.resetTestingModule();
    const { get, el } = await create({ references: [ref('a'), ref('b', { tags: [] })] });
    expect(get('no-references')).toBeNull();
    expect(get('reference-a')!.textContent).toContain('Video a');
    expect(get('reference-a')!.textContent).toContain('edm, neon');
    expect(get('reference-a')!.querySelector('img')!.getAttribute('src')).toBe('/f/a/01.jpg?ticket=T');
    expect(el.querySelectorAll('[data-testid^="reference-"]')).toHaveLength(2);
  });

  it('chooses a ready reference, and a style, an own style and none, one at a time', async () => {
    const own = [{ id: 'l1', name: 'Mine', design: preset('x', 'x').design, rhythm: 6, parts: [], createdAt: 1 }];
    const { get, look, click } = await create({ references: [ref('a')], presets: () => of([preset('p1', 'Warm pop')]), stored: { 'music-motion.styles.video-anim': JSON.stringify(own) } });
    await click('reference-a');
    expect(look()).toMatchObject({ kind: 'reference', reference: { id: 'a' } });
    expect(get('reference-a')!.getAttribute('aria-pressed')).toBe('true');
    expect(get('will-make')!.textContent).toContain('a style is made from this reference');
    await click('style-p1');
    expect(look()).toEqual({ kind: 'style', presetId: 'p1', name: 'Warm pop' });
    expect(get('reference-a')!.getAttribute('aria-pressed')).toBe('false');
    expect(get('will-make')).toBeNull();
    await click('own-l1');
    expect(look()).toEqual({ kind: 'own', id: 'l1', name: 'Mine' });
    await click('look-none');
    expect(look()).toEqual({ kind: 'none' });
  });

  it('shows a reference that is analysing, or has failed, and does not let it be chosen', async () => {
    const { get, look, click } = await create({ references: [ref('a', { state: 'analysing', analysis: undefined }), ref('b', { state: 'failed', error: 'the video could not be read' })], read: (id) => of(ref(id, { state: 'analysing', analysis: undefined })) });
    expect(get('reference-a')!.textContent).toContain('Analysing…');
    expect((get('reference-a') as HTMLButtonElement).disabled).toBe(true);
    expect(get('reference-b')!.textContent).toContain('Failed: the video could not be read');
    await click('reference-a');
    await click('reference-b');
    expect(look()).toEqual({ kind: 'none' });
  });

  it('refuses an address that is not YouTube and does not add it', async () => {
    const { get, write, addReference } = await create();
    await write('https://example.com/video');
    expect((get('add-reference') as HTMLButtonElement).disabled).toBe(true);
    get('add-reference')!.click();
    expect(addReference).not.toHaveBeenCalled();
  });

  it('adds a pasted YouTube address as a reference, shows it analysing in the grid, and says so', async () => {
    const { get, write, click, addReference, el } = await create();
    await write('https://youtu.be/gQvQ2NanBTI');
    expect((get('add-reference') as HTMLButtonElement).disabled).toBe(false);
    await click('add-reference');
    expect(addReference).toHaveBeenCalledWith({ url: 'https://youtu.be/gQvQ2NanBTI' });
    expect(get('added')!.textContent).toContain('it is being analysed');
    expect(el.querySelectorAll('[data-testid^="reference-"]')).toHaveLength(1);
    expect(get('reference-new')!.textContent).toContain('Analysing…');
    expect(el.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('');
  });

  it('shows the server\'s reason when it refuses the address, and adds nothing', async () => {
    const { get, write, click, el } = await create({ addReference: () => throwError(() => new AnimationFailure('refused', 'the video lasts more than 20 minutes')) });
    await write('https://youtu.be/longvideo');
    await click('add-reference');
    expect(get('refused')!.textContent).toContain('Could not add it:');
    expect(get('refused')!.textContent).toContain('the video lasts more than 20 minutes');
    expect(el.querySelectorAll('[data-testid^="reference-"]')).toHaveLength(0);
  });

  it('follows a reference that is analysing until it is ready, and then it can be chosen, without leaving the step', async () => {
    // The server says it is still analysing until the test lets it finish, so the first assertion does not race the poll.
    let finished = false;
    const { fixture, get, look, click, reference } = await create({ references: [ref('a', { state: 'analysing', analysis: undefined })], read: (id) => of(finished ? ref(id) : ref(id, { state: 'analysing', analysis: undefined })) });
    expect((get('reference-a') as HTMLButtonElement).disabled).toBe(true);
    finished = true;
    for (let i = 0; i < 160 && (get('reference-a') as HTMLButtonElement).disabled; i++) {
      await wait(25);
      await settle(fixture);
    }
    expect(reference).toHaveBeenCalledWith('a');
    expect((get('reference-a') as HTMLButtonElement).disabled).toBe(false);
    expect(get('reference-a')!.querySelector('img')).not.toBeNull();
    await click('reference-a');
    expect(look()).toMatchObject({ kind: 'reference', reference: { id: 'a', state: 'ready' } });
  });

  it('does not read again what is not being analysed', async () => {
    const { fixture, reference } = await create({ references: [ref('a')] });
    await wait(80);
    await settle(fixture);
    expect(reference).not.toHaveBeenCalled();
  });

  it('says there are no saved styles, and speaks Spanish', async () => {
    const { get, el } = await create({ lang: 'es' });
    expect(get('no-styles')!.textContent).toContain('No hay estilos guardados');
    expect(el.textContent).toContain('Dirección de YouTube');
  });
});
