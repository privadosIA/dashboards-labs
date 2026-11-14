import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type AnimationPort, type Draft, type Part } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { DraftPage } from './draft.page';
import { draft } from './parts.page.spec';
import { assistTestProviders } from '../../testing/assist';

const full = (extra: Partial<Draft> = {}): Draft => draft('d1', { name: 'ticking-clock', request: 'a clock that ticks', withPicture: true, source: 'reference:ref-1/03.jpg', description: 'A dark scene.', attempts: 2, preview: ['/p/01.png', '/p/02.png'], manifest: '{"name":"ticking-clock"}', fragment: '<div>tick</div>', ...extra });
const part: Part = { name: 'ticking-clock', description: 'A clock that ticks', levels: ['simple'], costMs: 60, manual: false, params: [{ name: 'speed', type: 'number', default: '1' }] };

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(read: () => unknown, overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const list = new BehaviorSubject<readonly Draft[]>([]);
  const saveDraft = vi.fn((_id: string, t: { manifest: string; fragment: string }) => of(full(t)));
  const retryDraft = vi.fn(() => of(full({ state: 'writing', preview: [], manifest: undefined, fragment: undefined, name: undefined })));
  const approveDraft = vi.fn(() => of(part));
  const removeDraft = vi.fn(() => of(undefined));
  const port = { draft: read, drafts: () => list.asObservable(), saveDraft, retryDraft, approveDraft, removeDraft, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      provideRouter([]),
      provideLabForms({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'd1']]) }, paramMap: of(new Map([['id', 'd1']])) } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(DraftPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, list, saveDraft, retryDraft, approveDraft, removeDraft, navigate, text: () => el.textContent ?? '' };
}
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const button = (el: HTMLElement, id: string) => get(el, id) as HTMLButtonElement;
const confirm = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;
const answer = async (fixture: ComponentFixture<unknown>, testid: 'confirm' | 'cancel') => {
  confirm(testid).click();
  await new Promise((r) => setTimeout(r, 300));
  await settle(fixture);
};
const fragment = (el: HTMLElement) => el.querySelectorAll<HTMLTextAreaElement>('[data-testid="edit"] textarea')[1];

