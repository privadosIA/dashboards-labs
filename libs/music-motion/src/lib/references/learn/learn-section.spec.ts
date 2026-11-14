import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, type Learning, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { LearnSection } from './learn-section';

const reference = (extra: Partial<Reference> = {}): Reference => ({ id: 'ref-1', title: 'A good video', notes: '', tags: [], state: 'ready', createdAt: 1, ...extra });
const learning = (extra: Partial<Learning> = {}): Learning => ({ id: 'learn-1', referenceId: 'ref-1', state: 'ready', strictness: 'normal', createdAt: Date.parse('2026-11-10T10:00:00Z'), styles: [], partDrafts: [], discarded: [], skipped: [], ...extra });
const finished = learning({
  styles: [{ id: 'preset-2', name: 'Neon terminal', novel: true, state: 'ready', similarTo: { kind: 'style', id: 'preset-1', name: 'Warm pop', distance: 0.62, reason: 'another palette' } }],
  partDrafts: [{ id: 'draft-1', name: 'scanlines', novel: true, state: 'writing' }, { id: 'draft-9', name: 'old idea', novel: true, state: 'gone' }],
  discarded: [{ kind: 'part', name: 'counter again', idea: 'a counter again', similarTo: { kind: 'part', name: 'counter', distance: 0.1, reason: 'the same drawing' }, reason: 'too similar to the part "counter"' }],
  skipped: [{ what: 'part scanlines', reason: 'the vision model is not installed' }],
});

type Spy = ReturnType<typeof vi.fn>;
type Spies = { learn: Spy; learning: Spy; learnings: Spy };

