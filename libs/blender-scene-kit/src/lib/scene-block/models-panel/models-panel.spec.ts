import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { InMemoryModelLibrary, InMemoryModelPlace, LibraryFailed, MODEL_LIBRARY_OPTIONS, MODEL_LIBRARY_PORT, MODEL_PLACE_PORT, type ModelPlacePort, type PlacedFile } from '@lab/model-library-kit';
import { type Observable, of, throwError } from 'rxjs';

import { BLENDER_AVAILABLE } from '../../availability';
import { BLENDER_SCENE_OPTIONS } from '../../core/options';
import { BLENDER_SCENE_PORT, type BlenderScenePort, type SceneContext, type SceneDescription, SceneFailed, type SceneWritten } from '../../port';
import { BlenderScene } from '../scene-block';

const DESCRIPTION = { version: 1, camera: { lens: 50 }, objects: [{ id: 'hero', type: 'text', text: 'Hi' }] };
const PNG = () => new Blob(['png'], { type: 'image/png' });

class FakeScene implements BlenderScenePort {
  loaded: SceneDescription | null = { description: DESCRIPTION, resolved: DESCRIPTION };
  saves: Record<string, unknown>[] = [];
  refuse: SceneFailed | null = null;
  load(): Observable<SceneDescription | null> {
    return of(this.loaded);
  }
  write(): Observable<SceneWritten> {
    return throwError(() => new Error('not used'));
  }
  save(_c: SceneContext, description: Record<string, unknown>): Observable<SceneDescription> {
    if (this.refuse) return throwError(() => this.refuse);
    this.saves.push(description);
    return of({ description, resolved: description });
  }
  preview(): Observable<Blob> {
    return of(PNG());
  }
}

/** A place with files that a spec can read, and with refusals it can ask for. */
class FakePlace implements ModelPlacePort {
  files: PlacedFile[] = [
    { name: 'hero.glb', kind: 'model', size: 9, clips: ['idle', 'walk'], triangles: 940, needs: ['colormap.png'] },
    { name: 'pizza.glb', kind: 'model', size: 9, clips: [], triangles: 160, needs: [] },
    { name: 'colormap.png', kind: 'picture', size: 3 },
  ];
  removeRefusal: LibraryFailed | null = null;
  uploads: string[] = [];
  list(): Observable<PlacedFile[]> {
    return of([...this.files]);
  }
  upload(name: string): Observable<void> {
    this.uploads.push(name);
    return of(undefined);
  }
  remove(name: string): Observable<void> {
    if (this.removeRefusal) return throwError(() => this.removeRefusal);
    this.files = this.files.filter((f) => f.name !== name);
    return of(undefined);
  }
  add(): Observable<never> {
    return throwError(() => new Error('not used'));
  }
}

