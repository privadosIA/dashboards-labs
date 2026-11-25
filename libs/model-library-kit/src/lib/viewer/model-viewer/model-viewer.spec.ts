import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, Subject, firstValueFrom, throwError } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary } from '../../memory.adapter';
import { LibraryFailed, MODEL_LIBRARY_PORT, type ModelFileStep, type ModelLibraryPort } from '../../port';
import { type EngineModule, VIEWER_ENGINE } from '../engine-loader';
import { sampleGlb } from '../sample-glb';
import { ModelViewerDialog, type ViewerData } from './model-viewer';

/** What the engine does, written down so that a spec can read it: the real one needs WebGL, which jsdom has not (the engine is given through `VIEWER_ENGINE`). */
const fake = vi.hoisted(() => ({
  webgl: true,
  loadError: '' as string,
  calls: [] as string[],
  disposed: 0,
  stats: { triangles: 12, meshes: 1, clips: ['idle', 'walk'] as string[] },
}));

class FakeEngine {
  clipName = '';
  isPlaying = false;
  wireframe = false;
  async load() {
    if (fake.loadError) throw new Error(fake.loadError);
    this.clipName = fake.stats.clips[0] ?? '';
    return fake.stats;
  }
  play() {
    this.isPlaying = true;
    fake.calls.push('play');
  }
  pause() {
    this.isPlaying = false;
    fake.calls.push('pause');
  }
  choose(name: string) {
    this.clipName = name;
    fake.calls.push(`choose ${name}`);
  }
  setWireframe(on: boolean) {
    this.wireframe = on;
    fake.calls.push(`wire ${on}`);
  }
  resetView() {
    fake.calls.push('reset');
  }
  orbit(a: number, p: number) {
    fake.calls.push(`orbit ${Math.sign(a)} ${Math.sign(p)}`);
  }
  zoom(f: number) {
    fake.calls.push(`zoom ${Math.sign(f)}`);
  }
  setColors() {}
  resize() {}
  frame() {
    return false;
  }
  dispose() {
    fake.disposed++;
  }
}
const engineModule = (): Promise<EngineModule> => Promise.resolve({ webglAvailable: () => fake.webgl, ViewerEngine: FakeEngine as unknown as EngineModule['ViewerEngine'] });

const DATA: ViewerData = { pack: 'kenney-mini-characters', name: 'character-robot' };

/** A library with the pack of the sample model installed (the in-memory install takes one `pack()` read a step). */
async function installed(options: ConstructorParameters<typeof InMemoryModelLibrary>[0] = {}): Promise<InMemoryModelLibrary> {
  const lib = new InMemoryModelLibrary(options);
  await firstValueFrom(lib.install('kenney-mini-characters')).catch(() => undefined);
  for (let i = 0; i < 8; i++) await firstValueFrom(lib.pack('kenney-mini-characters'));
  return lib;
}

