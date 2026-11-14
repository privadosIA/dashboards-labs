import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { DATASET_STUDIO_OPTIONS } from '../../core/options';
import { LocalPrompts } from '../adapters';
import type { Preset } from '../model';
import { MemoryPresetStore } from '../own-store';
import { PROMPTS } from '../port';
import { PresetBrowser } from './preset-browser';

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}
async function create(options: { kind?: 'images' | 'video' | 'songs' | null; lang?: 'es' | 'en'; local?: LocalPrompts } = {}) {
  TestBed.resetTestingModule();
  const port = options.local ?? new LocalPrompts(new MemoryPresetStore());
  TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, provideLabForms({ lang: options.lang ?? 'en' }), { provide: PROMPTS, useValue: port }] });
  const fixture = TestBed.createComponent(PresetBrowser);
  if (options.kind !== undefined) fixture.componentRef.setInput('kind', options.kind);
  const inserted: Preset[] = [];
  fixture.componentInstance.insert.subscribe((p) => inserted.push(p));
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, browser: fixture.componentInstance, port, inserted };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('li.card')];
type Internals = { form: { set: (v: Record<string, unknown>) => void }; setKind: (k: string | null) => void };

describe('PresetBrowser', () => {
  it('lists the presets of the kind it serves, each with its source and licence and no Delete for a bundled one', async () => {
    const { el } = await create({ kind: 'images' });
    expect(cards(el).length).toBe(5);
    expect(q(el, 'source-sample-1')!.textContent).toContain('dashboards-lab-sample · CC0-1.0');
    expect(el.querySelector('[data-testid^="delete-"]')).toBeNull();
    expect(q(el, 'kind-chips')).toBeNull();
  });

  it('searches as the person types, best match first', async () => {
    const { fixture, el } = await create({ kind: 'images' });
    (fixture.componentInstance as unknown as Internals).form.set({ q: 'neon' });
    await settle(fixture);
    expect(cards(el).length).toBeGreaterThan(0);
    expect(cards(el)[0].textContent).toContain('Neon street in the rain');
    (fixture.componentInstance as unknown as Internals).form.set({ q: 'zzzz' });
    await settle(fixture);
    expect(q(el, 'empty')).not.toBeNull();
  });

  it('shows kind chips on the full page and narrows by a kind and by a tag chip', async () => {
    const { fixture, el } = await create({ kind: null });
    expect(cards(el).length).toBe(25);
    q(el, 'kind-music')!.click();
    await settle(fixture);
    expect(cards(el).length).toBe(5);
    q(el, 'tag-instrumental')!.click();
    await settle(fixture);
    expect(cards(el).length).toBe(2);
    expect(q(el, 'tag-instrumental')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('asks the page to insert a preset', async () => {
    const { el, inserted } = await create({ kind: 'images' });
    q(el, 'insert-sample-1')!.click();
    expect(inserted.map((p) => p.id)).toEqual(['sample-1']);
  });

  it('pins up to five examples, disables the sixth and unpins', async () => {
    const { fixture, el, browser } = await create({ kind: 'video' });
    const ids = cards(el).map((c) => c.dataset['testid']!.replace('preset-', ''));
    for (const id of ids) q(el, `pin-${id}`)!.click();
    await settle(fixture);
    expect(browser.pinned().length).toBe(5);
    const extra = await create({ kind: null });
    const all = cards(extra.el).map((c) => c.dataset['testid']!.replace('preset-', ''));
    for (const id of all.slice(0, 5)) q(extra.el, `pin-${id}`)!.click();
    await settle(extra.fixture);
    expect((q(extra.el, `pin-${all[5]}`) as HTMLButtonElement).disabled).toBe(true);
    q(extra.el, `pinned-${all[0]}`)!.click();
    await settle(extra.fixture);
    expect(extra.browser.pinned().length).toBe(4);
    expect((q(extra.el, `pin-${all[5]}`) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lets the person delete their own preset and nothing else, and drops it from the pinned', async () => {
    const local = new LocalPrompts(new MemoryPresetStore());
    const { fixture, el, browser } = await create({ kind: 'images', local });
    const mine = await new Promise<Preset>((resolve) => local.add({ kind: 'image', title: 'Mine', prompt: 'a zebra', tags: [], language: 'en', source: 'user', licence: 'own' }).subscribe(resolve));
    (fixture.componentRef.setInput as (n: string, v: unknown) => void)('version', 1);
    await settle(fixture);
    q(el, `pin-${mine.id}`)!.click();
    expect(browser.pinned().map((p) => p.id)).toEqual([mine.id]);
    q(el, `delete-${mine.id}`)!.click();
    await settle(fixture);
    expect(q(el, `preset-${mine.id}`)).toBeNull();
    expect(browser.pinned()).toEqual([]);
  });

  it('speaks Spanish when the host does', async () => {
    const { el } = await create({ kind: 'images', lang: 'es' });
    expect(q(el, 'insert-sample-1')!.textContent).toContain('Insertar');
  });
});
