import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Part } from '@lab/animation-core';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { PartPicker } from './part-picker';

const part = (name: string, levels: Part['levels'] = ['simple', 'medium', 'advanced'], extra: Partial<Part> = {}): Part => ({ name, description: `draws ${name}`, levels, costMs: 12, manual: false, params: [], ...extra });
const CATALOG = ['sun', 'grid', 'nebula', 'clock', 'web', 'scope', 'cloud', 'wave', 'ring'].map((n) => part(n)).concat(part('deep', ['advanced']), part('only-named', undefined, { manual: true }));

async function create(chosen: string[] = [], lang: 'es' | 'en' = 'en') {
  stubStorage();
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }] });
  const fixture = TestBed.createComponent(PartPicker);
  fixture.componentRef.setInput('catalog', CATALOG);
  fixture.componentRef.setInput('chosen', chosen);
  const seen: (readonly string[])[] = [];
  fixture.componentInstance.chosen.subscribe((v) => seen.push(v));
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const all = (id: string) => Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const names = () => all('chosen').flatMap((o) => Array.from(o.querySelectorAll('li:not(.none) .name')).map((n) => n.textContent!.trim()));
  return { fixture, el, q, all, names, seen };
}

async function settle(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const add = async (c: Awaited<ReturnType<typeof create>>, name: string) => {
  (c.q(`part-${name}`)!.querySelector('[data-testid="add"]') as HTMLButtonElement).click();
  await settle(c.fixture);
};

afterEach(() => vi.unstubAllGlobals());

describe('PartPicker', () => {
  it('shows the catalog with each part\'s description, levels and cost, and none chosen at first', async () => {
    const c = await create();
    expect(c.all('catalog')[0].querySelectorAll(':scope > li')).toHaveLength(CATALOG.length);
    expect(c.q('part-sun')!.textContent).toContain('draws sun');
    expect(c.q('part-sun')!.textContent).toContain('12 ms per frame');
    expect(c.q('part-only-named')!.textContent).toContain('Only when the script names it');
    expect(c.q('none')!.textContent).toContain('No part chosen');
    expect(c.q('count')!.textContent).toContain('0 of 8');
  });

  it('adds parts in the order they are picked, and the model follows', async () => {
    const c = await create();
    await add(c, 'grid');
    await add(c, 'sun');
    expect(c.names()).toEqual(['grid', 'sun']);
    expect(c.seen.at(-1)).toEqual(['grid', 'sun']);
    expect(c.q('count')!.textContent).toContain('2 of 8');
  });

  it('refuses a part that is already chosen', async () => {
    const c = await create(['sun']);
    expect((c.q('part-sun')!.querySelector('[data-testid="add"]') as HTMLButtonElement).disabled).toBe(true);
    (c.fixture.componentInstance as unknown as { add(p: Part): void }).add(CATALOG[0]);
    await settle(c.fixture);
    expect(c.names()).toEqual(['sun']);
  });

  it('refuses a ninth part and says that a style has at most 8', async () => {
    const c = await create(CATALOG.slice(0, 8).map((p) => p.name));
    expect(c.q('full')!.textContent).toContain('at most 8');
    expect((c.q('part-ring')!.querySelector('[data-testid="add"]') as HTMLButtonElement).disabled).toBe(true);
    (c.fixture.componentInstance as unknown as { add(p: Part): void }).add(CATALOG[8]);
    await settle(c.fixture);
    expect(c.names()).toHaveLength(8);
    expect(c.names()).not.toContain('ring');
  });

  it('refuses a part the chosen level does not draw, says why, and allows it at another level', async () => {
    const c = await create();
    const level = c.q('level') as HTMLSelectElement;
    level.value = 'simple';
    level.dispatchEvent(new Event('change'));
    await settle(c.fixture);
    const deep = c.q('part-deep')!;
    expect((deep.querySelector('[data-testid="add"]') as HTMLButtonElement).disabled).toBe(true);
    expect(deep.querySelector('[data-testid="why"]')!.textContent).toContain('not drawn at the Simple level');
    level.value = 'advanced';
    level.dispatchEvent(new Event('change'));
    await settle(c.fixture);
    await add(c, 'deep');
    expect(c.names()).toEqual(['deep']);
  });

  it('searches by name and by description, and says when nothing matches', async () => {
    const c = await create();
    const search = c.q('search') as HTMLInputElement;
    search.value = 'neb';
    search.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    expect(c.all('catalog')[0].querySelectorAll(':scope > li')).toHaveLength(1);
    search.value = 'draws cl';
    search.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    expect(c.q('part-clock')).not.toBeNull();
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    await settle(c.fixture);
    expect(c.q('no-match')!.textContent).toContain('No part matches');
  });

  it('moves a chosen part up and down, removes one, and cannot move past the ends', async () => {
    const c = await create(['sun', 'grid', 'nebula']);
    const row = (n: string) => c.q(`chosen-${n}`)!;
    expect((row('sun').querySelector('[data-testid="up"]') as HTMLButtonElement).disabled).toBe(true);
    expect((row('nebula').querySelector('[data-testid="down"]') as HTMLButtonElement).disabled).toBe(true);
    (row('nebula').querySelector('[data-testid="up"]') as HTMLButtonElement).click();
    await settle(c.fixture);
    expect(c.names()).toEqual(['sun', 'nebula', 'grid']);
    (row('sun').querySelector('[data-testid="down"]') as HTMLButtonElement).click();
    await settle(c.fixture);
    expect(c.names()).toEqual(['nebula', 'sun', 'grid']);
    (row('sun').querySelector('[data-testid="remove"]') as HTMLButtonElement).click();
    await settle(c.fixture);
    expect(c.names()).toEqual(['nebula', 'grid']);
  });

  it('keeps a chosen part the catalog no longer has, and says so', async () => {
    const c = await create(['ghost', 'sun']);
    expect(c.q('chosen-ghost')!.textContent).toContain('no longer in the catalog');
    expect(c.names()).toEqual(['ghost', 'sun']);
  });

  it('speaks Spanish', async () => {
    const c = await create([], 'es');
    expect(c.q('none')!.textContent).toContain('Ninguna parte elegida');
    expect(c.q('count')!.textContent).toContain('0 de 8');
  });
});