async function open(options: { port?: ModelLibraryPort; lang?: 'es' | 'en'; data?: ViewerData } = {}): Promise<ComponentFixture<ModelViewerDialog>> {
  const port = options.port ?? (await installed());
  await TestBed.configureTestingModule({
    providers: [
      { provide: MODEL_LIBRARY_PORT, useValue: port },
      { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: options.lang ?? 'en' } },
      { provide: MAT_DIALOG_DATA, useValue: options.data ?? DATA },
      { provide: VIEWER_ENGINE, useValue: engineModule },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ModelViewerDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}
const q = (f: ComponentFixture<unknown>, id: string): HTMLElement | null => (f.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
const text = (f: ComponentFixture<unknown>): string => (f.nativeElement as HTMLElement).textContent ?? '';

describe('ModelViewerDialog', () => {
  beforeEach(() => {
    fake.webgl = true;
    fake.loadError = '';
    fake.calls.length = 0;
    fake.disposed = 0;
    fake.stats = { triangles: 12, meshes: 1, clips: ['idle', 'walk'] };
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the 3D view with the model\'s data, its clips and its file size once it is read', async () => {
    const f = await open();
    expect(q(f, 'viewer-canvas')).not.toBeNull();
    expect(q(f, 'viewer-fallback')).toBeNull();
    expect(q(f, 'viewer-title')?.textContent).toContain('character-robot');
    expect(q(f, 'viewer-triangles')?.textContent).toContain('12');
    expect(q(f, 'viewer-size')?.textContent).toBeTruthy();
    expect([...(q(f, 'viewer-clips')?.querySelectorAll('option') ?? [])].map((o) => o.textContent?.trim())).toEqual(['idle', 'walk']);
    expect(text(f)).toContain('Wireframe');
  });

  it('says a model that names pictures in other files is drawn without them, and says nothing of one that does not', async () => {
    const withPictures = await open();
    expect(q(withPictures, 'viewer-pictureless')?.textContent).toContain('without its colour');
    TestBed.resetTestingModule();
    const model = { id: `${DATA.pack}/${DATA.name}`, pack: DATA.pack, name: DATA.name, tags: [], clips: [], triangles: 12, needs: [], licence: 'CC0', author: 'Kenney', attribution: false };
    const without = await open({ data: { ...DATA, model } });
    expect(q(without, 'viewer-pictureless')).toBeNull();
  });

  it('plays and pauses, chooses another clip, turns the wireframe on and goes back to the first view', async () => {
    const f = await open();
    (q(f, 'viewer-play') as HTMLButtonElement).click();
    expect(fake.calls).toContain('play');
    f.detectChanges();
    expect(q(f, 'viewer-play')?.textContent).toContain('Pause');
    (q(f, 'viewer-play') as HTMLButtonElement).click();
    expect(fake.calls).toContain('pause');
    const select = q(f, 'viewer-clips')?.querySelector('select') as HTMLSelectElement;
    select.value = 'walk';
    select.dispatchEvent(new Event('change'));
    expect(fake.calls).toContain('choose walk');
    (q(f, 'viewer-wireframe') as HTMLButtonElement).click();
    f.detectChanges();
    expect(fake.calls).toContain('wire true');
    expect(q(f, 'viewer-wireframe')?.getAttribute('aria-pressed')).toBe('true');
    (q(f, 'viewer-reset') as HTMLButtonElement).click();
    expect(fake.calls).toContain('reset');
  });

  it('says the model has no animations and offers nothing to play', async () => {
    fake.stats = { triangles: 12, meshes: 1, clips: [] };
    const f = await open();
    expect(q(f, 'viewer-no-clips')).not.toBeNull();
    expect(q(f, 'viewer-play')).toBeNull();
  });

  it('turns, zooms and resets with the keyboard', async () => {
    const f = await open();
    const canvas = q(f, 'viewer-canvas') as HTMLElement;
    for (const key of ['ArrowLeft', 'ArrowDown', '+', '-', '0']) canvas.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    expect(fake.calls).toEqual(['orbit -1 0', 'orbit 0 1', 'zoom 1', 'zoom -1', 'reset']);
    const other = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    canvas.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(canvas.getAttribute('aria-label')).toBe('3D view of character-robot');
    expect(canvas.getAttribute('aria-describedby')).toBe('viewer-keys');
  });

  it('keeps the picture and says the server does not serve the file yet (a 404), without an error', async () => {
    const f = await open({ port: await installed({ modelFile: 'missing' }) });
    expect(q(f, 'viewer-canvas')).toBeNull();
    expect(q(f, 'viewer-fallback')?.getAttribute('data-phase')).toBe('notServed');
    expect(q(f, 'viewer-note')?.textContent).toContain('does not serve the model file yet');
    expect(q(f, 'viewer-controls')).toBeNull();
  });

  it('says the file could not be read and keeps the picture', async () => {
    fake.loadError = 'bad magic';
    const f = await open();
    expect(q(f, 'viewer-fallback')?.getAttribute('data-phase')).toBe('unreadable');
    expect(q(f, 'viewer-note')?.textContent).toContain('could not be read: bad magic');
    expect(fake.disposed).toBe(1);
  });

  it('says the browser cannot draw in 3D when it has no WebGL', async () => {
    fake.webgl = false;
    const f = await open();
    expect(q(f, 'viewer-fallback')?.getAttribute('data-phase')).toBe('noWebgl');
    expect(q(f, 'viewer-note')?.textContent).toContain('WebGL');
  });

  it('shows a download that failed with its reason and tries again', async () => {
    let tries = 0;
    const lib = await installed();
    const port: ModelLibraryPort = Object.create(lib, {
      file: { value: (): ReturnType<ModelLibraryPort['file']> => (++tries === 1 ? throwError(() => new LibraryFailed(500, 'the disk is gone')) : lib.file(DATA.pack, DATA.name)) },
    });
    const f = await open({ port });
    expect(q(f, 'viewer-note')?.getAttribute('role')).toBe('alert');
    expect(q(f, 'viewer-note')?.textContent).toContain('the disk is gone');
    (q(f, 'viewer-retry') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    expect(tries).toBe(2);
    expect(q(f, 'viewer-canvas')).not.toBeNull();
  });

  it('shows the progress of a download while it comes and cancels it when it is closed', async () => {
    const steps = new Subject<ModelFileStep>();
    let unsubscribed = false;
    const slow: ModelLibraryPort = Object.create(await installed(), {
      file: {
        value: () =>
          new Observable<ModelFileStep>((subscriber) => {
            const inner = steps.subscribe((step) => subscriber.next(step));
            return () => {
              unsubscribed = true;
              inner.unsubscribe();
            };
          }),
      },
    });
    const f = await open({ port: slow });
    steps.next({ loaded: 1024, total: 4096 });
    f.detectChanges();
    expect(q(f, 'viewer-loading')?.textContent).toContain('1 kB');
    expect((q(f, 'viewer-loading')?.querySelector('progress') as HTMLProgressElement).value).toBe(25);
    f.destroy();
    expect(unsubscribed).toBe(true);
  });

  it('frees the renderer when it is closed', async () => {
    const f = await open();
    f.destroy();
    expect(fake.disposed).toBe(1);
  });

  it('speaks Spanish', async () => {
    const f = await open({ lang: 'es' });
    expect(text(f)).toContain('Vista inicial');
    expect(q(f, 'viewer-title')?.textContent).toContain('Modelo character-robot');
    expect(sampleGlb().byteLength).toBeGreaterThan(0);
  });
});
