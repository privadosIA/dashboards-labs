import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { provideMotionParts } from '../provide-motion-parts';
import { cards, counter, toggle } from '../testing/parts';
import { PartParams } from './part-params';

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(part: typeof toggle, values: Record<string, unknown> | undefined, options: { level?: 'simple' | 'medium' | 'advanced'; locked?: boolean; lang?: 'es' | 'en' } = {}) {
  const lang = options.lang ?? 'en';
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), provideMotionParts({ lang })] });
  const fixture = TestBed.createComponent(PartParams);
  fixture.componentRef.setInput('part', part);
  fixture.componentRef.setInput('values', values);
  fixture.componentRef.setInput('level', options.level ?? 'simple');
  fixture.componentRef.setInput('locked', options.locked ?? false);
  const change = vi.fn();
  fixture.componentInstance.paramsChange.subscribe(change);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, change, text: () => el.textContent ?? '' };
}

const input = (el: HTMLElement, name: string) => el.querySelector<HTMLInputElement>(`input[id*="_${name}_"]`);

async function type(fixture: ComponentFixture<unknown>, box: HTMLInputElement, value: string): Promise<void> {
  box.value = value;
  box.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('PartParams', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws a text field for a string, holding the piece\'s value, and reports a change', async () => {
    const { fixture, el, change } = await create(toggle, { label: 'hola', on: true });
    const box = input(el, 'input_label')!;
    expect(box.type).toBe('text');
    expect(box.value).toBe('hola');
    await type(fixture, box, 'adios');
    expect(change).toHaveBeenCalledWith({ label: 'adios', on: true });
  });

  it('draws a checkbox for a bool, ticked as the piece says, and reports it being unticked', async () => {
    const { fixture, el, change } = await create(toggle, { label: 'hola', on: true });
    const box = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    box.click();
    await settle(fixture);
    expect(change).toHaveBeenCalledWith({ label: 'hola', on: false });
  });

  it('draws a number field for an int with the default for what the piece has none of, and reports a whole number', async () => {
    const { fixture, el, change } = await create(counter, { to: 7 });
    const to = input(el, 'input_to')!;
    expect(to.type).toBe('number');
    expect(to.value).toBe('7');
    expect(input(el, 'input_speed')!.value).toBe('1.5');
    await type(fixture, to, '12');
    expect(change).toHaveBeenLastCalledWith({ to: 12, speed: 1.5 });
  });

  it('takes a fraction for a number parameter', async () => {
    const { fixture, el, change } = await create(counter, { to: 7, speed: 1.5 });
    await type(fixture, input(el, 'input_speed')!, '2.5');
    expect(change).toHaveBeenLastCalledWith({ to: 7, speed: 2.5 });
  });

  it('draws a selector for an enum and starts with the piece\'s option', async () => {
    const { el, text } = await create(cards, { align: 'center' });
    const select = el.querySelector('mat-select')!;
    expect(select).not.toBeNull();
    expect(select.textContent).toContain('center');
    expect(text()).not.toContain('This value is needed.');
  });

  it('reports nothing when nothing changed', async () => {
    const { change } = await create(counter, { to: 7, speed: 1.5 });
    expect(change).not.toHaveBeenCalled();
  });

  it('says a part has no parameters instead of drawing a form', async () => {
    const { el } = await create({ ...toggle, params: [] }, undefined);
    expect(el.querySelector('[data-testid="no-params"]')).not.toBeNull();
    expect(el.querySelector('dynamic-form')).toBeNull();
  });

  it('shows the levels the part supports and marks a part above the piece\'s level', async () => {
    const above = await create(cards, undefined, { level: 'simple' });
    expect(above.el.querySelector('[data-testid="levels"]')!.textContent).toContain('medium, advanced');
    expect(above.el.querySelector('[data-testid="levels"]')!.textContent).toContain('needs a higher level');
    TestBed.resetTestingModule();
    const fine = await create(cards, undefined, { level: 'advanced' });
    expect(fine.el.querySelector('[data-testid="levels"]')!.textContent).not.toContain('higher level');
  });

  it('is locked while the piece is being drawn', async () => {
    const { el } = await create(counter, { to: 7 }, { locked: true });
    expect(input(el, 'input_to')!.disabled).toBe(true);
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { el } = await create(cards, undefined, { lang: 'es' });
    expect(el.querySelector('[data-testid="levels"]')!.textContent).toContain('Niveles');
  });

  it('speaks English when the host did not say a language', async () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(PartParams);
    fixture.componentRef.setInput('part', cards);
    fixture.componentRef.setInput('level', 'simple');
    await settle(fixture);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Levels');
    expect(text).toContain('(needs a higher level)');
  });
});
