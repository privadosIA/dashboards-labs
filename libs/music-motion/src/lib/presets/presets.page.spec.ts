import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type AnimationPort, type Design, type Preset, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { DESIGN } from '../../testing/design';
import { stubStorage } from '../../testing/memory-storage';
import { PresetsPage } from './presets.page';

const preset = (id: string, extra: Partial<Preset> = {}): Preset => ({ id, name: `Style ${id}`, referenceId: 'ref-1', createdAt: 1, design: DESIGN, rhythm: 6, parts: [], adjustments: [], ...extra });
const ref = (id: string): Reference => ({ id, title: id, notes: '', tags: [], state: 'ready', createdAt: 1 });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

/** A style kept in the browser, as the store writes it. */
const own = (id: string, extra: object = {}) => ({ id, name: `Own ${id}`, design: DESIGN, rhythm: 8, parts: ['toggle'], createdAt: 1, ...extra });

function create(initial: readonly Preset[], references: readonly Reference[] = [ref('ref-1')], overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en', kept: readonly object[] = []) {
  stubStorage(kept.length ? { 'music-motion.styles.video-anim': JSON.stringify(kept) } : {});
  const removePreset = vi.fn(() => of(undefined));
  const port = { presets: () => of(initial), references: () => new BehaviorSubject(references).asObservable(), removePreset, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideRouter([]), { provide: ANIMATION, useValue: port }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PresetsPage);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, removePreset, navigate, text: () => el.textContent ?? '' };
}
const confirm = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

describe('PresetsPage', () => {
  it('lists the styles with their rhythm and parts, and says all the usual ones when there are none chosen', async () => {
    const { fixture, el } = create([preset('a'), preset('b', { rhythm: 4, parts: ['toggle', 'counter'] })]);
    await settle(fixture);
    expect(el.querySelectorAll('li.card')).toHaveLength(2);
    expect(el.querySelector('[data-testid="preset-a"] [data-testid="summary"]')!.textContent).toContain('6 s');
    expect(el.querySelector('[data-testid="preset-a"] [data-testid="summary"]')!.textContent).toContain('All the usual ones');
    expect(el.querySelector('[data-testid="preset-b"] [data-testid="summary"]')!.textContent).toContain('toggle, counter');
  });

  it('says a style\'s reference is gone, but still lists the style', async () => {
    const { fixture, el } = create([preset('a'), preset('b', { referenceId: 'ref-gone' })]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="preset-a"] [data-testid="gone"]')).toBeNull();
    expect(el.querySelector('[data-testid="preset-b"] [data-testid="gone"]')).not.toBeNull();
  });

  it('says there are none and points to the references', async () => {
    const { fixture, el } = create([]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="empty"]')!.textContent).toContain('References');
  });

  it('opens a style to edit it', async () => {
    const { fixture, el, navigate } = create([preset('a')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="open"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/presets/a']);
  });

  it('asks before deleting and takes the style out of the list when it is deleted', async () => {
    const { fixture, el, removePreset } = create([preset('a'), preset('b')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="preset-a"] [data-testid="remove"]')!.click();
    await settle(fixture);
    confirm('cancel').click();
    await new Promise((r) => setTimeout(r, 300));
    expect(removePreset).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('[data-testid="preset-a"] [data-testid="remove"]')!.click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(removePreset).toHaveBeenCalledWith('a');
    expect(el.querySelectorAll('li.card')).toHaveLength(1);
  });

  it('shows why a deletion did not happen and keeps the style', async () => {
    const { fixture, el } = create([preset('a')], [ref('ref-1')], { removePreset: () => throwError(() => new AnimationFailure('other', 'it is busy')) });
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="remove"]')!.click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('it is busy');
    expect(el.querySelectorAll('li.card')).toHaveLength(1);
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { fixture, text } = create([preset('a')], [ref('ref-1')], {}, 'es');
    await settle(fixture);
    expect(text()).toContain('Estilos');
    expect(text()).toContain('Todas las habituales');
  });

  it('pages the styles ten at a time, with no paginator for a short list', async () => {
    sessionStorage.clear();
    const long = create(Array.from({ length: 23 }, (_, i) => preset(`p${i}`)));
    await settle(long.fixture);
    expect(long.el.querySelectorAll('li.card')).toHaveLength(10);
    long.el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    long.el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    await settle(long.fixture);
    expect(long.el.querySelectorAll('li.card')).toHaveLength(3);
    TestBed.resetTestingModule();
    const short = create([preset('a'), preset('b'), preset('c')]);
    await settle(short.fixture);
    expect(short.el.querySelectorAll('li.card')).toHaveLength(3);
    expect(short.el.querySelector('mat-paginator')).toBeNull();
  });
});

describe('PresetsPage and the styles kept in the browser', () => {
  it('has a New style button that goes to the builder', async () => {
    const { fixture, el } = create([preset('a')]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="new-style"]')!.getAttribute('href')).toBe('/presets/new');
  });

  it('lists them after the server\'s, marked as kept in this browser, with their rhythm and parts', async () => {
    const { fixture, el } = create([preset('a')], undefined, {}, 'en', [own('l1'), own('l2', { parts: [], rhythm: 4 })]);
    await settle(fixture);
    const section = el.querySelector('[data-testid="own"]')!;
    expect(section.textContent).toContain('Kept in this browser');
    expect(section.querySelectorAll('li.card')).toHaveLength(2);
    expect(section.querySelector('[data-testid="own-l1"] [data-testid="badge"]')!.textContent).toContain('In this browser');
    expect(section.querySelector('[data-testid="own-l1"] [data-testid="summary"]')!.textContent).toContain('8 s');
    expect(section.querySelector('[data-testid="own-l2"] [data-testid="summary"]')!.textContent).toContain('All the usual ones');
    expect(el.querySelector('[data-testid="preset-a"]')).not.toBeNull();
  });

  it('shows only them, with no empty notice, when the server has no style', async () => {
    const { fixture, el } = create([], undefined, {}, 'en', [own('l1')]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="empty"]')).toBeNull();
    expect(el.querySelector('[data-testid="own-l1"]')).not.toBeNull();
  });

  it('shows no section when there are none kept', async () => {
    const { fixture, el } = create([preset('a')]);
    await settle(fixture);
    expect(el.querySelector('[data-testid="own"]')).toBeNull();
  });

  it('opens one in the builder', async () => {
    const { fixture, el, navigate } = create([], undefined, {}, 'en', [own('l1')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="own-l1"] [data-testid="open-own"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/presets/local/l1']);
  });

  it('asks before removing one, and keeps it when the person cancels', async () => {
    const { fixture, el } = create([], undefined, {}, 'en', [own('l1'), own('l2')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="own-l1"] [data-testid="remove-own"]')!.click();
    await settle(fixture);
    expect(document.body.textContent).toContain('Own l1');
    confirm('cancel').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(el.querySelector('[data-testid="own-l1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="own-l2"]')).not.toBeNull();
  });

  it('removes one from the browser, and only that one, when the person confirms', async () => {
    const { fixture, el, removePreset } = create([], undefined, {}, 'en', [own('l1'), own('l2')]);
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="own-l1"] [data-testid="remove-own"]')!.click();
    await settle(fixture);
    confirm('confirm').click();
    await new Promise((r) => setTimeout(r, 300));
    await settle(fixture);
    expect(el.querySelector('[data-testid="own-l1"]')).toBeNull();
    expect(el.querySelector('[data-testid="own-l2"]')).not.toBeNull();
    expect(removePreset).not.toHaveBeenCalled();
  });
});
