import { TestBed } from '@angular/core/testing';

import type { Part } from '@lab/motion-parts';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import { PALETTE_MIME, itemFromJson, itemToJson, type PaletteItem } from './palette-item';
import { PartsPalette } from './parts-palette';

const part = (name: string, levels: Part['levels'] = ['simple', 'medium', 'advanced'], extra: Partial<Part> = {}): Part => ({ name, description: `The ${name} part`, levels, costMs: 50, manual: false, params: [], ...extra });
const PARTS = [part('toggle'), part('wire-sphere', ['advanced']), part('pulse-ring', ['simple', 'medium', 'advanced'], { source: 'user' })];

function setup(lang: 'es' | 'en' = 'en', level = 'medium', locked = false) {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: lang }] });
  const fixture = TestBed.createComponent(PartsPalette);
  fixture.componentRef.setInput('parts', PARTS);
  fixture.componentRef.setInput('level', level);
  fixture.componentRef.setInput('locked', locked);
  fixture.detectChanges();
  const adds: PaletteItem[] = [];
  fixture.componentInstance.add.subscribe((i) => adds.push(i));
  const replaces: PaletteItem[] = [];
  fixture.componentInstance.replace.subscribe((i) => replaces.push(i));
  const layers: PaletteItem[] = [];
  fixture.componentInstance.addLayer.subscribe((i) => layers.push(i));
  return { fixture, el: fixture.nativeElement as HTMLElement, adds, layers, replaces };
}

const names = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-testid="palette-part"] .name')).map((n) => n.textContent!.trim().replace(/yours|tuya$/, '').trim());

describe('palette items', () => {
  it('make the round trip through a drag, and refuse what is not theirs', () => {
    for (const item of [{ kind: 'text' }, { kind: 'part', name: 'toggle' }] as PaletteItem[]) expect(itemFromJson(itemToJson(item))).toEqual(item);
    expect(itemFromJson('nope')).toBeNull();
    expect(itemFromJson('{"kind":"part"}')).toBeNull();
    expect(itemFromJson('{"kind":"other"}')).toBeNull();
  });
});

describe('PartsPalette', () => {
  it('lists the text and every part, in order, marking the user\'s and the ones the level does not support', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="palette-text"]')).not.toBeNull();
    expect(names(el)).toEqual(['pulse-ring', 'toggle', 'wire-sphere']);
    expect(el.querySelector('[data-part="pulse-ring"] .badge')!.textContent).toBe('yours');
    expect(el.querySelector('[data-part="wire-sphere"] .warn')!.textContent).toBe('Does not support level medium');
    expect(el.querySelector('[data-part="toggle"] .warn')).toBeNull();
  });

  it('searches by name and description', () => {
    const { el, fixture } = setup();
    const box = el.querySelector('.search') as HTMLInputElement;
    box.value = 'sphere';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names(el)).toEqual(['wire-sphere']);
    expect(el.querySelector('[data-testid="palette-text"]')).toBeNull();
    box.value = 'zzz';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('.none')!.textContent).toBe('No part matches.');
  });

  it('puts its item in the drag with its own type', () => {
    const { el } = setup();
    const data: Record<string, string> = {};
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: '' } });
    el.querySelector('[data-part="toggle"]')!.dispatchEvent(event);
    expect(itemFromJson(data[PALETTE_MIME])).toEqual({ kind: 'part', name: 'toggle' });
    const text = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(text, 'dataTransfer', { value: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: '' } });
    el.querySelector('[data-testid="palette-text"]')!.dispatchEvent(text);
    expect(itemFromJson(data[PALETTE_MIME])).toEqual({ kind: 'text' });
  });

  it('adds with the + button, without a drag', () => {
    const { el, adds, fixture } = setup();
    (el.querySelector('[data-part="toggle"] .plus') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="palette-text"] .plus') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(adds).toEqual([{ kind: 'part', name: 'toggle' }, { kind: 'text' }]);
  });

  it('makes a layer item of a part with the layer button, and has none for the text', () => {
    const { el, adds, layers, fixture } = setup();
    (el.querySelector('[data-part="toggle"] [data-testid="palette-layer"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(layers).toEqual([{ kind: 'part', name: 'toggle' }]);
    expect(adds).toEqual([]);
    expect(el.querySelector('[data-testid="palette-text"] [data-testid="palette-layer"]')).toBeNull();
    expect((el.querySelector('[data-testid="palette-layer"]') as HTMLButtonElement).getAttribute('aria-label')).toContain('layer item');
  });

  it('replaces the part of the piece with the replace button, and has none for the text', () => {
    const { el, adds, replaces, fixture } = setup();
    (el.querySelector('[data-part="toggle"] [data-testid="palette-replace"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(replaces).toEqual([{ kind: 'part', name: 'toggle' }]);
    expect(adds).toEqual([]);
    expect(el.querySelector('[data-testid="palette-text"] [data-testid="palette-replace"]')).toBeNull();
  });

  it('does nothing while locked', () => {
    const { el } = setup('en', 'medium', true);
    expect((el.querySelector('.plus') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="palette-layer"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="palette-replace"]') as HTMLButtonElement).disabled).toBe(true);
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    el.querySelector('[data-part="toggle"]')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('says its words in Spanish', () => {
    const { el } = setup('es');
    expect(el.querySelector('h2')!.textContent).toBe('Biblioteca');
    expect(el.querySelector('.search')!.getAttribute('placeholder')).toBe('Buscar una parte…');
  });
});
