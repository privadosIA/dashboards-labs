import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type AnimationPort, type Preset } from '@lab/animation-core';
import { CATALOG } from '../animation/fixtures';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { DESIGN } from '../../testing/design';
import { PresetPage } from './preset.page';
import { fromModel, presetFieldOf, toModel } from './preset-model';

const preset = (extra: Partial<Preset> = {}): Preset => ({ id: 'p1', name: 'Warm pop', referenceId: 'ref-1', createdAt: 1, design: { ...DESIGN, modes: { chorus: 'light' } }, rhythm: 6, parts: ['toggle'], adjustments: ['accent #333 became #ff5a3c'], ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(read: () => unknown, save: (id: string, p: unknown) => unknown = (_id, p) => of({ ...preset(), ...(p as object) }), lang: 'es' | 'en' = 'en') {
  stubStorage();
  const savePreset = vi.fn(save);
  const port = { preset: read, catalog: () => of(CATALOG), savePreset } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }, { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'p1']]) } } }] });
  const fixture = TestBed.createComponent(PresetPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, savePreset, text: () => el.textContent ?? '' };
}
const field = (el: HTMLElement, name: string) => el.querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`)!;
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const write = async (fixture: ComponentFixture<unknown>, input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
};

describe('the form of a preset', () => {
  it('holds the design, the rhythm and the parts, and gives back the preset keeping the modes of the sections', () => {
    const p = preset({ design: { ...DESIGN, modes: { chorus: 'light' }, verseStyle: 'glow' } });
    const back = fromModel(toModel(p), p);
    expect(back).toEqual({ name: 'Warm pop', design: p.design, rhythm: 6, parts: ['toggle'] });
  });

  it('leaves out a plain style and keeps one it has no name for', () => {
    const p = preset();
    const plain = fromModel({ ...toModel(p), verseStyle: 'plain', hitStyle: '' }, p);
    expect('verseStyle' in plain.design).toBe(false);
    expect(fromModel({ ...toModel(p), hitStyle: 'neon' }, p).design.hitStyle).toBe('neon');
  });

  it('knows the field a reason starts with', () => {
    expect(presetFieldOf('rhythm 1 is not between 2 and 15 seconds')).toBe('rhythm');
    expect(presetFieldOf('design.accent #101018 has less than 3:1 contrast')).toBe('accent');
    expect(presetFieldOf('parts[1]: "nope" is not in the catalog')).toBe('parts');
    expect(presetFieldOf('name is empty')).toBe('name');
    expect(presetFieldOf('something else')).toBeNull();
  });
});

describe('PresetPage', () => {
  it('shows the style with its fields and what was adjusted of the video\'s colours', async () => {
    const { el } = await create(() => of(preset()));
    expect(field(el, 'name').value).toBe('Warm pop');
    expect(field(el, 'rhythm').value).toBe('6');
    expect(field(el, 'accent').value).toBe('#ff5a3c');
    expect(get(el, 'adjustments')!.textContent).toContain('accent #333 became #ff5a3c');
  });

  it('saves the whole style with the parts it had, and shows what the server saved', async () => {
    const { fixture, el, savePreset } = await create(() => of(preset()));
    await write(fixture, field(el, 'rhythm'), '9');
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(savePreset).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Warm pop', rhythm: 9, parts: ['toggle'], design: expect.objectContaining({ accent: '#ff5a3c', modes: { chorus: 'light' } }) }));
    expect(get(el, 'saved')).not.toBeNull();
  });

  it('does not save a rhythm out of 2 to 15, nor an accent that is not a colour', async () => {
    const { fixture, el, savePreset } = await create(() => of(preset()));
    await write(fixture, field(el, 'rhythm'), '1');
    expect((get(el, 'save') as HTMLButtonElement).disabled).toBe(true);
    await write(fixture, field(el, 'rhythm'), '6');
    await write(fixture, field(el, 'accent'), 'red');
    expect((get(el, 'save') as HTMLButtonElement).disabled).toBe(true);
    expect(savePreset).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason at the field it names and keeps what is on screen', async () => {
    const { fixture, el } = await create(() => of(preset()), () => throwError(() => new AnimationFailure('refused', 'rhythm 14 is too slow for these parts')));
    await write(fixture, field(el, 'rhythm'), '14');
    (get(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'rhythm-problem')!.textContent).toContain('too slow');
    expect(get(el, 'accent-problem')).toBeNull();
    expect(field(el, 'rhythm').value).toBe('14');
  });

  it('shows a reason about the accent or the parts at their field, and any other below the form', async () => {
    const accent = await create(() => of(preset()), () => throwError(() => new AnimationFailure('refused', 'design.accent #101018 has less than 3:1 contrast')));
    (get(accent.el, 'save') as HTMLButtonElement).click();
    await settle(accent.fixture);
    expect(get(accent.el, 'accent-problem')!.textContent).toContain('3:1');
    TestBed.resetTestingModule();
    const parts = await create(() => of(preset()), () => throwError(() => new AnimationFailure('refused', 'parts[0]: "x" is not in the catalog')));
    (get(parts.el, 'save') as HTMLButtonElement).click();
    await settle(parts.fixture);
    expect(get(parts.el, 'parts-problem')!.textContent).toContain('parts[0]');
    TestBed.resetTestingModule();
    const other = await create(() => of(preset()), () => throwError(() => new AnimationFailure('other', 'down')));
    (get(other.el, 'save') as HTMLButtonElement).click();
    await settle(other.fixture);
    expect(get(other.el, 'problem')!.textContent).toContain('down');
  });

  it('says the style does not exist, or why it could not be read', async () => {
    const gone = await create(() => throwError(() => new AnimationFailure('missing', 'preset not found')));
    expect(get(gone.el, 'missing')!.textContent).toContain('no longer exists');
    TestBed.resetTestingModule();
    const broken = await create(() => throwError(() => new AnimationFailure('other', 'down')));
    expect(get(broken.el, 'reason')!.textContent).toContain('down');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(() => of(preset()), undefined, 'es');
    expect(text()).toContain('Guardar estilo');
    expect(text()).toContain('Lo que hubo que ajustar');
  });
});
