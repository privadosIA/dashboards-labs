import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';

import { ImagesManifest, MusicManifest } from '../../core/api.models';
import { fakeStorage } from '../../core/storage-fake';
import { ModeFilterStore } from '../../core/mode-filter.store';
import { RunStreamService } from '../../core/run-stream.service';
import { GalleryPageComponent } from './gallery-page.component';

const MANIFEST: ImagesManifest = {
  project: 'demo-stills',
  mode: 'images',
  generated_at: '2026-10-09T10:00:00Z',
  images: [
    { scene_id: 'intro', variant: 0, effective_seed: 42, prompt: 'p1', negative_prompt: '', model: 'm', resolution: [640, 360], sampler: 'euler', steps: 4, file: 'out/demo-stills/intro_v1.png' },
    { scene_id: 'intro', variant: 1, effective_seed: 43, prompt: 'p1', negative_prompt: '', model: 'm', resolution: [640, 360], sampler: 'euler', steps: 4, file: 'out/demo-stills/intro_v2.png' },
    { scene_id: 'hero', variant: 0, effective_seed: 7, prompt: 'p2', negative_prompt: '', model: 'm', resolution: [640, 360], sampler: 'euler', steps: 4, file: 'out/demo-stills/hero.png' },
  ],
};

const CONFIG_RESPONSE = {
  yaml: '',
  valid: true,
  parsed: {
    project: 'demo-stills',
    output: { mode: 'images', file: '', contact_sheet: false },
    defaults: {
      model: '', voice: '', resolution: '640x360', sampler: 'euler',
      steps: 4, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '',
    },
    scenes: [
      { id: 'intro', prompt: 'p1', negative_prompt: '', tts_text: '', speed: 0, lora: '', variants: 2 },
      { id: 'hero', prompt: 'p2', negative_prompt: '', tts_text: '', speed: 0, lora: '' },
    ],
  },
};

class FakeES {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  addEventListener(t: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(t, fn);
  }
  close(): void {}
  end(): void {
    this.listeners.get('stream-end')?.({ data: '{}' } as MessageEvent<string>);
  }
}

type GalleryApi = {
  selectProject(id: string): Promise<void>;
  pinSeed(img: ImagesManifest['images'][0]): Promise<void>;
  rerender(img: ImagesManifest['images'][0]): Promise<void>;
};

