import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { CATALOG } from '../../animation/fixtures';
import type { Stage } from '@lab/animation-core';
import { stubStorage } from '../../../testing/memory-storage';
import { StageEditor } from './stage-editor';

const stage = (): Stage => ({ background: 'stage', characters: [{ character: 'bot', pose: 'wave', expression: 'happy', action: 'bounce', x: 30, y: 78, size: 42 }] });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(value: Stage | undefined, options: { locked?: boolean; lang?: 'es' | 'en'; characters?: boolean } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage();
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideLabForms({ lang })] });
  const fixture = TestBed.createComponent(StageEditor);
  fixture.componentRef.setInput('stage', value);
  fixture.componentRef.setInput('catalog', options.characters === false ? { ...CATALOG, characters: [] } : CATALOG);
  fixture.componentRef.setInput('locked', options.locked ?? false);
  const change = vi.fn();
  fixture.componentInstance.stageChange.subscribe(change);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, change, text: () => el.textContent ?? '' };
}

const input = (el: HTMLElement, name: string) => el.querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`)!;
const button = (el: HTMLElement, testid: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

describe('StageEditor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the place and size of each character as the stage says, and a choice for what the catalog has', async () => {
    const { el, text } = await create(stage());
    expect(input(el, 'c0_x').value).toBe('30');
    expect(input(el, 'c0_y').value).toBe('78');
    expect(input(el, 'c0_size').value).toBe('42');
    expect(text()).toContain('Character 1');
    expect(text()).toContain('Background');
    expect(el.querySelectorAll('mat-select').length).toBeGreaterThanOrEqual(5);
    expect(el.querySelector('[data-testid="no-characters"]')).toBeNull();
  });

  it('reports a change of place with the stage as it now is', async () => {
    const { fixture, el, change } = await create(stage());
    const x = input(el, 'c0_x');
    x.value = '60';
    x.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(change).toHaveBeenLastCalledWith({ ...stage(), characters: [{ ...stage().characters![0], x: 60 }] });
  });

  it('keeps the place inside the frame', async () => {
    const { fixture, el, change } = await create(stage());
    const y = input(el, 'c0_y');
    y.value = '180';
    y.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(change.mock.calls.at(-1)?.[0]?.characters[0].y).toBe(100);
  });

  it('adds the catalog\'s first character when asked', async () => {
    const { fixture, el, change } = await create(undefined);
    expect(el.querySelector('[data-testid="no-characters"]')).not.toBeNull();
    button(el, 'add-character').click();
    await settle(fixture);
    expect(change).toHaveBeenCalledWith({ characters: [{ character: 'bot', pose: 'idle', expression: 'neutral', x: 50, y: 85, size: 40 }] });
  });

  it('removes a character, and reports no stage when nothing is left', async () => {
    const { fixture, el, change } = await create({ characters: stage().characters });
    button(el, 'remove-character').click();
    await settle(fixture);
    expect(change).toHaveBeenCalledWith(null);
  });

  it('reports nothing when nothing changed', async () => {
    const { change } = await create(stage());
    expect(change).not.toHaveBeenCalled();
  });

  it('cannot add a character when the catalog has none', async () => {
    const { el } = await create(undefined, { characters: false });
    expect(button(el, 'add-character').disabled).toBe(true);
  });

  it('is locked while the piece is being drawn', async () => {
    const { el } = await create(stage(), { locked: true });
    expect(input(el, 'c0_x').disabled).toBe(true);
    expect(button(el, 'add-character').disabled).toBe(true);
    expect(button(el, 'remove-character').disabled).toBe(true);
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(stage(), { lang: 'es' });
    expect(text()).toContain('Escenario');
    expect(text()).toContain('Añadir personaje');
  });
});