describe('The models panel of the 3D scene block', () => {
  let scene: FakeScene;
  let place: FakePlace;
  let fixture: ComponentFixture<BlenderScene>;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const button = (id: string) => q(id) as HTMLButtonElement;

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(withPlace: ModelPlacePort | null, lang: 'es' | 'en' = 'en'): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideLabForms({ lang }),
        { provide: BLENDER_SCENE_OPTIONS, useValue: { lang } },
        { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang } },
        { provide: BLENDER_SCENE_PORT, useValue: scene },
        { provide: BLENDER_AVAILABLE, useValue: signal(true) },
        { provide: MODEL_LIBRARY_PORT, useValue: new InMemoryModelLibrary() },
        ...(withPlace ? [{ provide: MODEL_PLACE_PORT, useValue: withPlace }] : []),
      ],
    });
    fixture = TestBed.createComponent(BlenderScene);
    fixture.componentRef.setInput('scope', 'titulo.scene.json');
    fixture.detectChanges();
    await settle();
    await settle();
  }

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:frame'), revokeObjectURL: vi.fn() }));
    scene = new FakeScene();
    place = new FakePlace();
  });
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('is not there where the host has no place for models', async () => {
    await open(null);
    expect(q('scene-models')).toBeNull();
    expect(q('blender-source')).not.toBeNull();
  });

  it('is not there while the host says the server cannot keep models, and appears when it can', async () => {
    const can = signal(false);
    await open(Object.assign(Object.create(place), { available: () => can() }) as ModelPlacePort);
    expect(q('scene-models')).toBeNull();
    can.set(true);
    await settle();
    expect(q('scene-models')).not.toBeNull();
  });

  it('lists the models with their animations, triangles and pictures, warns of a picture that is missing, and says the size is a height', async () => {
    place.files = place.files.filter((f) => f.kind === 'model');
    await open(place);
    expect(q('model-row-hero.glb')?.textContent).toContain('2 animations');
    expect(q('model-row-hero.glb')?.textContent).toContain('940 triangles');
    expect(q('model-row-hero.glb')?.querySelector('[data-testid="model-missing"]')?.textContent).toContain('colormap.png is missing');
    expect(q('model-row-pizza.glb')?.textContent).toContain('No animations');
    expect(q('model-row-pizza.glb')?.querySelector('[data-testid="model-missing"]')).toBeNull();
    expect(q('models-height')?.textContent).toContain('height');
  });

  it('puts the same panel in Spanish', async () => {
    await open(place, 'es');
    expect(q('model-row-hero.glb')?.textContent).toContain('2 animaciones');
    expect(q('models-height')?.textContent).toContain('altura');
  });

  it('places a model in the description with its first animation, saves it, and can put the one before back', async () => {
    await open(place);
    button('model-place').click();
    await settle();
    await settle();
    const objects = scene.saves.at(-1)?.['objects'] as Record<string, unknown>[];
    expect(objects.map((o) => o['id'])).toEqual(['hero', 'hero-2']);
    expect(objects[1]).toEqual({ id: 'hero-2', type: 'model', file: 'hero.glb', size: 1, animation: { clip: 'idle' }, keys: [{ t: 0, location: [0, 0, 0] }] });
    expect(q('model-placed')?.textContent).toContain('hero-2');
    button('blender-undo').click();
    await settle();
    await settle();
    expect((scene.saves.at(-1)?.['objects'] as unknown[]).length).toBe(1);
  });

  it('places by the largest dimension when the person chooses it, and by the height otherwise', async () => {
    await open(place);
    expect(q('models-fit-note')?.textContent).toContain('no real size');
    const select = q('models-fit') as HTMLSelectElement;
    select.value = 'largest';
    select.dispatchEvent(new Event('change'));
    await settle();
    button('model-place').click();
    await settle();
    await settle();
    const objects = scene.saves.at(-1)?.['objects'] as Record<string, unknown>[];
    expect(objects[1]).toEqual({ id: 'hero-2', type: 'model', file: 'hero.glb', size: 1, fit: 'largest', animation: { clip: 'idle' }, keys: [{ t: 0, location: [0, 0, 0] }] });
    // a model already in the description keeps what it had
    expect(objects[0]).not.toHaveProperty('fit');
    select.value = 'height';
    select.dispatchEvent(new Event('change'));
    await settle();
    button('model-place').click();
    await settle();
    await settle();
    expect((scene.saves.at(-1)?.['objects'] as Record<string, unknown>[])[2]).not.toHaveProperty('fit');
  });

  it('places a prop with no animation key, and keeps what the server refuses with its words', async () => {
    await open(place);
    (root().querySelector('[data-testid="model-row-pizza.glb"] [data-testid="model-place"]') as HTMLButtonElement).click();
    await settle();
    await settle();
    expect((scene.saves.at(-1)?.['objects'] as Record<string, unknown>[])[1]).not.toHaveProperty('animation');

    scene.refuse = new SceneFailed(400, 'objects[2].animation.clip: "run" is not in hero.glb (clips: idle, walk)');
    (root().querySelector('[data-testid="model-row-hero.glb"] [data-testid="model-place"]') as HTMLButtonElement).click();
    await settle();
    await settle();
    expect(q('blender-save-error')?.textContent).toContain('"run" is not in hero.glb (clips: idle, walk)');
    expect(q('model-placed')).toBeNull();
    expect(q('blender-undo')).not.toBeNull();
  });

  it('will not place a model before the scene is written', async () => {
    scene.loaded = null;
    await open(place);
    expect(button('model-place').disabled).toBe(true);
    expect(button('model-place').title).toContain('Write the scene');
    expect(q('models-need-scene')?.textContent).toContain('Write the scene before placing');
  });

  it('uploads a file and reads the list again', async () => {
    await open(place);
    const input = q('models-upload') as HTMLInputElement;
    const file = new File(['glTF'], 'tree.glb');
    Object.defineProperty(input, 'files', { value: { item: () => file, length: 1 }, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(place.uploads).toEqual(['tree.glb']);
  });

  it('asks before removing, removes, and shows the server’s words when it will not (the piece that places it)', async () => {
    await open(place);
    button('model-remove').click();
    await settle();
    button('model-remove-no').click();
    await settle();
    expect(q('model-row-hero.glb')).not.toBeNull();
    place.removeRefusal = new LibraryFailed(409, 'the 3D piece "p1" of the script places hero.glb');
    button('model-remove').click();
    await settle();
    button('model-remove-yes').click();
    await settle();
    expect(q('models-problem')?.textContent).toContain('the 3D piece "p1" of the script places hero.glb');
    expect(q('model-row-hero.glb')).not.toBeNull();
    place.removeRefusal = null;
    button('model-remove').click();
    await settle();
    button('model-remove-yes').click();
    await settle();
    await settle();
    expect(q('model-row-hero.glb')).toBeNull();
  });

  it('opens the library picker and reads the list again when something was added', async () => {
    const memory = new InMemoryModelPlace(new InMemoryModelLibrary());
    await open(memory);
    expect(q('models-empty')).not.toBeNull();
    button('models-add').click();
    await settle(10);
    expect(document.body.textContent).toContain('Add a model to the project');
  });
});
