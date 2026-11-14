import { TestBed } from '@angular/core/testing';
import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import type { Catalog, Keyframe, Script } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionParts } from '@lab/motion-parts';

import { stubStorage } from '../../../../testing/memory-storage';
import type { EditRequest } from '../edit';
import { ItemPanel } from './item-panel';

const kf = (t: number, value: Keyframe['value']): Keyframe => ({ t, value, ease: 'linear' });
const part = (name: string, params: unknown[] = []) => ({ name, description: `The ${name}`, levels: ['simple'], costMs: 1, manual: false, params });
const catalog = {
  parts: [part('counter'), part('stamp'), part('strip', [{ name: 'weight', type: 'int', default: '1', min: 1, max: 5, animatable: true }])],
  characters: [],
  backgrounds: [],
  levels: ['simple'],
  styles: ['typographic'],
  frameRates: [24],
  actions: [],
  fonts: [],
  modes: ['dark'],
  features: ['animate', 'layers'],
} as unknown as Catalog;
const script: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 20, part: 'counter' },
    { id: 'p2', start: 20, end: 60, part: 'counter' },
  ],
  layers: [{ id: 'a', items: [{ part: 'strip', start: 10, end: 30, animate: { weight: [kf(0, 1), kf(20, 5)] } }, { part: 'strip', start: 40, end: 50 }] }],
};

function setup(options: { script?: Script; item?: number; lang?: 'es' | 'en' } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage({ 'motion-edit.lang': lang });
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, provideLabForms({ lang }), provideMotionParts({ lang })] });
  const base = options.script ?? script;
  const fixture = TestBed.createComponent(ItemPanel);
  fixture.componentRef.setInput('script', base);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('level', 'simple');
  fixture.componentRef.setInput('layer', 'a');
  fixture.componentRef.setInput('item', options.item ?? 0);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const edits: EditRequest[] = [];
  fixture.componentInstance.edit.subscribe((e) => edits.push(e));
  const apply = (n = edits.length - 1): Script => edits[n].fn({ design: {} as never, script: base }).script;
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const type = (id: string, value: string) => {
    const input = q(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { fixture, el, edits, apply, q, type };
}

describe('ItemPanel', () => {
  it('names the layer and the item, and shows its part, range and length', () => {
    const { el, q } = setup();
    expect(el.querySelector('h2')!.textContent).toBe('Layer "a", item 1');
    expect((q('item-part') as HTMLSelectElement).value).toBe('strip');
    expect((q('item-from') as HTMLInputElement).value).toBe('10');
    expect((q('item-to') as HTMLInputElement).value).toBe('30');
    expect(el.textContent).toContain('Lasts 20 s');
  });

  it('is in Spanish with the Spanish setting', () => {
    expect(setup({ lang: 'es' }).el.querySelector('h2')!.textContent).toBe('Capa «a», elemento 1');
  });

  it('offers only the parts the pages the item touches can draw, and says why for the others', () => {
    const { el } = setup();
    const options = Array.from(el.querySelectorAll('[data-testid="item-part"] option')) as HTMLOptionElement[];
    const byName = Object.fromEntries(options.map((o) => [o.value, o]));
    expect(byName['counter'].disabled).toBe(true);
    expect(byName['counter'].title).toBe('piece "p1" (#1): the part "counter" is drawn twice (the main part and layer "a" item #1)');
    expect(byName['stamp'].disabled).toBe(false);
  });

  it('changes the part with its own defaults', () => {
    const { q, edits, apply, fixture } = setup();
    const select = q('item-part') as HTMLSelectElement;
    select.value = 'stamp';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(edits).toHaveLength(1);
    expect(apply().layers![0].items[0]).toMatchObject({ part: 'stamp' });
    expect(apply().layers![0].items[0].animate).toBeUndefined();
  });

  it('sets the range, held by the neighbour, and says why when the server would refuse it', () => {
    const { q, type, apply, edits } = setup();
    type('item-to', '45');
    expect(apply().layers![0].items[0]).toMatchObject({ start: 10, end: 40 });
    type('item-from', '5');
    expect(apply().layers![0].items[0]).toMatchObject({ start: 5, end: 30 });
    expect(edits).toHaveLength(2);
    expect(q('item-notice')).toBeNull();
  });

  it('does not change the range, and says why, when a piece would draw a part twice', () => {
    const one: Script = { ...script, layers: [{ id: 'a', items: [{ part: 'counter', start: 25, end: 30 }] }], pieces: [{ id: 'p1', start: 0, end: 20, part: 'counter' }, { id: 'p2', start: 20, end: 60, part: 'stamp' }] };
    const { q, type, edits } = setup({ script: one });
    type('item-from', '10');
    expect(edits).toHaveLength(0);
    expect(q('item-notice')!.textContent).toBe('piece "p1" (#1): the part "counter" is drawn twice (the main part and layer "a" item #1)');
  });

  it('shows the server\'s rules the layer breaks, in its words', () => {
    const bad: Script = { ...script, layers: [{ id: 'a', items: [{ part: 'strip', start: 10, end: 30 }, { part: 'strip', start: 25, end: 50 }] }] };
    const { q } = setup({ script: bad, item: 1 });
    expect(q('item-problems')!.textContent).toContain('layer "a" item #2 overlaps item #1 (items of a layer follow one another, in order)');
  });

  it('animates over the item: keyframes at seconds from its start, the whole length of the item', () => {
    const { el, apply, edits } = setup({ item: 1 });
    (el.querySelector('.row[data-param="weight"] [data-testid="animate-go"]') as HTMLElement).click();
    expect(edits).toHaveLength(1);
    expect(apply().layers![0].items[1].animate).toEqual({ weight: [kf(0, 1), kf(10, 1)] });
  });

  it('removes the item, or the whole layer', () => {
    const { q, edits, apply } = setup();
    q('item-remove')!.click();
    expect(apply(0).layers![0].items.map((i) => i.start)).toEqual([40]);
    q('item-remove-layer')!.click();
    expect(apply(1).layers).toBeUndefined();
    expect(edits).toHaveLength(2);
  });

  it('says how many parts a page would draw when it is a lot', () => {
    const heavy: Script = { ...script, pieces: [{ id: 'p1', start: 0, end: 60, part: 'counter', with: [{ part: 'stamp' }] }], layers: [{ id: 'a', items: Array.from({ length: 1 }, () => ({ part: 'strip', start: 10, end: 30 })) }, { id: 'b', items: [{ part: 'x1', start: 10, end: 30 }] }, { id: 'c', items: [{ part: 'x2', start: 10, end: 30 }] }, { id: 'd', items: [{ part: 'x3', start: 10, end: 30 }] }] };
    const { q } = setup({ script: heavy });
    expect(q('item-heavy')!.textContent).toContain('6 parts');
  });

  it('takes a native change event that bubbles from a field for what it is: no edit (it once became the parameters)', () => {
    const { el, edits, fixture } = setup({ item: 1 });
    const field = el.querySelector('lab-part-params input:not([type=hidden])') as HTMLInputElement;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(edits).toHaveLength(0);
  });

  it('changes nothing while locked', () => {
    const { fixture, q } = setup();
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    expect((q('item-remove') as HTMLButtonElement).disabled).toBe(true);
    expect((q('item-from') as HTMLInputElement).disabled).toBe(true);
  });
});
