import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { MUSIC_MOTION_LINKS } from '../core/external-links';
import { AnimationFailure, type AnimationPort, type Draft, type DraftInput, type Part, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { PartsPage } from './parts.page';
import { assistTestProviders } from '../../testing/assist';

export const userPart = (name: string, extra: Partial<Part> = {}): Part => ({ name, description: `The ${name} part`, levels: ['simple'], costMs: 60, manual: false, source: 'user', params: [], ...extra });
export const draft = (id: string, extra: Partial<Draft> = {}): Draft => ({ id, state: 'ready', request: `a part ${id}`, withPicture: false, attempts: 1, problems: [], createdAt: 1, preview: [], ...extra });
const ready = (extra: Partial<Reference> = {}): Reference => ({
  id: 'ref-1',
  title: 'A good video',
  notes: '',
  tags: [],
  state: 'ready',
  createdAt: 1,
  analysis: { duration: 90, fps: 30, width: 1280, height: 720, frames: ['/f/ref-1/01.jpg', '/f/ref-1/03%20b.jpg'], colours: [], thirds: [], cuts: 1, meanShot: 3 },
  ...extra,
});

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

function create(initial: readonly Draft[], overrides: Partial<AnimationPort> = {}, references: readonly Reference[] = [ready()], lang: 'es' | 'en' = 'en') {
  stubStorage();
  const list = new BehaviorSubject<readonly Draft[]>(initial);
  const askDraft = vi.fn((input: DraftInput) => of(draft('new', { state: 'writing', request: input.request })));
  const removeDraft = vi.fn(() => of(undefined));
  const port = { drafts: () => list.asObservable(), references: () => of(references), catalog: () => of({ parts: [] }), askDraft, removeDraft, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }, { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PartsPage);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, list, askDraft, removeDraft, navigate, text: () => el.textContent ?? '' };
}

const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const ask = (el: HTMLElement) => get(el, 'ask') as HTMLButtonElement;
const confirm = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;
const phrase = async (fixture: ComponentFixture<unknown>, value: string) => {
  const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea')!;
  box.value = value;
  box.dispatchEvent(new Event('input'));
  await settle(fixture);
};
const source = async (fixture: ComponentFixture<unknown>, value: 'none' | 'frame' | 'file') => {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!.click();
  await settle(fixture);
};

