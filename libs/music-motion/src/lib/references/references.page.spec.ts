import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type Learning, type AnimationPort, type Reference, type ReferenceInput } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { ReferencesPage } from './references.page';

export const reference = (id: string, extra: Partial<Reference> = {}): Reference => ({ id, title: `Video ${id}`, notes: '', tags: [], state: 'ready', createdAt: 1, ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

function create(initial: readonly Reference[], overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const list = new BehaviorSubject<readonly Reference[]>(initial);
  const addReference = vi.fn((input: ReferenceInput) => of(reference('new', { state: 'analysing', title: input.title ?? 'new' })));
  const removeReference = vi.fn(() => of(undefined));
  const port = { references: () => list.asObservable(), learnings: () => of([]), addReference, removeReference, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ReferencesPage);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, list, addReference, removeReference, navigate, text: () => el.textContent ?? '' };
}

const type = async (fixture: ComponentFixture<unknown>, name: string, value: string) => {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
};
const add = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="add"]')!;
const confirm = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

describe('ReferencesPage', () => {
  it('says on a card how many styles and parts the newest learning of that reference kept', async () => {
    const learning = (id: string, referenceId: string, styles: number, parts: number, extra: Partial<Learning> = {}): Learning => ({
      id,
      referenceId,
      state: 'ready',
      strictness: 'normal',
      createdAt: 1,
      styles: Array.from({ length: styles }, (_, i) => ({ id: `s${i}`, name: 's', novel: true, state: 'ready' })),
      partDrafts: Array.from({ length: parts }, (_, i) => ({ id: `d${i}`, name: 'd', novel: true, state: 'ready' })),
      discarded: [],
      skipped: [],
      ...extra,
    });
    // newest first: a running one is not counted, and an older one of the same reference never overrides the newest
    const { fixture, el } = create([reference('a'), reference('b')], { learnings: () => of([learning('l3', 'a', 9, 9, { state: 'running' }), learning('l2', 'a', 1, 2), learning('l1', 'a', 5, 5)]) });
    await settle(fixture);
    expect(el.querySelector('[data-testid="reference-a"] [data-testid="taught"]')!.textContent).toContain('Taught 1 style and 2 parts');
    expect(el.querySelector('[data-testid="reference-b"] [data-testid="taught"]')).toBeNull();
  });

  it('shows no count when the server cannot say what was learned', async () => {
    const { fixture, el } = create([reference('a')], { learnings: () => throwError(() => new AnimationFailure('other', 'no')) });
    await settle(fixture);
    expect(el.querySelectorAll('app-reference-card')).toHaveLength(1);
    expect(el.querySelector('[data-testid="taught"]')).toBeNull();
  });

  it('lists the references with their state, tags and, for one that is analysing, that it takes some seconds', async () => {
    const { fixture, el, text } = create([reference('a', { tags: ['pop', 'fast'] }), reference('b', { state: 'analysing' }), reference('c', { state: 'failed', error: 'no video stream' })]);
    await settle(fixture);
    expect(el.querySelectorAll('app-reference-card')).toHaveLength(3);
    expect(el.querySelector('[data-testid="reference-a"] [data-testid="tags"]')!.textContent).toContain('pop');
    expect(el.querySelector('[data-testid="reference-b"] [data-testid="analysing"]')!.textContent).toContain('seconds');
    expect(el.querySelector('[data-testid="reference-c"] [data-testid="error"]')!.textContent).toContain('no video stream');
    expect(text()).toContain('Analysing');
    expect(text()).toContain('Ready');
  });

  it('says there are none, and shows the form that adds one', async () => {
    const { fixture, el } = create([]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="add-reference"]')).not.toBeNull();
  });

  it('reflects the list when it changes, without a reload', async () => {
    const { fixture, el, list } = create([reference('b', { state: 'analysing' })]);
    await settle(fixture);
    list.next([reference('b')]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="reference-b"] [data-testid="state"]')!.textContent).toContain('Ready');
    expect(el.querySelector('[data-testid="analysing"]')).toBeNull();
  });

  it('opens a reference', async () => {
    const { fixture, el, navigate } = create([reference('a')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="open"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/references/a']);
  });

  it('asks before deleting, saying an analysis in progress is stopped, and deletes when confirmed', async () => {
    const { fixture, el, removeReference } = create([reference('a')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="remove"]')!.click();
    await settle(fixture);
    expect(document.body.textContent).toContain('analysis stops');
    confirm('cancel').click();
    await new Promise((r) => setTimeout(r, 300));
    expect(removeReference).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-testid="remove"]')!.click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    expect(removeReference).toHaveBeenCalledWith('a');
  });

  it('shows why a deletion did not happen', async () => {
    const { fixture, el } = create([reference('a')], { removeReference: () => throwError(() => new AnimationFailure('other', 'it is busy')) });
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="remove"]')!.click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('it is busy');
  });

  describe('adding', () => {
    it('does not add until there is an address or a file, and says so', async () => {
      const { fixture, el } = create([]);
      await settle(fixture);
      expect(add(el).disabled).toBe(true);
      expect(el.querySelector('[data-testid="source-hint"]')).not.toBeNull();
      await type(fixture, 'url', 'not an address');
      expect(add(el).disabled).toBe(true);
    });

    it('adds by address with its title and tags written with commas, and the form empties', async () => {
      const { fixture, el, addReference } = create([]);
      await settle(fixture);
      await type(fixture, 'url', 'https://www.youtube.com/watch?v=abc');
      await type(fixture, 'title', 'My video');
      await type(fixture, 'tags', 'pop, fast ,pop');
      expect(add(el).disabled).toBe(false);
      add(el).click();
      await settle(fixture);
      expect(addReference).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.youtube.com/watch?v=abc', title: 'My video', tags: ['pop', 'fast'] }));
      expect(el.querySelector<HTMLInputElement>('input[id*="_input_url_"]')!.value).toBe('');
    });

    it('adds by file, and refuses both an address and a file at once', async () => {
      const { fixture, el, addReference } = create([]);
      await settle(fixture);
      const picker = el.querySelector<HTMLInputElement>('[data-testid="file"]')!;
      const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      Object.defineProperty(picker, 'files', { value: [file], configurable: true });
      picker.dispatchEvent(new Event('change'));
      await settle(fixture);
      expect(el.querySelector('[data-testid="file-name"]')!.textContent).toContain('clip.mp4');
      expect(add(el).disabled).toBe(false);
      await type(fixture, 'url', 'https://youtu.be/x');
      expect(add(el).disabled).toBe(true);
      await type(fixture, 'url', '');
      add(el).click();
      await settle(fixture);
      expect(addReference).toHaveBeenCalledWith(expect.objectContaining({ file }));
    });

    it('shows the server\'s reason when it refuses and keeps what was written', async () => {
      const { fixture, el } = create([], { addReference: () => throwError(() => new AnimationFailure('refused', 'the video lasts more than 20 minutes')) });
      await settle(fixture);
      await type(fixture, 'url', 'https://youtu.be/long');
      add(el).click();
      await settle(fixture);
      expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('more than 20 minutes');
      expect(el.querySelector<HTMLInputElement>('input[id*="_input_url_"]')!.value).toBe('https://youtu.be/long');
      expect(add(el).disabled).toBe(false);
    });
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { fixture, text } = create([reference('a', { state: 'analysing' })], {}, 'es');
    await settle(fixture);
    expect(text()).toContain('Referencias');
    expect(text()).toContain('Analizando');
  });

  it('pages the list ten at a time, and goes back to the last page when its last item goes', async () => {
    sessionStorage.clear();
    const { fixture, el, list } = create(Array.from({ length: 25 }, (_, i) => reference(`r${i}`)));
    const next = () => el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!;
    await settle(fixture);
    expect(el.querySelectorAll('app-reference-card')).toHaveLength(10);
    expect(el.querySelector('[data-testid="add-reference"]')).not.toBeNull();
    next().click();
    next().click();
    await settle(fixture);
    expect(el.querySelectorAll('app-reference-card')).toHaveLength(5);
    list.next(Array.from({ length: 20 }, (_, i) => reference(`r${i}`)));
    await settle(fixture);
    expect(el.querySelectorAll('app-reference-card')).toHaveLength(10);
    expect(el.querySelector('[data-testid="reference-r19"]')).not.toBeNull();
  });

  it('has no paginator for a short list, and its paginator speaks Spanish in Spanish', async () => {
    sessionStorage.clear();
    const short = create([reference('a')]);
    await settle(short.fixture);
    expect(short.el.querySelector('mat-paginator')).toBeNull();
    TestBed.resetTestingModule();
    const es = create(Array.from({ length: 25 }, (_, i) => reference(`r${i}`)), {}, 'es');
    await settle(es.fixture);
    expect(es.text()).toContain('Elementos por página');
    expect(es.text()).toContain('1 – 10 de 25');
  });
});