describe('DraftPage', () => {
  it('shows a ready draft: its name, where the picture came from and what was seen in it, the attempts, the preview with the ticket and its text', async () => {
    const { el } = await create(() => of(full()));
    expect(el.querySelector('h1')!.textContent).toContain('ticking-clock');
    expect(get(el, 'state')!.textContent).toContain('Ready');
    expect(get(el, 'source')!.textContent).toContain('Frame 03.jpg of reference ref-1');
    expect(get(el, 'seen')!.textContent).toContain('A dark scene.');
    expect(get(el, 'info')!.textContent).toContain('Attempts: 2');
    expect(el.querySelector('[data-testid="preview"] img')!.getAttribute('src')).toBe('/p/01.png?ticket=T');
    expect(fragment(el).value).toBe('<div>tick</div>');
  });

  it('says where an uploaded picture came from, and shows nothing about a picture when there was none', async () => {
    const up = await create(() => of(full({ source: 'upload' })));
    expect(get(up.el, 'source')!.textContent).toContain('uploaded picture');
    TestBed.resetTestingModule();
    const none = await create(() => of(full({ withPicture: false, source: undefined, description: undefined })));
    expect(get(none.el, 'source')).toBeNull();
    expect(get(none.el, 'seen')).toBeNull();
  });

  it('says it is being written, has no text to edit, and follows it until it is ready and shows the text', async () => {
    let reads = 0;
    const { fixture, el, list } = await create(() => of(reads++ === 0 ? full({ state: 'writing', name: undefined, preview: [], manifest: undefined, fragment: undefined }) : full()));
    expect(get(el, 'writing')!.textContent).toContain('half a minute');
    expect(get(el, 'edit')).toBeNull();
    expect(get(el, 'approve')).toBeNull();
    list.next([draft('d1', { state: 'ready', name: 'ticking-clock' })]);
    await settle(fixture);
    expect(get(el, 'writing')).toBeNull();
    expect(fragment(el).value).toBe('<div>tick</div>');
    expect(get(el, 'approve')).not.toBeNull();
  });

  it('shows why it failed and the problems of the last attempt, and offers to try again', async () => {
    const { el } = await create(() => of(full({ state: 'failed', error: 'no valid part after 3 attempts', problems: ['part.html: empty'] })));
    expect(get(el, 'failed')!.textContent).toContain('no valid part after 3 attempts');
    expect(get(el, 'last-problems')!.textContent).toContain('part.html: empty');
    expect(get(el, 'retry')).not.toBeNull();
    expect(get(el, 'approve')).toBeNull();
  });

  it('tries again: the draft is written again and followed', async () => {
    const { fixture, el, retryDraft } = await create(() => of(full({ state: 'failed', error: 'could not' })));
    button(el, 'retry').click();
    await settle(fixture);
    expect(retryDraft).toHaveBeenCalledWith('d1');
    expect(get(el, 'writing')).not.toBeNull();
    expect(get(el, 'retry')).toBeNull();
  });

  it('does not offer to try again when the picture was not kept, and says so', async () => {
    const { el } = await create(() => of(full({ state: 'failed', error: 'the picture shows a minor: it was not kept' })));
    expect(get(el, 'retry')).toBeNull();
    expect(get(el, 'picture-lost')!.textContent).toContain('not kept');
  });

  it('shows the reason a retry was refused', async () => {
    const { fixture, el } = await create(() => of(full({ state: 'failed', error: 'could not' })), { retryDraft: () => throwError(() => new AnimationFailure('busy', 'a run is active')) });
    button(el, 'retry').click();
    await settle(fixture);
    expect(get(el, 'refused')!.textContent).toContain('a run is active');
  });

  describe('editing the text', () => {
    it('saves the manifest and the fragment together and shows the new text', async () => {
      const { fixture, el, saveDraft } = await create(() => of(full()));
      const box = fragment(el);
      box.value = '<div>new</div>';
      box.dispatchEvent(new Event('input'));
      await settle(fixture);
      button(el, 'save').click();
      await settle(fixture);
      expect(saveDraft).toHaveBeenCalledWith('d1', { manifest: '{"name":"ticking-clock"}', fragment: '<div>new</div>' });
      expect(get(el, 'saved')).not.toBeNull();
      expect(fragment(el).value).toBe('<div>new</div>');
    });

    it('lists the problems the server finds, one to a line, and keeps what was typed while the draft stays as it was', async () => {
      const { fixture, el } = await create(() => of(full()), { saveDraft: () => throwError(() => new AnimationFailure('refused', 'part.html: it is empty\nmanifest.json: name is missing')) });
      const box = fragment(el);
      box.value = '<p>typed</p>';
      box.dispatchEvent(new Event('input'));
      await settle(fixture);
      button(el, 'save').click();
      await settle(fixture);
      expect(el.querySelectorAll('[data-testid="problems"] li')).toHaveLength(2);
      expect(get(el, 'problems')!.textContent).toContain('name is missing');
      expect(fragment(el).value).toBe('<p>typed</p>');
      expect(get(el, 'saved')).toBeNull();
    });

    it('shows a refusal that is not about the text, such as Chrome missing, in its own words', async () => {
      const { fixture, el } = await create(() => of(full()), { saveDraft: () => throwError(() => new AnimationFailure('unavailable', 'Chrome is not installed')) });
      button(el, 'save').click();
      await settle(fixture);
      expect(get(el, 'refused')!.textContent).toContain('Chrome is not installed');
      expect(get(el, 'problems')).toBeNull();
    });
  });

  describe('approving', () => {
    it('asks first, saying the part goes to the catalog, and approves only when confirmed', async () => {
      const { fixture, el, approveDraft } = await create(() => of(full()));
      button(el, 'approve').click();
      await settle(fixture);
      expect(document.body.textContent).toContain('goes to the catalog');
      await answer(fixture, 'cancel');
      expect(approveDraft).not.toHaveBeenCalled();
      button(el, 'approve').click();
      await settle(fixture);
      await answer(fixture, 'confirm');
      expect(approveDraft).toHaveBeenCalledWith('d1');
    });

    it('shows the part as the catalog lists it, with its parameters', async () => {
      const { fixture, el } = await create(() => of(full()));
      button(el, 'approve').click();
      await settle(fixture);
      await answer(fixture, 'confirm');
      expect(get(el, 'approved')!.textContent).toContain('ticking-clock');
      expect(get(el, 'approved')!.textContent).toContain('A clock that ticks');
      expect(get(el, 'approved-params')!.textContent).toContain('speed (number)');
    });

    it('says a part with that name exists and that the name is changed by editing, and keeps the draft', async () => {
      const { fixture, el } = await create(() => of(full()), { approveDraft: () => throwError(() => new AnimationFailure('busy', 'a part named "ticking-clock" already exists')) });
      button(el, 'approve').click();
      await settle(fixture);
      await answer(fixture, 'confirm');
      expect(get(el, 'refused')!.textContent).toContain('already exists');
      expect(get(el, 'name-taken')!.textContent).toContain('editing');
      expect(get(el, 'approved')).toBeNull();
      expect(button(el, 'approve')).not.toBeNull();
    });
  });

  it('asks before deleting and goes back to the list when it is deleted', async () => {
    const { fixture, el, removeDraft, navigate } = await create(() => of(full()));
    button(el, 'remove').click();
    await settle(fixture);
    await answer(fixture, 'cancel');
    expect(removeDraft).not.toHaveBeenCalled();
    button(el, 'remove').click();
    await settle(fixture);
    await answer(fixture, 'confirm');
    expect(removeDraft).toHaveBeenCalledWith('d1');
    expect(navigate).toHaveBeenCalledWith(['/parts']);
  });

  it('says the draft does not exist, or why it could not be read', async () => {
    const gone = await create(() => throwError(() => new AnimationFailure('missing', 'draft not found')));
    expect(get(gone.el, 'missing')!.textContent).toContain('no longer exists');
    TestBed.resetTestingModule();
    const broken = await create(() => throwError(() => new AnimationFailure('other', 'down')));
    expect(get(broken.el, 'reason')!.textContent).toContain('down');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(() => of(full()), {}, 'es');
    expect(text()).toContain('Texto de la parte');
    expect(text()).toContain('Aprobar la parte');
  });

  describe('a change of an approved part', () => {
    const ours: Part = { name: 'ticking-clock', description: 'A clock', levels: ['simple'], costMs: 60, manual: false, source: 'user', params: [] };
    const changed = (extra: Partial<Draft> = {}) => full({ replaces: 'ticking-clock', ...extra });

    it('offers to replace the part instead of approving when the draft says which part it changes and that part is the user\'s', async () => {
      const { el } = await create(() => of(changed()), { catalog: () => of({ parts: [ours] }) as never });
      expect(get(el, 'replace')!.textContent).toContain('Replace the part: ticking-clock');
      expect(get(el, 'approve')).toBeNull();
    });

    it('approves as always when the part it changes is gone, and when it changes none', async () => {
      const gone = await create(() => of(changed()), { catalog: () => of({ parts: [] }) as never });
      expect(get(gone.el, 'approve')).not.toBeNull();
      expect(get(gone.el, 'replace')).toBeNull();
      TestBed.resetTestingModule();
      const plain = await create(() => of(full()), { catalog: () => of({ parts: [ours] }) as never });
      expect(get(plain.el, 'approve')).not.toBeNull();
    });

    it('asks before replacing, saves the draft\'s text over the part, deletes the draft and says the part was replaced', async () => {
      const replacePart = vi.fn(() => of(ours));
      const removeDraft = vi.fn(() => of(undefined));
      const { fixture, el } = await create(() => of(changed()), { catalog: () => of({ parts: [ours] }) as never, replacePart, removeDraft });
      button(el, 'replace').click();
      await settle(fixture);
      expect(document.body.textContent).toContain('is saved over the approved part');
      await answer(fixture, 'cancel');
      expect(replacePart).not.toHaveBeenCalled();
      button(el, 'replace').click();
      await settle(fixture);
      await answer(fixture, 'confirm');
      expect(replacePart).toHaveBeenCalledWith('ticking-clock', { manifest: '{"name":"ticking-clock"}', fragment: '<div>tick</div>' });
      expect(removeDraft).toHaveBeenCalledWith('d1');
      expect(get(el, 'approved')!.textContent).toContain('Part replaced:');
    });

    it('shows what the server refuses on replacing, and keeps the draft', async () => {
      const removeDraft = vi.fn(() => of(undefined));
      const { fixture, el } = await create(() => of(changed()), { catalog: () => of({ parts: [ours] }) as never, replacePart: () => throwError(() => new AnimationFailure('refused', 'part.html: it is empty')), removeDraft });
      button(el, 'replace').click();
      await settle(fixture);
      await answer(fixture, 'confirm');
      expect(get(el, 'refused')!.textContent).toContain('it is empty');
      expect(removeDraft).not.toHaveBeenCalled();
      expect(get(el, 'approved')).toBeNull();
    });

    it('has the box to ask for a change on a draft with text, and not while it is being written', async () => {
      const ready = await create(() => of(full()));
      expect(get(ready.el, 'ask-change')).not.toBeNull();
      TestBed.resetTestingModule();
      const writing = await create(() => of(full({ state: 'writing', preview: [], manifest: undefined, fragment: undefined })));
      expect(get(writing.el, 'ask-change')).toBeNull();
    });
  });
});