describe('PartsPage', () => {
  it('lists the drafts with their state, saying one is being written and why one failed', async () => {
    const { fixture, el, text } = create([draft('a', { name: 'ticking-clock' }), draft('b', { state: 'writing' }), draft('c', { state: 'failed', error: 'no valid part after 3 attempts' })]);
    await settle(fixture);
    expect(el.querySelectorAll('li.card')).toHaveLength(3);
    expect(get(el, 'draft-a')!.querySelector('h2')!.textContent).toContain('ticking-clock');
    expect(get(el, 'draft-b')!.querySelector('[data-testid="writing"]')!.textContent).toContain('half a minute');
    expect(get(el, 'draft-c')!.querySelector('[data-testid="error"]')!.textContent).toContain('no valid part');
    expect(text()).toContain('Being written');
  });

  it('says there are none, and reflects the list when a draft is done, without a reload', async () => {
    const empty = create([]);
    await settle(empty.fixture);
    expect(get(empty.el, 'empty')).not.toBeNull();
    TestBed.resetTestingModule();
    const { fixture, el, list } = create([draft('b', { state: 'writing' })]);
    await settle(fixture);
    list.next([draft('b', { name: 'my-part' })]);
    await settle(fixture);
    expect(get(el, 'draft-b')!.querySelector('[data-testid="state"]')!.textContent).toContain('Ready');
    expect(get(el, 'writing')).toBeNull();
  });

  it('opens a draft', async () => {
    const { fixture, el, navigate } = create([draft('a')]);
    await settle(fixture);
    (get(el, 'open') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/parts/a']);
  });

  it('asks before deleting, saying a draft being written is stopped, and shows why a deletion did not happen', async () => {
    const { fixture, el, removeDraft } = create([draft('a')]);
    await settle(fixture);
    (get(el, 'remove') as HTMLButtonElement).click();
    await settle(fixture);
    expect(document.body.textContent).toContain('work stops');
    confirm('cancel').click();
    await new Promise((r) => setTimeout(r, 300));
    expect(removeDraft).not.toHaveBeenCalled();
    (get(el, 'remove') as HTMLButtonElement).click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    expect(removeDraft).toHaveBeenCalledWith('a');
    TestBed.resetTestingModule();
    const failing = create([draft('a')], { removeDraft: () => throwError(() => new AnimationFailure('other', 'it is busy')) });
    await settle(failing.fixture);
    (get(failing.el, 'remove') as HTMLButtonElement).click();
    await settle(failing.fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(failing.fixture);
    expect(get(failing.el, 'refused')!.textContent).toContain('it is busy');
  });

  describe('the parts of the user\'s', () => {
    const builtin = userPart('toggle', { source: 'builtin' });
    const catalogWith = (...parts: Part[]) => ({ catalog: () => of({ parts }) as never });
    const open = async (fixture: ComponentFixture<unknown>, el: HTMLElement, id: string, which: 'mine-edit' | 'mine-remove') => {
      (get(el, id)!.querySelector(`[data-testid="${which}"]`) as HTMLButtonElement).click();
      await settle(fixture);
    };
    const answer = async (fixture: ComponentFixture<unknown>, testid: 'confirm' | 'cancel') => {
      confirm(testid).click();
      await new Promise((r) => setTimeout(r, 300));
      await settle(fixture);
    };

    it('lists the approved parts with Edit and Delete and leaves out the ones that come with the program; says when there are none', async () => {
      const { fixture, el } = create([], catalogWith(builtin, userPart('bars'), userPart('dots')));
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid="mine"] li.card')).toHaveLength(2);
      expect(get(el, 'mine-toggle')).toBeNull();
      expect(get(el, 'mine-bars')!.textContent).toContain('The bars part');
      TestBed.resetTestingModule();
      const none = create([], catalogWith(builtin));
      await settle(none.fixture);
      expect(get(none.el, 'mine-empty')).not.toBeNull();
    });

    it('opens a part to edit it and the form to write one from scratch', async () => {
      const { fixture, el, navigate } = create([], catalogWith(userPart('bars')));
      await settle(fixture);
      await open(fixture, el, 'mine-bars', 'mine-edit');
      expect(navigate).toHaveBeenCalledWith(['/parts/mine/bars']);
      expect(get(el, 'new-scratch')!.getAttribute('href')).toBe('/parts/new');
    });

    it('asks before deleting, and does nothing when it is cancelled', async () => {
      const removePart = vi.fn(() => of(undefined));
      const { fixture, el } = create([], { ...catalogWith(userPart('bars')), removePart });
      await settle(fixture);
      await open(fixture, el, 'mine-bars', 'mine-remove');
      expect(document.body.textContent).toContain('leaves the catalog');
      await answer(fixture, 'cancel');
      expect(removePart).not.toHaveBeenCalled();
      expect(get(el, 'mine-bars')).not.toBeNull();
    });

    it('deletes a part and takes it off the list', async () => {
      const removePart = vi.fn(() => of(undefined));
      const { fixture, el } = create([], { ...catalogWith(userPart('bars'), userPart('dots')), removePart });
      await settle(fixture);
      await open(fixture, el, 'mine-bars', 'mine-remove');
      await answer(fixture, 'confirm');
      expect(removePart).toHaveBeenCalledWith('bars', false);
      expect(get(el, 'mine-bars')).toBeNull();
      expect(get(el, 'mine-dots')).not.toBeNull();
    });

    it('says what uses a part that is in use and deletes it anyway only when that is asked', async () => {
      const removePart = vi.fn((_name: string, force?: boolean) => (force ? of(undefined) : throwError(() => new AnimationFailure('busy', 'the part "bars" is used by piece p1, style s1'))));
      const { fixture, el } = create([], { ...catalogWith(userPart('bars')), removePart });
      await settle(fixture);
      await open(fixture, el, 'mine-bars', 'mine-remove');
      await answer(fixture, 'confirm');
      expect(document.body.textContent).toContain('used by piece p1, style s1');
      expect(document.body.textContent).toContain('stop being valid');
      await answer(fixture, 'cancel');
      expect(removePart).toHaveBeenCalledTimes(1);
      expect(get(el, 'mine-bars')).not.toBeNull();
      await open(fixture, el, 'mine-bars', 'mine-remove');
      await answer(fixture, 'confirm');
      await answer(fixture, 'confirm');
      expect(removePart).toHaveBeenLastCalledWith('bars', true);
      expect(get(el, 'mine-bars')).toBeNull();
    });

    it('shows a refusal that is not about use in the server\'s words and keeps the part', async () => {
      const removePart = vi.fn(() => throwError(() => new AnimationFailure('missing', 'part "bars" not found')));
      const { fixture, el } = create([], { ...catalogWith(userPart('bars')), removePart });
      await settle(fixture);
      await open(fixture, el, 'mine-bars', 'mine-remove');
      await answer(fixture, 'confirm');
      expect(get(el, 'refused')!.textContent).toContain('not found');
      expect(get(el, 'mine-bars')).not.toBeNull();
    });

    it('names a draft made from a text that has no sentence', async () => {
      const { fixture, el } = create([draft('a', { request: '', name: undefined, state: 'failed', error: 'manifest.json: name is missing' })]);
      await settle(fixture);
      expect(get(el, 'draft-a')!.querySelector('h2')!.textContent).toContain('A part made by hand');
    });
  });

  describe('paged lists', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => draft(`d${String(i).padStart(2, '0')}`));
    const parts = (n: number) => Array.from({ length: n }, (_, i) => userPart(`part-${String(i).padStart(2, '0')}`));
    const paginators = (el: HTMLElement) => el.querySelectorAll('mat-paginator');

    it('shows ten drafts and ten parts, each with its own paginator, and the ask form outside both', async () => {
      const { fixture, el } = create(many(25), { catalog: () => of({ parts: parts(12) }) as never });
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid^="draft-"]')).toHaveLength(10);
      expect(el.querySelectorAll('[data-testid^="mine-part-"]')).toHaveLength(10);
      expect(paginators(el)).toHaveLength(2);
      expect(el.querySelector('[data-testid="ask-part"]')!.closest('mat-paginator, lab-paged-list')).toBeNull();
    });

    it('has no paginator for a few drafts and a few parts', async () => {
      const { fixture, el } = create(many(3), { catalog: () => of({ parts: parts(2) }) as never });
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid^="draft-"]')).toHaveLength(3);
      expect(paginators(el)).toHaveLength(0);
    });

    it('goes back a page when the only part on the last one is deleted', async () => {
      const removePart = vi.fn(() => of(undefined));
      const { fixture, el } = create([], { catalog: () => of({ parts: parts(11) }) as never, removePart });
      await settle(fixture);
      (el.querySelector('mat-paginator .mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid^="mine-part-"]')).toHaveLength(1);
      (el.querySelector('[data-testid="mine-part-10"] [data-testid="mine-remove"], [data-testid="mine-part-10"] [data-testid="mine-remove"]') as HTMLButtonElement).click();
      await settle(fixture);
      confirm('confirm').click();
      await new Promise((r) => setTimeout(r, 300));
      await settle(fixture);
      expect(removePart).toHaveBeenCalledWith('part-10', false);
      expect(el.querySelectorAll('[data-testid^="mine-part-"]')).toHaveLength(10);
    });

    it('has the paginator in Spanish when the host is', async () => {
      const { fixture, el } = create(many(25), {}, [ready()], 'es');
      await settle(fixture);
      expect(el.querySelector('mat-paginator')!.textContent).toContain('por página');
    });
  });

  describe('asking for a part', () => {
    it('shows no fault before the button is pressed; pressed with no phrase it asks nothing and shows the fault; and with no picture it says the part is written from the phrase alone', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      expect(ask(el).disabled).toBe(false);
      expect(el.querySelector('[data-testid="ask-part"] mat-error')).toBeNull();
      expect(get(el, 'no-picture')!.textContent).toContain('phrase alone');
      expect(get(el, 'age-warning')).toBeNull();
      ask(el).click();
      await settle(fixture);
      expect(askDraft).not.toHaveBeenCalled();
      expect(el.querySelector('[data-testid="ask-part"] mat-error')).not.toBeNull();
      await phrase(fixture, 'a clock that ticks');
      ask(el).click();
      await settle(fixture);
      expect(askDraft).toHaveBeenCalledTimes(1);
    });

    it('does not let a phrase of more than 500 characters through', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      await phrase(fixture, 'a'.repeat(501));
      ask(el).click();
      await settle(fixture);
      expect(askDraft).not.toHaveBeenCalled();
      await phrase(fixture, 'a'.repeat(500));
      ask(el).click();
      await settle(fixture);
      expect(askDraft).toHaveBeenCalledTimes(1);
    });

    it('asks with the phrase alone, and the form empties', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      await phrase(fixture, ' a clock that ticks ');
      ask(el).click();
      await settle(fixture);
      expect(askDraft).toHaveBeenCalledWith({ request: ' a clock that ticks ' });
      expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    });

    it('asks with a key frame of a reference, with the reference and the name of the frame', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      await phrase(fixture, 'a clock');
      await source(fixture, 'frame');
      expect(get(el, 'age-warning')!.textContent).toContain('minor');
      expect(get(el, 'picture-problem')).toBeNull();
      ask(el).click();
      await settle(fixture);
      expect(askDraft).not.toHaveBeenCalled();
      expect(get(el, 'picture-problem')).not.toBeNull();
      el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle(fixture);
      [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => o.textContent?.trim() === 'A good video')!.click();
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid="frames"] img')).toHaveLength(2);
      expect(el.querySelector('[data-testid="frames"] img')!.getAttribute('src')).toBe('/f/ref-1/01.jpg?ticket=T');
      el.querySelectorAll<HTMLButtonElement>('[data-testid="frames"] button')[1].click();
      await settle(fixture);
      expect(get(el, 'picture-problem')).toBeNull();
      ask(el).click();
      await settle(fixture);
      expect(askDraft).toHaveBeenCalledWith({ request: 'a clock', referenceId: 'ref-1', frame: '03 b.jpg' });
    });

    it('says there are no references to choose a frame from when there are none ready', async () => {
      const { fixture, el } = create([], {}, [ready({ state: 'analysing', analysis: undefined })]);
      await settle(fixture);
      await source(fixture, 'frame');
      expect(get(el, 'no-references')).not.toBeNull();
    });

    it('asks with a picture of its own, once there is one', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      await phrase(fixture, 'a clock');
      await source(fixture, 'file');
      ask(el).click();
      await settle(fixture);
      expect(askDraft).not.toHaveBeenCalled();
      expect(get(el, 'picture-problem')).not.toBeNull();
      const picker = get(el, 'file') as HTMLInputElement;
      const file = new File([new Uint8Array(10)], 'p.png', { type: 'image/png' });
      Object.defineProperty(picker, 'files', { value: [file], configurable: true });
      picker.dispatchEvent(new Event('change'));
      await settle(fixture);
      expect(get(el, 'file-name')!.textContent).toContain('p.png');
      ask(el).click();
      await settle(fixture);
      expect(askDraft).toHaveBeenCalledWith({ request: 'a clock', file });
    });

    it('does not take a picture of a kind the server does not', async () => {
      const { fixture, el, askDraft } = create([]);
      await settle(fixture);
      await phrase(fixture, 'a clock');
      await source(fixture, 'file');
      const picker = get(el, 'file') as HTMLInputElement;
      Object.defineProperty(picker, 'files', { value: [new File(['x'], 'p.gif', { type: 'image/gif' })], configurable: true });
      picker.dispatchEvent(new Event('change'));
      await settle(fixture);
      ask(el).click();
      await settle(fixture);
      expect(askDraft).not.toHaveBeenCalled();
      expect(get(el, 'picture-problem')).not.toBeNull();
    });

    it('shows the server\'s reason when it refuses and keeps the phrase, so it can be changed and asked again', async () => {
      const { fixture, el } = create([], { askDraft: () => throwError(() => new AnimationFailure('busy', 'a run is active and the model is local')) });
      await settle(fixture);
      await phrase(fixture, 'a clock');
      ask(el).click();
      await settle(fixture);
      expect(get(el, 'refused')!.textContent).toContain('a run is active');
      expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('a clock');
      expect(ask(el).disabled).toBe(false);
    });
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { fixture, text } = create([draft('a', { state: 'writing' })], {}, [ready()], 'es');
    await settle(fixture);
    expect(text()).toContain('Pedir una parte');
    expect(text()).toContain('Escribiéndose');
  });
});

describe('PartsPage, the link to the vector catalog', () => {
  it('has the Vector link in its header when the host gave the catalog, and none when it did not', async () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { vectorCatalog: '/animation/vector/catalog' } });
    const withLink = create([]);
    await settle(withLink.fixture);
    expect(get(withLink.el, 'vector-catalog')!.getAttribute('href')).toBe('/animation/vector/catalog');
    expect(get(withLink.el, 'vector-catalog')!.textContent).toBe('Vector parts');
    TestBed.resetTestingModule();
    const without = create([]);
    await settle(without.fixture);
    expect(get(without.el, 'vector-catalog')).toBeNull();
  });
});