describe('GalleryPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GalleryPageComponent>;
  let cmp: GalleryApi;
  let es: FakeES;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(ModeFilterStore).showAll(); // these tests are about the other behaviours, with every mode listed
    TestBed.inject(RunStreamService).esFactory = () => {
      es = new FakeES();
      return es;
    };
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/projects')
      .flush([{ id: 'demo-stills', name: 'demo-stills', mode: 'images', scene_count: 2 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as GalleryApi;
  });

  afterEach(() => http.verify());

  async function pick(manifest: ImagesManifest | null): Promise<void> {
    const done = cmp.selectProject('demo-stills');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const req = http.expectOne('/api/projects/demo-stills/artifacts/out/demo-stills/manifest.json');
    if (manifest) {
      req.flush(manifest);
    } else {
      req.flush(
        { error: { code: 'not_found', message: 'artifact not produced yet' } },
        { status: 404, statusText: 'Not Found' },
      );
    }
    await done;
    fixture.detectChanges();
  }

  it('renders a manifest-driven grid grouped by scene with seed captions', async () => {
    await pick(MANIFEST);
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.scene-group h3')).map((h) => h.textContent);
    expect(groups).toEqual(['intro', 'hero']);
    expect(el.querySelectorAll('figure.print').length).toBe(3);
    expect(el.textContent).toContain('v1 · s42');
    expect(el.textContent).toContain('v2 · s43');
    const imgs = Array.from(el.querySelectorAll('figure img')) as HTMLImageElement[];
    expect(imgs[0].getAttribute('src')).toBe(
      '/api/projects/demo-stills/artifacts/out/demo-stills/intro_v1.png',
    );
  });

  it('the refresh button reads the manifest again', async () => {
    await pick(null);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid=gallery-refresh]') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/demo-stills/artifacts/out/demo-stills/manifest.json').flush(MANIFEST);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('figure.print').length).toBe(3);
  });

  it('shows the empty state explaining images-mode runs when there is no manifest', async () => {
    await pick(null);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('aún no tiene imágenes');
    expect(text).toContain('modo imágenes');
  });

  it('the empty state offers a way to launch a run for that project', async () => {
    await pick(null);
    const link = (fixture.nativeElement as HTMLElement).querySelector('mo-empty-state a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Ir a Runs');
    expect(link.getAttribute('href')).toContain('/runs');
    expect(link.getAttribute('href')).toContain('project=');
  });

  it('pin-seed saves the effective seed through the config flow', async () => {
    await pick(MANIFEST);
    const done = cmp.pinSeed(MANIFEST.images[1]); // intro v2, seed 43
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/demo-stills/config').flush(CONFIG_RESPONSE);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const put = http.expectOne({ method: 'PUT', url: '/api/projects/demo-stills/config' });
    const sent = load(put.request.body.yaml) as { scenes: { id: string; seed?: number }[] };
    expect(sent.scenes.find((s) => s.id === 'intro')!.seed).toBe(43);
    put.flush({ saved: true });
    await done;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('intro ← seed 43');
  });

  it('re-render launches an images-only run and refreshes the manifest on finish', async () => {
    await pick(MANIFEST);
    const done = cmp.rerender(MANIFEST.images[2]); // hero
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo-stills/runs' });
    expect(req.request.body.only).toBe('hero');
    expect(req.request.body.mode).toBe('images');
    req.flush({ run: { id: 'run-9', project: 'demo-stills', state: 'queued' }, queue_position: 0 });
    await done;

    // The watched stream ends → the gallery refetches the manifest.
    es.end();
    await fixture.whenStable();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http
      .expectOne('/api/projects/demo-stills/artifacts/out/demo-stills/manifest.json')
      .flush(MANIFEST);
  });
});

describe('GalleryPageComponent preselection (?project=)', () => {
  async function open(project: string | undefined) {
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GalleryPageComponent);
    if (project !== undefined) fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    http
      .expectOne('/api/projects')
      .flush([{ id: 'demo-stills', name: 'demo-stills', mode: 'images', scene_count: 2 }]);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return { http, fixture };
  }

  it('opens on the named project and loads its manifest', async () => {
    const { http, fixture } = await open('demo-stills');
    http
      .expectOne('/api/projects/demo-stills/artifacts/out/demo-stills/manifest.json')
      .flush(MANIFEST);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('hero');
    http.verify();
  });

  it('ignores an unknown project without error or requests', async () => {
    const { http, fixture } = await open('nope');
    fixture.detectChanges();
    http.expectNone((r) => r.url.includes('/artifacts/'));
    http.verify();
  });
});

const MUSIC: MusicManifest = {
  project: 'balada',
  mode: 'music',
  generated_at: '2026-10-11T18:11:03Z',
  tracks: [
    { track_id: 'balada', variant: 0, effective_seed: 7, use_lm: false, caption: 'Epic sea shanty folk ballad', lyrics_requested: '[Verse]\nWe left', lyrics_sung: '[Verse]\nWe left', bpm: 108, duration_seconds: 160, audio_seconds: 160.008, keyscale: 'D minor', synth_model: 'turbo', params: {}, file: 'out/balada/balada_v1.mp3' },
    { track_id: 'balada', variant: 1, effective_seed: 8, use_lm: false, caption: 'Epic sea shanty folk ballad', bpm: 108, audio_seconds: 160, synth_model: 'turbo', params: {}, file: 'out/balada/balada_v2.mp3', reference: 'original.mp3' },
    { track_id: 'base', variant: 0, effective_seed: 1, use_lm: false, caption: 'lo-fi', instrumental: true, synth_model: 'turbo', params: {}, file: 'out/balada/base.mp3' },
  ],
};