async function create(port: Spies, ref: Reference = reference(), lang: 'es' | 'en' = 'en') {
  stubStorage();
  TestBed.configureTestingModule({
    providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port as unknown as AnimationPort }],
  });
  const fixture = TestBed.createComponent(LearnSection);
  fixture.componentRef.setInput('reference', ref);
  fixture.componentRef.setInput('pollMs', 10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) => {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 2000 },
    );
  };
  return { fixture, el, settle, get: (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null, all: (id: string) => Array.from(el.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[] };
}

const spies = (over: Partial<Spies> = {}): Spies => ({
  learn: vi.fn(() => of(learning({ state: 'running' }))),
  learning: vi.fn(() => of(finished)),
  learnings: vi.fn(() => of([])),
  ...over,
});

describe('LearnSection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is disabled, and says why, for a reference that is not ready', async () => {
    const port = spies();
    const { get } = await create(port, reference({ state: 'analysing' }));
    expect((get('learn-go') as HTMLButtonElement).disabled).toBe(true);
    expect(get('learn-not-ready')!.textContent).toContain('Only a ready reference');
    expect(get('nothing-enters')!.textContent).toContain('Nothing enters the catalog by itself');
  });

  it('asks the server with the strictness chosen, shows it running and then everything it made', async () => {
    const port = spies();
    const { fixture, get, all, el, settle } = await create(port);
    expect(get('history-empty')).not.toBeNull();
    // the strictness is a select of the form: choose `high`
    const select = el.querySelector('mat-select') as HTMLElement | null;
    expect(select).not.toBeNull();
    fixture.componentInstance['model'].set({ strictness: 'high' });
    fixture.detectChanges();
    get('learn-go')!.click();
    expect(port.learn).toHaveBeenCalledWith('ref-1', 'high');
    await settle(() => expect(get('learned-styles')).not.toBeNull());
    expect(get('learning-running')).toBeNull();
    expect(all('learned-style').map((n) => n.querySelector('strong')!.textContent)).toEqual(['Neon terminal']);
    expect(get('learned-style')!.textContent).toContain('Similar to the style «Warm pop» (distance 0.62): another palette');
    expect(all('learned-part').map((n) => n.querySelector('strong')!.textContent)).toEqual(['scanlines', 'old idea']);
    expect(all('learned-part')[0].textContent).toContain('Being written');
    expect(get('discarded')!.textContent).toContain('a counter again');
    expect(get('discarded')!.textContent).toContain('too similar to the part "counter"');
    expect(get('skipped')!.textContent).toContain('part scanlines: the vision model is not installed');
  });

  it('links a style and a draft to their screens, and shows a gone one as no longer existing, with no link', async () => {
    const port = spies({ learnings: vi.fn(() => of([finished])) });
    const { all, get } = await create(port);
    expect(get('open-style')!.getAttribute('href')).toBe('/presets/preset-2');
    const parts = all('learned-part');
    expect(parts[0].querySelector('[data-testid="open-part"]')!.getAttribute('href')).toBe('/parts/draft-1');
    expect(parts[1].querySelector('[data-testid="open-part"]')).toBeNull();
    expect(parts[1].classList.contains('gone')).toBe(true);
    expect(parts[1].textContent).toContain('No longer exists');
  });

  it('reads a running learning again until it ends, and says so while it runs', async () => {
    let n = 0;
    const port = spies({ learn: vi.fn(() => of(learning({ state: 'running' }))), learning: vi.fn(() => of(++n < 3 ? learning({ state: 'running' }) : learning({ styles: finished.styles }))) });
    const { get, settle } = await create(port);
    get('learn-go')!.click();
    await settle(() => expect(get('learning-running')).not.toBeNull());
    await settle(() => expect(get('learned-styles')).not.toBeNull());
    expect(port.learning).toHaveBeenCalledTimes(3);
  });

  it('goes on reading a finished learning while a draft it made is still being written, and shows it ready when it is', async () => {
    let n = 0;
    const writing = learning({ state: 'ready', partDrafts: [{ id: 'draft-1', name: 'scanlines', novel: true, state: 'writing' }] });
    const written = learning({ state: 'ready', partDrafts: [{ id: 'draft-1', name: 'scanlines', novel: true, state: 'ready' }] });
    const port = spies({ learnings: vi.fn(() => of([writing])), learning: vi.fn(() => of(++n < 3 ? writing : written)) });
    const { all, settle } = await create(port);
    expect(all('learned-part')[0].textContent).toContain('Being written');
    await settle(() => expect(all('learned-part')[0].textContent).toContain('Ready'));
    const calls = port.learning.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(port.learning.mock.calls.length).toBe(calls);
  });

  it('follows the learning that was already running when the page opens, and starts nothing', async () => {
    const port = spies({ learnings: vi.fn(() => of([learning({ state: 'running' })])) });
    const { get, settle } = await create(port);
    expect(get('learning-running')).not.toBeNull();
    expect((get('learn-go') as HTMLButtonElement).disabled).toBe(true);
    await settle(() => expect(get('learned-styles')).not.toBeNull());
    expect(port.learn).not.toHaveBeenCalled();
  });

  it('stops reading when the page is left', async () => {
    const port = spies({ learn: vi.fn(() => of(learning({ state: 'running' }))), learning: vi.fn(() => of(learning({ state: 'running' }))) });
    const { fixture, get, settle } = await create(port);
    get('learn-go')!.click();
    await settle(() => expect(port.learning.mock.calls.length).toBeGreaterThan(1));
    fixture.destroy();
    const calls = port.learning.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(port.learning.mock.calls.length).toBe(calls);
  });

  it('shows the server\'s reason when a learning fails, and offers to learn again', async () => {
    const port = spies({ learnings: vi.fn(() => of([learning({ state: 'failed', reason: 'the assistant is not running' })])) });
    const { get } = await create(port);
    expect(get('learning-failed')!.textContent).toContain('the assistant is not running');
    expect(get('learn-go')!.textContent).toContain('Learn again');
    expect((get('learn-go') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says what the server refused on starting, in its words', async () => {
    const port = spies({ learn: vi.fn(() => throwError(() => new AnimationFailure('busy', 'reference "ref-1" is not ready'))) });
    const { get, settle } = await create(port);
    get('learn-go')!.click();
    await settle(() => expect(get('learn-refused')!.textContent).toContain('reference "ref-1" is not ready'));
  });

  it('lists the earlier learnings newest first and puts one on view', async () => {
    const older = learning({ id: 'learn-0', strictness: 'low', createdAt: Date.parse('2026-11-09T10:00:00Z'), styles: [{ id: 's', name: 'Old style', novel: true, state: 'ready' }] });
    const port = spies({ learnings: vi.fn(() => of([finished, older])) });
    const { all, get, settle } = await create(port);
    expect(all('history-item')).toHaveLength(2);
    expect(get('learned-style')!.textContent).toContain('Neon terminal');
    (all('history-open')[1] as HTMLButtonElement).click();
    await settle(() => expect(get('learned-style')!.textContent).toContain('Old style'));
    expect(get('learning-strictness')!.textContent).toContain('Low');
    expect((all('history-open')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('speaks Spanish', async () => {
    const port = spies({ learnings: vi.fn(() => of([finished])) });
    const { el } = await create(port, reference(), 'es');
    expect(el.textContent).toContain('Aprender de esta referencia');
    expect(el.textContent).toContain('Nada entra en el catálogo por sí solo');
    expect(el.textContent).toContain('Ya no existe');
  });
});

