import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, type Design, type Preset, type Reference } from '@lab/animation-core';
import { CATALOG } from '../animation/fixtures';
import { LocalStyles } from '../animation/local-styles';
import { ANIMATION } from '../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { StyleBuilderPage, blankStyle } from './style-builder.page';

const DESIGN: Design = { dark: '#101018', light: '#f3efe6', accent: '#ff5a3c', display: 'Inter', body: 'Inter', defaultMode: 'dark', modes: { chorus: 'light' }, concept: 'own' };
const ready = (id = 'ref-1', title = 'A video'): Reference => ({ id, title, notes: '', tags: [], source: 'https://youtu.be/x', state: 'ready', createdAt: 1 });
const preset = (extra: Partial<Preset> = {}): Preset => ({ id: 'made-1', name: 'Mine', createdAt: 1, design: DESIGN, rhythm: 6, parts: [], adjustments: [], ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

async function create(options: { id?: string; references?: Reference[]; port?: Partial<AnimationPort>; lang?: 'es' | 'en'; seed?: boolean } = {}) {
  stubStorage(options.seed ? { 'music-motion.styles.video-anim': JSON.stringify([{ id: 'local-1', name: 'Kept one', design: DESIGN, rhythm: 7, parts: ['toggle'], createdAt: 5 }]) } : {});
  const makePreset = vi.fn((_ref: string, name?: string) => of(preset({ name: name ?? '' })));
  const savePreset = vi.fn((_id: string, input: unknown) => of(preset(input as Partial<Preset>)));
  const port = { catalog: () => of(CATALOG), references: () => of(options.references ?? []), makePreset, savePreset, ...options.port } as unknown as AnimationPort;
  TestBed.configureTestingModule({
    providers: [
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang: options.lang ?? 'en', client: 'video-anim' } },
      provideRouter([]),
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map(options.id ? [['id', options.id]] : []) } } },
    ],
  });
  const local = TestBed.inject(LocalStyles);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(StyleBuilderPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const field = (name: string) => el.querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`)!;
  const write = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const addPart = async (name: string) => {
    (get(`part-${name}`)!.querySelector('[data-testid="add"]') as HTMLButtonElement).click();
    await settle(fixture);
  };
  const save = async () => {
    (get('save') as HTMLButtonElement).click();
    await settle(fixture);
  };
  return { fixture, el, get, field, write, addPart, save, makePreset, savePreset, navigate, local, text: () => el.textContent ?? '' };
}

afterEach(() => vi.unstubAllGlobals());

describe('blankStyle', () => {
  it('starts with the catalog\'s first typeface, the usual rhythm and no parts', () => {
    expect(blankStyle(CATALOG)).toMatchObject({ rhythm: 6, parts: [], design: { display: CATALOG.fonts[0], body: CATALOG.fonts[0], defaultMode: 'dark', modes: {} } });
    expect(blankStyle(null).design.display).toBe('Inter');
  });
});

describe('StyleBuilderPage', () => {
  it('opens with the design form and the part picker over the catalog, and cannot be saved until it has a name', async () => {
    const { get, field, text } = await create();
    expect(text()).toContain('New style');
    expect(field('rhythm').value).toBe('6');
    expect(get('picker')).not.toBeNull();
    expect(get('picker')!.querySelectorAll('[data-testid^="part-"]').length).toBe(CATALOG.parts.length);
    expect((get('save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the style in the browser, with the parts in the order picked and the design written, when no reference is chosen', async () => {
    const { get, field, write, addPart, save, local, navigate, makePreset } = await create();
    await write(field('name'), 'Neon city');
    await write(field('rhythm'), '8');
    await write(field('accent'), '#00ffaa');
    await addPart(CATALOG.parts[2].name);
    await addPart(CATALOG.parts[0].name);
    expect((get('save') as HTMLButtonElement).disabled).toBe(false);
    await save();
    expect(local.styles()).toHaveLength(1);
    expect(local.styles()[0]).toMatchObject({ name: 'Neon city', rhythm: 8, parts: [CATALOG.parts[2].name, CATALOG.parts[0].name], design: { accent: '#00ffaa', defaultMode: 'dark' } });
    expect(makePreset).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/presets']);
  });

  it('refuses a rhythm outside 2 to 15 and a colour that is not one, and saves nothing', async () => {
    const { get, field, write, local } = await create();
    await write(field('name'), 'Bad');
    await write(field('rhythm'), '30');
    expect((get('save') as HTMLButtonElement).disabled).toBe(true);
    await write(field('rhythm'), '6');
    await write(field('accent'), 'red');
    expect((get('save') as HTMLButtonElement).disabled).toBe(true);
    expect(local.styles()).toEqual([]);
  });

  it('offers the ready references as places to start it from, and says when there are none', async () => {
    const none = await create();
    expect(none.get('no-ready')!.textContent).toContain('no ready references');
    TestBed.resetTestingModule();
    const some = await create({ references: [ready(), { ...ready('ref-2', 'Still analysing'), state: 'analysing' }] });
    expect(some.get('no-ready')).toBeNull();
    expect(some.text()).toContain('Where to keep it');
  });

  it('saves it on the server, from the reference chosen, when one is chosen, and keeps no copy here', async () => {
    const { fixture, field, write, addPart, save, makePreset, savePreset, local, navigate } = await create({ references: [ready()] });
    await write(field('name'), 'On the server');
    await addPart(CATALOG.parts[0].name);
    const keep = fixture.componentInstance as unknown as { keepModel: { set(v: unknown): void } };
    keep.keepModel.set({ keep: 'ref-1' });
    await settle(fixture);
    await save();
    expect(makePreset).toHaveBeenCalledWith('ref-1', 'On the server');
    expect(savePreset).toHaveBeenCalledWith('made-1', expect.objectContaining({ name: 'On the server', rhythm: 6, parts: [CATALOG.parts[0].name] }));
    expect(local.styles()).toEqual([]);
    expect(navigate).toHaveBeenCalled();
  });

  it('shows the server\'s reason when it refuses, and stays where it is with nothing saved here', async () => {
    const refusing = { savePreset: () => throwError(() => new AnimationFailure('refused', 'rhythm 1 is not between 2 and 15 seconds')) };
    const { fixture, get, field, write, save, local, navigate } = await create({ references: [ready()], port: refusing });
    await write(field('name'), 'Refused');
    (fixture.componentInstance as unknown as { keepModel: { set(v: unknown): void } }).keepModel.set({ keep: 'ref-1' });
    await settle(fixture);
    await save();
    expect(get('refused')!.textContent).toContain('The server did not save it:');
    expect(get('refused')!.textContent).toContain('rhythm 1 is not between 2 and 15 seconds');
    expect(local.styles()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('edits a style kept in the browser: its fields come back, and saving replaces it', async () => {
    const { field, write, save, local, text } = await create({ id: 'local-1', seed: true });
    expect(text()).toContain('Own style');
    expect(field('name').value).toBe('Kept one');
    expect(field('rhythm').value).toBe('7');
    await write(field('rhythm'), '9');
    await save();
    expect(local.styles()).toHaveLength(1);
    expect(local.styles()[0]).toMatchObject({ id: 'local-1', name: 'Kept one', rhythm: 9, parts: ['toggle'] });
  });

  it('moves a kept style to the server and removes the copy here only once the server has it', async () => {
    const { fixture, save, local, makePreset } = await create({ id: 'local-1', seed: true, references: [ready()] });
    (fixture.componentInstance as unknown as { keepModel: { set(v: unknown): void } }).keepModel.set({ keep: 'ref-1' });
    await settle(fixture);
    await save();
    expect(makePreset).toHaveBeenCalledWith('ref-1', 'Kept one');
    expect(local.styles()).toEqual([]);
  });

  it('keeps the copy here when the server refuses the move', async () => {
    const { fixture, save, local, get } = await create({ id: 'local-1', seed: true, references: [ready()], port: { savePreset: () => throwError(() => new AnimationFailure('refused', 'parts[0]: "toggle" is not in the catalog')) } });
    (fixture.componentInstance as unknown as { keepModel: { set(v: unknown): void } }).keepModel.set({ keep: 'ref-1' });
    await settle(fixture);
    await save();
    expect(local.styles().map((s) => s.name)).toEqual(['Kept one']);
    expect(get('refused')!.textContent).toContain('"toggle" is not in the catalog');
  });

  it('opens when the references are a live list that never ends, as the server\'s is', async () => {
    const live = new BehaviorSubject<readonly Reference[]>([ready()]);
    const { get, text } = await create({ port: { references: () => live.asObservable() } });
    expect(get('picker')).not.toBeNull();
    expect(text()).not.toContain('Loading');
    expect(get('no-ready')).toBeNull();
  });

  it('says a style that is not in this browser is not there', async () => {
    const { get } = await create({ id: 'local-nope' });
    expect(get('missing')!.textContent).toContain('not in this browser');
  });

  it('tells the person when the browser cannot keep what is saved', async () => {
    const { get, fixture } = await create();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const store = TestBed.inject(LocalStyles);
    store.add({ name: 'x', design: DESIGN, rhythm: 6, parts: [] });
    expect(store.durable()).toBe(false);
    await settle(fixture);
    expect(get('not-durable')!.textContent).toContain('lost when the page is closed');
  });

  it('speaks Spanish', async () => {
    const { text } = await create({ lang: 'es' });
    expect(text()).toContain('Nuevo estilo');
    expect(text()).toContain('Ninguna parte elegida');
  });
});