describe('GalleryPageComponent: music projects', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GalleryPageComponent>;
  type MusicApi = { selectProject(id: string): Promise<void>; markMissing(e: MusicManifest['tracks'][0]): void };
  let cmp: MusicApi;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(ModeFilterStore).showAll();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([
      { id: 'balada', name: 'balada', mode: 'music', scene_count: 0, track_count: 2 },
      { id: 'demo-stills', name: 'demo-stills', mode: 'images', scene_count: 2 },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as MusicApi;
  });

  afterEach(() => http.verify());

  async function pickMusic(manifest: MusicManifest | null): Promise<void> {
    const done = cmp.selectProject('balada');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const req = http.expectOne('/api/projects/balada/artifacts/out/balada/manifest.json');
    if (manifest) req.flush(manifest);
    else req.flush({ error: { code: 'not_found', message: 'artifact not produced yet' } }, { status: 404, statusText: 'Not Found' });
    await done;
    fixture.detectChanges();
  }

  it('lists the songs grouped by track, a player per variant with its details', async () => {
    await pickMusic(MUSIC);
    expect(Array.from(el().querySelectorAll('.scene-group h3')).map((h) => (h.textContent ?? '').trim().split(/\s+/)[0])).toEqual(['balada', 'base']);
    expect(el().querySelectorAll('mo-audio-player').length).toBe(3);
    const first = el().querySelector('[data-testid=gallery-song-balada-0]')!;
    expect(first.textContent).toContain('balada_v1.mp3');
    expect(first.textContent).toContain('v1 · seed 7');
    expect(first.textContent).toContain('108 bpm');
    expect(first.textContent).toContain('D minor');
    expect(first.textContent).toContain('Epic sea shanty folk ballad');
    expect(first.querySelector('[data-testid=gallery-lyrics-sung]')?.textContent).toContain('We left');
    expect(first.querySelector('details')?.hasAttribute('open')).toBe(false); // collapsed
    const dl = first.querySelector('[data-testid=gallery-song-download]') as HTMLAnchorElement;
    expect(dl.getAttribute('href')).toBe('/api/projects/balada/artifacts/out/balada/balada_v1.mp3');
    expect(el().querySelector('[data-testid=gallery-song-balada-1] [data-testid=gallery-song-reference]')?.textContent).toContain('original.mp3');
    // an instrumental song has no lyrics block
    expect(el().querySelector('[data-testid=gallery-song-base-0] details')).toBeNull();
  });

  it('links each track to the music studio of the project', async () => {
    await pickMusic(MUSIC);
    const link = el().querySelector('[data-testid=gallery-studio-balada]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/projects/balada/music');
  });

  it('a missing file is flagged and the other songs keep their players', async () => {
    await pickMusic(MUSIC);
    cmp.markMissing(MUSIC.tracks[0]);
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=gallery-song-balada-0] [data-testid=gallery-song-missing]')).not.toBeNull();
    expect(el().querySelector('[data-testid=gallery-song-balada-0] mo-audio-player')).toBeNull();
    expect(el().querySelectorAll('mo-audio-player').length).toBe(2);
  });

  it('shows an empty state about songs when there is no manifest yet', async () => {
    await pickMusic(null);
    const text = el().textContent ?? '';
    expect(text).toContain('aún no tiene canciones');
    expect(text).not.toContain('aún no tiene imágenes');
    expect((el().querySelector('mo-empty-state a') as HTMLAnchorElement).getAttribute('href')).toContain('/runs');
  });

  it('marks music projects in the selector and says the gallery shows songs', async () => {
    expect(el().textContent).toContain('Las imágenes, los vídeos y las canciones');
    const select = el().querySelectorAll('mat-select')[2] as HTMLElement; // the first two are the modes and the origins
    select.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.body.textContent).toContain('· música');
    expect(document.body.textContent).toContain('· images');
  });

  it('an images project keeps its grid and asks for the images manifest, not the music one', async () => {
    const done = cmp.selectProject('demo-stills');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/demo-stills/artifacts/out/demo-stills/manifest.json').flush(MANIFEST);
    await done;
    fixture.detectChanges();
    expect(el().querySelectorAll('figure.print').length).toBe(3);
    expect(el().querySelectorAll('mo-audio-player').length).toBe(0);
  });
});

describe('GalleryPageComponent: video projects', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GalleryPageComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  type VideoApi = { selectProject(id: string): Promise<void> };
  let cmp: VideoApi;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    TestBed.inject(ModeFilterStore).showAll();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([{ id: 'live', name: 'live', mode: 'video', scene_count: 2 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as VideoApi;
  });

  afterEach(() => http.verify());

  async function pick(clips: unknown[]): Promise<void> {
    const done = cmp.selectProject('live');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/live/config').flush({
      yaml: '', valid: true,
      parsed: { project: 'live', output: { mode: 'video', file: 'out/live.mp4', contact_sheet: false }, defaults: {}, scenes: [{ id: 'b' }, { id: 'a' }] },
    });
    http.expectOne('/api/clips?project=live').flush({ clips });
    await done;
    fixture.detectChanges();
  }

  it('shows the final video and the clip of each scene in the order of the scenes, and asks for no manifest', async () => {
    await pick([
      { project: 'live', scene: 'a', kind: 'clip', size: 2048, modified: '' },
      { project: 'live', scene: 'a', kind: 'animation', size: 9999, modified: '' },
      { project: 'live', scene: 'b', kind: 'clip', size: 1024, modified: '' },
    ]);
    expect(el().querySelector('[data-testid=gallery-final-video] video')?.getAttribute('src')).toContain('out/live.mp4');
    const cards = Array.from(el().querySelectorAll('[data-testid^=gallery-clip-]')).map((c) => c.getAttribute('data-testid'));
    expect(cards).toEqual(['gallery-clip-b', 'gallery-clip-a']);
    expect(el().querySelector('[data-testid=gallery-clip-a] video')?.getAttribute('src')).toContain('out/clips/a.mp4');
    expect(el().textContent).not.toContain('manifest');
  });

  it('says there is nothing yet, with a link to Runs, when there is no clip and the video is missing', async () => {
    await pick([]);
    el().querySelector('[data-testid=gallery-final-video] video')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el().textContent).toContain('aún no tiene vídeo ni clips');
    expect(el().textContent).not.toContain('manifest.json');
    expect(el().querySelector('a[href*="/runs"]')).toBeTruthy();
  });
});

describe('GalleryPageComponent: the modes the user chose', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GalleryPageComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const MIXED = [
    { id: 'peli', name: 'peli', mode: 'video', scene_count: 3 },
    { id: 'peli2', name: 'peli2', mode: 'video', scene_count: 1 },
    { id: 'fotos', name: 'fotos', mode: 'images', scene_count: 2 },
    { id: 'canciones', name: 'canciones', mode: 'music', scene_count: 0, track_count: 4 },
    { id: 'roto', name: '', mode: '', scene_count: 0, invalid: true },
  ];
  type Api = { selectProject(id: string): Promise<void>; selected(): string };
  const api = () => fixture.componentInstance as unknown as Api;

  /** Answers whatever the page asks for about a selected project: an empty manifest, config or clip list. */
  function answerAll(): void {
    http.match((r) => r.url.includes('/config')).forEach((r) => r.flush({ yaml: '', valid: true, parsed: { project: 'x', output: { mode: 'video', file: 'out/x.mp4' }, defaults: {}, scenes: [] } }));
    http.match((r) => r.url.startsWith('/api/clips')).forEach((r) => r.flush({ clips: [] }));
    http.match((r) => r.url.includes('manifest')).forEach((r) => r.flush({ error: 'none' }, { status: 404, statusText: 'Not Found' }));
  }

  async function create(project?: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    if (project) fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush(MIXED);
    await fixture.whenStable();
    answerAll();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Selects a project and answers what the page asks about it while it waits. */
  async function pick(id: string): Promise<void> {
    const done = api().selectProject(id);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    answerAll();
    await done;
  }

  async function open(select: number): Promise<string[]> {
    (el().querySelectorAll('mat-select')[select] as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const labels = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent?.trim() ?? '');
    return labels;
  }

  afterEach(() => {
    answerAll();
    http.verify();
  });

  it('has the mode selector, and the project selector lists only the chosen modes (video by default)', async () => {
    await create();
    expect(el().querySelector('app-mode-select')).toBeTruthy();
    const labels = await open(2);
    expect(labels.some((l) => l.startsWith('peli'))).toBe(true);
    expect(labels.some((l) => l.startsWith('fotos'))).toBe(false);
    expect(labels.some((l) => l.startsWith('canciones'))).toBe(false);
    expect(labels.some((l) => l.startsWith('roto'))).toBe(true); // no mode: always reachable
  });

  it('choosing a mode lists its projects, and it is the same choice as the projects list', async () => {
    await create();
    TestBed.inject(ModeFilterStore).add('music');
    fixture.detectChanges();
    const labels = await open(2);
    expect(labels.some((l) => l.startsWith('canciones'))).toBe(true);
  });

  it('when the selected project leaves the list the first one listed is selected', async () => {
    await create();
    await pick('peli2');
    TestBed.inject(ModeFilterStore).set(['images']); // video is unchecked: peli2 leaves the list
    fixture.detectChanges();
    await fixture.whenStable();
    answerAll();
    await fixture.whenStable();
    expect(api().selected()).toBe('fotos');
  });

  it('a project with no mode stays listed whatever the modes, so it takes the selection when the others leave', async () => {
    await create();
    await pick('peli');
    TestBed.inject(ModeFilterStore).set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    answerAll();
    await fixture.whenStable();
    fixture.detectChanges();
    // "roto" has no mode and stays listed, so the selection moves to it rather than to nothing
    expect(api().selected()).toBe('roto');
  });

  it('says which modes are hidden when nothing is listed, and offers to show them', async () => {
    TestBed.configureTestingModule({});
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([MIXED[2], MIXED[3]]);
    await fixture.whenStable();
    fixture.detectChanges();
    const notice = el().querySelector('[data-testid=gallery-hidden]');
    expect(notice?.textContent).toContain('Imágenes (1)');
    expect(notice?.textContent).toContain('Música (1)');
    (el().querySelector('[data-testid=gallery-show-all]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=gallery-hidden]')).toBeNull();
  });

  it('opened on a project of a hidden mode (?project=) it shows it and adds the mode', async () => {
    await create('canciones');
    expect(api().selected()).toBe('canciones');
    expect(TestBed.inject(ModeFilterStore).modes().has('music')).toBe(true);
    const labels = await open(2);
    expect(labels.some((l) => l.startsWith('canciones'))).toBe(true);
  });

  it('in the simple version lists only what Create made, in every mode, and leaves the saved choice alone', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    localStorage.setItem('mo.simple', 'simple');
    await create();
    expect(el().querySelector('app-mode-select')).toBeNull();
    const listed = (fixture.componentInstance as unknown as { listed(): { id: string }[] }).listed();
    expect(listed.every((p) => p.id.startsWith('mobile-'))).toBe(true);
    expect(listed.some((p) => p.id === 'peli')).toBe(false);
    expect(TestBed.inject(ModeFilterStore).modes().has('video')).toBe(true);
    expect(TestBed.inject(ModeFilterStore).origins().has('desktop')).toBe(true);
  });
});
