import { EnginesStore } from '../../core/engines.store';
import { fakeEngines } from '../../core/engines.fake';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { AssetKindListing, CatalogEntry, CivitaiResolve, DownloadRecord, ModelsDirectory, TokenSources, TokenStatus } from '../../core/api.models';
import { DownloadStreamHandlers, DownloadStreamService } from '../../core/download-stream.service';
import { fakeStorage } from '../../core/storage-fake';
import { ModelsPageComponent } from './models-page.component';

const kinds = (
  models: { name: string; size: number }[] = [],
  music: { name: string; size: number }[] = [],
  adapters: { name: string; size: number }[] = [],
): AssetKindListing[] => [
  { kind: 'model', dir: 'models', extensions: ['.safetensors'], assets: models },
  { kind: 'voice', dir: 'voices', extensions: ['.onnx'], assets: [] },
  {
    kind: 'lora',
    dir: 'models/loras',
    extensions: ['.safetensors'],
    note: 'El pipeline todavía no aplica LoRA',
    assets: [],
  },
  {
    kind: 'video',
    dir: 'models/video',
    extensions: ['.gguf', '.safetensors'],
    note: 'El pipeline todavía no genera vídeo con estos modelos',
    assets: [],
  },
  { kind: 'music', dir: 'models/music', extensions: ['.gguf'], assets: music },
  { kind: 'adapter', dir: 'models/music/adapters', extensions: ['.safetensors', '.json'], assets: adapters },
];
const catalog = (sdInstalled = false): CatalogEntry[] => [
  {
    id: 'sd-1-5',
    kind: 'model',
    name: 'Stable Diffusion 1.5',
    description: 'Checkpoint base',
    starter: true,
    size_bytes: 4_000_000_000,
    vram_mb: 4096,
    commercial: 'conditions',
    license: 'CreativeML OpenRAIL-M',
    commercial_note: 'Lista de usos prohibidos.',
    files: [{ name: 'v1-5.safetensors', url: 'https://h/v1-5.safetensors' }],
    installed: sdInstalled,
  },
  {
    id: 'sdxl',
    kind: 'model',
    name: 'SDXL base',
    description: 'Más calidad',
    size_bytes: 6_900_000_000,
    vram_mb: 10240,
    files: [{ name: 'sdxl.safetensors', url: 'https://h/sdxl.safetensors' }],
    installed: false,
  },
  {
    id: 'lora-lcm',
    kind: 'lora',
    name: 'LCM-LoRA SD 1.5',
    description: 'Pocos pasos',
    size_bytes: 134_000_000,
    files: [{ name: 'lcm.safetensors', url: 'https://h/lcm.safetensors' }],
    installed: false,
  },
  {
    id: 'video-wan-q4',
    kind: 'video',
    name: 'Wan 2.2 TI2V 5B (Q4)',
    description: 'Anima una imagen',
    size_bytes: 8_000_000_000,
    vram_mb: 6144,
    files: [
      { name: 'wan.gguf', role: 'model', url: 'https://h/wan.gguf' },
      { name: 'umt5.gguf', role: 'text_encoder', url: 'https://h/umt5.gguf' },
      { name: 'vae.safetensors', role: 'vae', url: 'https://h/vae.safetensors' },
    ],
    installed: false,
  },
  {
    id: 'video-wan-q8',
    kind: 'video',
    name: 'Wan 2.2 TI2V 5B (Q8)',
    description: 'Más fiel',
    size_bytes: 12_800_000_000,
    files: [
      { name: 'wan8.gguf', role: 'model', url: 'https://h/wan8.gguf' },
      { name: 'umt58.gguf', role: 'text_encoder', url: 'https://h/umt58.gguf' },
      { name: 'vae.safetensors', role: 'vae', url: 'https://h/vae.safetensors' },
    ],
    installed: false,
  },
  {
    id: 'music-17',
    kind: 'music',
    name: 'ACE-Step 1.5 (LM 1.7B, turbo)',
    description: 'Canciones completas',
    size_bytes: 5_600_000_000,
    vram_mb: 9216,
    files: [
      { name: 'lm-1.7B.gguf', role: 'lm', url: 'https://h/lm17.gguf' },
      { name: 'encoder.gguf', role: 'text_encoder', url: 'https://h/enc.gguf' },
      { name: 'dit-turbo.gguf', role: 'dit', url: 'https://h/dit.gguf' },
      { name: 'vae.gguf', role: 'vae', url: 'https://h/vae.gguf' },
    ],
    installed: false,
  },
  {
    id: 'music-06',
    kind: 'music',
    name: 'ACE-Step 1.5 (LM 0.6B, ligero)',
    description: 'Más ligero',
    size_bytes: 4_400_000_000,
    vram_mb: 9216,
    files: [
      { name: 'lm-0.6B.gguf', role: 'lm', url: 'https://h/lm06.gguf' },
      { name: 'encoder.gguf', role: 'text_encoder', url: 'https://h/enc.gguf' },
      { name: 'dit-turbo.gguf', role: 'dit', url: 'https://h/dit.gguf' },
      { name: 'vae.gguf', role: 'vae', url: 'https://h/vae.gguf' },
    ],
    installed: false,
  },
  {
    id: 'adapter-cny',
    kind: 'adapter',
    name: 'LoRA «Año Nuevo chino»',
    description: 'Adaptador oficial',
    size_bytes: 88_000_000,
    files: [
      { name: 'chinese-new-year/adapter_model.safetensors', url: 'https://h/a.safetensors' },
      { name: 'chinese-new-year/adapter_config.json', url: 'https://h/a.json' },
    ],
    installed: false,
  },
  {
    id: 'voice-x',
    kind: 'voice',
    name: 'Voz X',
    description: 'Voz de prueba',
    size_bytes: 60_000_000,
    files: [],
    installed: false,
  },
];
const envReport = (
  tokens: TokenStatus = { huggingface: false, civitai: false },
  token_sources: TokenSources = {},
  models_dir?: ModelsDirectory,
) => ({
  binaries: [],
  models: [],
  voices: [],
  loras: [],
  gpus: [],
  tokens,
  token_sources,
  ...(models_dir ? { models_dir } : {}),
});
const dl = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  id: 'dl-1',
  state: 'running',
  kind: 'model',
  name: 'big.safetensors',
  files: ['big.safetensors'],
  source: 'https://h/big.safetensors',
  bytes: 50,
  total: 100,
  created_at: '2026-10-09T10:00:00Z',
  ...over,
});

describe('ModelsPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ModelsPageComponent>;
  let handlers: Map<string, DownloadStreamHandlers>;

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const cmp = () => fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => Promise<void>>;
  // Store updates ride several promise hops (Promise.all + firstValueFrom):
  // yield a macrotask so they land before the view is checked.
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  };

  async function open(opts: {
    models?: { name: string; size: number }[];
    music?: { name: string; size: number }[];
    adapters?: { name: string; size: number }[];
    cat?: CatalogEntry[];
    downloads?: DownloadRecord[];
    tokens?: TokenStatus;
    sources?: TokenSources;
    modelsDir?: ModelsDirectory;
  } = {}): Promise<void> {
    fixture.detectChanges();
    http.expectOne('/api/assets').flush({ kinds: kinds(opts.models, opts.music, opts.adapters) });
    http.expectOne('/api/assets/catalog').flush({ entries: opts.cat ?? catalog() });
    http.expectOne('/api/downloads').flush({ downloads: opts.downloads ?? [] });
    // the key status comes from the environment report
    http.expectOne('/api/environment').flush(envReport(opts.tokens, opts.sources, opts.modelsDir));
    await settle();
  }

  beforeEach(async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    handlers = new Map();
    await TestBed.configureTestingModule({
      imports: [ModelsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: EnginesStore, useValue: fakeEngines() }],
    }).compileComponents();
    TestBed.inject(DownloadStreamService).connect = (id, h) => {
      handlers.set(id, h);
      return { close: () => undefined };
    };
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ModelsPageComponent);
  });

  afterEach(() => {
    http.verify();
  });

  const openTab = async (index: number) => {
    (root().querySelectorAll('[role="tab"]')[index] as HTMLElement).click();
    await settle();
  };

  describe('models directory', () => {
    const dir = (over: Partial<ModelsDirectory> = {}): ModelsDirectory => ({
      dir: '/mnt/backups/models',
      available: true,
      linked: true,
      disk: { free_bytes: 310 * 1024 ** 3, total_bytes: 954 * 1024 ** 3, warn_below_bytes: 20 * 1024 ** 3, low: false },
      ...over,
    });
    const q = (id: string) => root().querySelector(`[data-testid="${id}"]`);

    it('shows the path and the free space of its disk', async () => {
      await open({ modelsDir: dir() });
      expect(q('models-dir-path')?.textContent).toContain('/mnt/backups/models');
      expect(q('models-dir-free')?.textContent).toContain('310');
      expect(q('models-dir-low')).toBeNull();
      expect(q('models-dir-unavailable')).toBeNull();
    });

    it('warns when the disk is low', async () => {
      await open({ modelsDir: dir({ disk: { free_bytes: 5 * 1024 ** 3, total_bytes: 954 * 1024 ** 3, low: true } }) });
      expect(q('models-dir-low')).not.toBeNull();
    });

    it('says clearly that nothing can be installed when the disk is not mounted', async () => {
      await open({ modelsDir: dir({ available: false, reason: 'no está montado', disk: undefined }) });
      expect(q('models-dir-unavailable')?.textContent).toContain('no se puede instalar');
      expect(q('models-dir-unavailable')?.textContent).toContain('no está montado');
      expect(q('models-dir-free')).toBeNull();
    });

    it('asks to run the migration when the folder is not linked', async () => {
      await open({ modelsDir: dir({ linked: false }) });
      expect(q('models-dir-unlinked')?.textContent).toContain('models migrate');
      expect(q('models-dir-unavailable')).toBeNull();
    });

    it('shows nothing when the server has no models directory', async () => {
      await open();
      expect(q('models-dir')).toBeNull();
    });
  });

  describe('installed assets', () => {
    it('shows an empty state pointing at the catalog when no model is installed', async () => {
      await open();
      expect(text()).toContain('ninguno instalado — elige uno del catálogo');
    });

    it('lists installed files with human sizes', async () => {
      await open({ models: [{ name: 'm.safetensors', size: 2048 }] });
      expect(text()).toContain('m.safetensors');
      expect(text()).toContain('2,0 KB');
    });

    it('states that LoRA files are stored but not applied, on the LoRA tab', async () => {
      await open();
      await openTab(2);
      expect(text()).toContain('El pipeline todavía no aplica LoRA');
    });
  });

  describe('catalog', () => {
    it('install starts a download of the catalog id', async () => {
      await open();
      const btn = root().querySelector('[data-entry="sd-1-5"] button') as HTMLButtonElement;
      btn.click();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({ id: 'sd-1-5' });
      req.flush({ download: dl({ source: 'catalog:sd-1-5', name: 'Stable Diffusion 1.5' }) });
      await settle();
      // while it downloads the card shows progress instead of the button
      expect(root().querySelector('[data-entry="sd-1-5"] button')).toBeNull();
      expect(text()).toContain('50 %');
    });

    it('installed entries show as installed and offer no install action', async () => {
      await open({ cat: catalog(true) });
      const entry = root().querySelector('[data-entry="sd-1-5"]')!;
      expect(entry.textContent).toContain('instalado');
      expect(entry.querySelector('button')).toBeNull();
    });
  });

  describe('Imagen / Voz tabs', () => {
    const openVoiceTab = () => openTab(5);

    it('starts on Imagen: models only, the both-modes note, no LoRAs, video or voices', async () => {
      await open();
      const tabs = Array.from(root().querySelectorAll('[role="tab"]')).map((t) => t.textContent?.trim());
      expect(tabs).toEqual(['Imagen', 'Retoque', 'LoRA', 'Vídeo', 'Música', 'Voz']);
      expect(root().querySelector('[data-kind="model"]')).not.toBeNull();
      expect(root().querySelector('[data-kind="lora"]')).toBeNull();
      expect(root().querySelector('[data-kind="voice"]')).toBeNull();
      expect(root().querySelector('[data-testid="note-image"]')!.textContent).toContain(
        'modo vídeo y en modo imágenes',
      );
      expect(root().querySelector('[data-entry="voice-x"]')).toBeNull();
    });

    it('Imagen cards show what the model is for and its approximate VRAM', async () => {
      await open();
      const card = root().querySelector('[data-entry="sd-1-5"]')!;
      expect(card.textContent).toContain('Checkpoint base');
      expect(card.querySelector('[data-testid="vram"]')!.textContent).toContain('aprox. 4 GB');
    });

    it('every card says whether commercial use is allowed, with its license and note', async () => {
      await open();
      const lic = root().querySelector('[data-entry="sd-1-5"] [data-testid="commercial"]')!;
      expect(lic.getAttribute('data-commercial')).toBe('conditions');
      expect(lic.textContent).toContain('Uso comercial: con condiciones');
      expect(lic.textContent).toContain('CreativeML OpenRAIL-M');
      expect(lic.querySelector('[data-testid="commercial-note"]')!.textContent).toContain('usos prohibidos');
    });

    it('Voz lists only voices, says they apply to video mode only and shows no VRAM', async () => {
      await open();
      await openVoiceTab();
      expect(root().querySelector('[data-kind="voice"]')).not.toBeNull();
      expect(root().querySelector('[data-kind="model"]')).toBeNull();
      expect(root().querySelector('[data-testid="note-voice"]')!.textContent).toContain('solo se usan en modo vídeo');
      const card = root().querySelector('[data-entry="voice-x"]')!;
      expect(card.querySelector('[data-testid="vram"]')).toBeNull();
      expect(root().querySelector('[data-entry="sd-1-5"]')).toBeNull();
      expect(card.querySelector('button')).not.toBeNull();
    });

    it('the form defaults its kind to the active tab', async () => {
      await open();
      const form = (fixture.componentInstance as unknown as { form: { controls: { kind: { value: string } } } }).form;
      expect(form.controls.kind.value).toBe('model');
      await openTab(2);
      expect(form.controls.kind.value).toBe('lora');
      await openTab(3);
      expect(form.controls.kind.value).toBe('video');
      await openTab(4);
      expect(form.controls.kind.value).toBe('music');
      await openVoiceTab();
      expect(form.controls.kind.value).toBe('voice');
    });

    it('LoRA tab lists LoRAs with the notice and its own recommended entries', async () => {
      await open();
      await openTab(2);
      expect(root().querySelector('[data-kind="lora"]')).not.toBeNull();
      expect(root().querySelector('[data-kind="model"]')).toBeNull();
      expect(text()).toContain('El pipeline todavía no aplica LoRA');
      expect(root().querySelector('[data-testid="no-catalog"]')).toBeNull();
      const card = root().querySelector('[data-entry="lora-lcm"]')!;
      expect(card.querySelector('button')).not.toBeNull();
      expect(root().querySelector('[data-entry="sd-1-5"]')).toBeNull();
    });

    it('Vídeo tab lists video files with the notice and the bundles with their files', async () => {
      await open();
      await openTab(3);
      expect(root().querySelector('[data-kind="video"]')).not.toBeNull();
      expect(text()).toContain('El pipeline todavía no genera vídeo con estos modelos');
      expect(root().querySelector('[data-testid="note-video"]')!.textContent).toContain('varios archivos');
      const q4 = root().querySelector('[data-entry="video-wan-q4"]')!;
      expect(q4.querySelector('[data-testid="bundle"]')!.textContent).toContain(
        '3 archivos: modelo · codificador de texto · VAE',
      );
      expect(q4.querySelector('[data-testid="vram"]')!.textContent).toContain('aprox. 6 GB');
      expect(q4.querySelector('button')).not.toBeNull();
      // not measured → no VRAM claim; image and voice entries are not here
      expect(root().querySelector('[data-entry="video-wan-q8"] [data-testid="vram"]')).toBeNull();
      expect(root().querySelector('[data-entry="sd-1-5"]')).toBeNull();
      expect(root().querySelector('[data-entry="voice-x"]')).toBeNull();
    });

    describe('Retoque tab', () => {
      const edit = (installed: boolean): CatalogEntry[] => [
        {
          id: 'edit-qwen', kind: 'model', edit: true, name: 'Qwen-Image-Edit', description: 'Retoque preciso', size_bytes: 19_000_000_000, vram_mb: 11500, installed,
          files: [
            { name: 'q.gguf', role: 'model', url: 'https://h/q.gguf' },
            { name: 'vl.gguf', role: 'llm', url: 'https://h/vl.gguf' },
            { name: 'mm.gguf', role: 'llm_vision', url: 'https://h/mm.gguf' },
            { name: 'qv.safetensors', role: 'vae', url: 'https://h/qv.safetensors' },
          ],
        },
      ];

      it('lists the retouch models with their note, and keeps them out of Imagen', async () => {
        await open({ cat: [...catalog(), ...edit(false)] });
        expect(root().querySelector('[data-entry="edit-qwen"]')).toBeNull();
        await openTab(1);
        const card = root().querySelector('[data-entry="edit-qwen"]')!;
        expect(card.querySelector('[data-testid="bundle"]')!.textContent).toContain('modelo · modelo de texto · proyector de visión · VAE');
        expect(root().querySelector('[data-testid="note-edit"]')!.textContent).toContain('Rápida');
        expect(root().querySelector('[data-entry="sd-1-5"]')).toBeNull();
      });

      it('shows the installed retouch files in this tab only, and the image files in Imagen only', async () => {
        await open({ cat: [...catalog(true), ...edit(true)], models: [{ name: 'v1-5.safetensors', size: 4 }, { name: 'q.gguf', size: 13 }] });
        expect(text()).toContain('v1-5.safetensors');
        expect(text()).not.toContain('q.gguf');
        await openTab(1);
        expect(text()).toContain('q.gguf');
        expect(text()).not.toContain('v1-5.safetensors');
      });

      it('has no download-by-URL form: its models are several files installed from the catalog', async () => {
        await open({ cat: [...catalog(), ...edit(false)] });
        expect(root().querySelector('#url-title')).not.toBeNull();
        await openTab(1);
        expect(root().querySelector('#url-title')).toBeNull();
      });
    });

    it('Música tab lists the music files and the bundles with their four files, and nothing else', async () => {
      await open({ music: [{ name: 'vae.gguf', size: 337_000_000 }] });
      await openTab(4);
      expect(root().querySelector('[data-kind="music"]')).not.toBeNull();
      expect(text()).toContain('vae.gguf');
      expect(root().querySelector('[data-testid="note-music"]')!.textContent).toContain('cuatro archivos');
      const b = root().querySelector('[data-entry="music-17"]')!;
      expect(b.querySelector('[data-testid="bundle"]')!.textContent).toContain(
        '4 archivos: modelo de lenguaje · codificador de texto · modelo de síntesis · VAE',
      );
      expect(b.querySelector('[data-testid="vram"]')!.textContent).toContain('aprox. 9 GB');
      expect(b.querySelector('button')).not.toBeNull();
      expect(root().querySelector('[data-entry="music-06"]')).not.toBeNull();
      expect(root().querySelector('[data-entry="sd-1-5"]')).toBeNull();
      expect(root().querySelector('[data-entry="video-wan-q4"]')).toBeNull();
      expect(root().querySelector('[data-entry="voice-x"]')).toBeNull();
    });

    it('the shared encoder, synthesis model and VAE are not offered as music models', async () => {
      await open({
        music: [
          { name: 'lm-1.7B.gguf', size: 1 },
          { name: 'encoder.gguf', size: 1 },
          { name: 'vae.gguf', size: 1 },
        ],
      });
      await openTab(4);
      const files = Array.from(root().querySelectorAll('[data-kind="music"] ~ ul li, [data-kind="music"] + ul li')).map((li) => li.textContent ?? '');
      const flagged = files.filter((t) => t.includes('pieza de apoyo'));
      expect(flagged.some((t) => t.includes('encoder.gguf'))).toBe(true);
      expect(flagged.some((t) => t.includes('vae.gguf'))).toBe(true);
      expect(flagged.some((t) => t.includes('lm-1.7B.gguf'))).toBe(false);
    });

    it('lists the adapters under the music files, one row each, and their catalog entries in the same tab', async () => {
      await open({ adapters: [{ name: 'chinese-new-year', size: 88_000_000 }, { name: 'style.safetensors', size: 10 }] });
      await openTab(4);
      const section = root().querySelector('[data-kind="adapter"]')!;
      expect(section.textContent).toContain('Adaptadores (LoRA) (2)');
      const names = Array.from(root().querySelectorAll('[data-kind="adapter"] ~ ul .item__name, [data-kind="adapter"] + ul .item__name')).map((n) => n.getAttribute('title'));
      expect(names).toEqual(['chinese-new-year', 'style.safetensors']);
      const card = root().querySelector('[data-entry="adapter-cny"]')!;
      expect(card).not.toBeNull();
      expect(card.querySelector('button')).not.toBeNull();
      expect(root().querySelector('[data-testid="note-music"]')!.textContent).toContain('adaptadores');
    });

    it('installing an adapter starts a download of its catalog id', async () => {
      await open();
      await openTab(4);
      (root().querySelector('[data-entry="adapter-cny"] button') as HTMLButtonElement).click();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({ id: 'adapter-cny' });
      req.flush({ download: dl({ source: 'catalog:adapter-cny', name: 'LoRA «Año Nuevo chino»', kind: 'adapter' }) });
      await settle();
      expect(root().querySelector('[data-entry="adapter-cny"] button')).toBeNull();
    });

    it('removing an adapter deletes it by its name, folder or file', async () => {
      await open({ adapters: [{ name: 'chinese-new-year', size: 1 }] });
      await openTab(4);
      const del = root().querySelector('[data-kind="adapter"] ~ ul button[aria-label="Borrar chinese-new-year"], [data-kind="adapter"] + ul button[aria-label="Borrar chinese-new-year"]') as HTMLButtonElement;
      expect(del).not.toBeNull();
    });

    it('the custom download form offers the adapter type in this tab', async () => {
      await open();
      await openTab(4);
      const kinds = (fixture.componentInstance as unknown as { groups: { id: string; kinds: string[] }[] }).groups.find((g) => g.id === 'music')!.kinds;
      expect(kinds).toEqual(['music', 'adapter', 'heartmula', 'diffrhythm2', 'transcription']); // the weights of the optional generators and the Whisper model are listed, but come only from the catalog
    });

    it('installing a music bundle starts a download of its catalog id', async () => {
      await open();
      await openTab(4);
      (root().querySelector('[data-entry="music-17"] button') as HTMLButtonElement).click();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({ id: 'music-17' });
      req.flush({ download: dl({ source: 'catalog:music-17', name: 'ACE-Step 1.5 (LM 1.7B, turbo)', kind: 'music' }) });
      await settle();
      expect(root().querySelector('[data-entry="music-17"] button')).toBeNull();
    });

    it('installing a video bundle starts a download of its catalog id', async () => {
      await open();
      await openTab(3);
      (root().querySelector('[data-entry="video-wan-q4"] button') as HTMLButtonElement).click();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({ id: 'video-wan-q4' });
      req.flush({ download: dl({ source: 'catalog:video-wan-q4', kind: 'video' }) });
    });

    it('flags starter entries with the badge, and only those', async () => {
      await open();
      expect(root().querySelector('[data-entry="sd-1-5"] [data-testid="starter"]')!.textContent).toContain(
        'Para empezar',
      );
      expect(root().querySelector('[data-entry="sdxl"] [data-testid="starter"]')).toBeNull();
    });

    it('the guide explains the six tabs, recommends an image model and a voice, and can be opened', async () => {
      await open();
      const guide = root().querySelector('[data-testid="guide"]') as HTMLDetailsElement;
      expect(guide.open).toBe(false);
      const t = guide.textContent ?? '';
      for (const word of ['Imagen', 'Retoque', 'LoRA', 'Vídeo', 'Música', 'Voz']) expect(t).toContain(word);
      expect(t).toContain('un modelo de Imagen y una voz');
      guide.open = true;
      await settle();
      expect(root().querySelectorAll('[role="tab"]').length).toBe(6);
      expect(root().querySelector('[data-entry="sd-1-5"]')).not.toBeNull();
    });

    it('the installed list and the recommended catalog start folded, in every tab, and open and close remembered', async () => {
      await open();
      const section = (id: string) => root().querySelector(`[data-testid="${id}-section"]`) as HTMLDetailsElement;
      for (let tab = 0; tab < 6; tab++) {
        await openTab(tab);
        expect(section('installed'), `tab ${tab}: installed`).not.toBeNull();
        expect(section('catalog'), `tab ${tab}: catalog`).not.toBeNull();
        expect(section('installed').open, `tab ${tab}: installed starts folded`).toBe(false);
        expect(section('catalog').open, `tab ${tab}: catalog starts folded`).toBe(false);
        expect(section('catalog').querySelector('h3')!.textContent).toMatch(/Catálogo recomendado\s*\(\d+\)/);
        expect(section('installed').querySelector('h3')!.textContent).toMatch(/Instalado\s*\(\d+\)/);
      }
      await openTab(0);
      section('catalog').open = true;
      section('catalog').dispatchEvent(new Event('toggle'));
      await settle();
      expect(localStorage.getItem('mo.models.catalog')).toBe('open');
      expect(localStorage.getItem('mo.models.installed')).not.toBe('open'); // the other one is untouched
      await openTab(3); // Vídeo: the choice is the same everywhere
      expect(section('catalog').open).toBe(true);
      expect(section('installed').open).toBe(false);
      // the lists are in the page whether open or not: nothing is lost
      expect(root().querySelector('.kind')).not.toBeNull();
      section('catalog').open = false;
      section('catalog').dispatchEvent(new Event('toggle'));
      await settle();
      expect(localStorage.getItem('mo.models.catalog')).toBe('closed');
    });

    it('starts with the lists open as they were left, each on its own', async () => {
      localStorage.setItem('mo.models.installed', 'open');
      fixture.destroy();
      fixture = TestBed.createComponent(ModelsPageComponent); // the choice is read when the page is created
      await open();
      expect((root().querySelector('[data-testid="installed-section"]') as HTMLDetailsElement).open).toBe(true);
      expect((root().querySelector('[data-testid="catalog-section"]') as HTMLDetailsElement).open).toBe(false);
    });

    it('Hugging Face mode explains public vs gated repositories and HF_TOKEN', async () => {
      await open();
      expect(root().querySelector('[data-testid="hf-hint"]')).toBeNull();
      (fixture.componentInstance as unknown as { form: { patchValue(v: object): void } }).form.patchValue({ source: 'hf' });
      await settle();
      const hint = root().querySelector('[data-testid="hf-hint"]')!.textContent!;
      expect(hint).toContain('públicos no necesitan cuenta');
      expect(hint).toContain('HF_TOKEN');
    });
  });

  describe('custom download form', () => {
    const fill = (name: string, value: string) => {
      const el = root().querySelector(`[formcontrolname="${name}"]`) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      (root().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await settle();
    };

    it('does not submit without a URL and shows what is missing', async () => {
      await open();
      await submit();
      http.expectNone('/api/downloads');
      expect(text()).toContain('Pega la URL de descarga');
    });

    it('rejects a non-http URL client-side', async () => {
      await open();
      fill('url', 'ftp://h/x.safetensors');
      await submit();
      http.expectNone('/api/downloads');
      expect(text()).toContain('Debe empezar por http');
    });

    it('posts kind and URL, and clears the fields on success', async () => {
      await open();
      fill('url', ' https://h/x.safetensors ');
      await submit();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({ kind: 'model', url: 'https://h/x.safetensors' });
      req.flush({ download: dl({ name: 'x.safetensors' }) });
      await settle();
      expect((root().querySelector('[formcontrolname="url"]') as HTMLInputElement).value).toBe('');
      expect(text()).toContain('x.safetensors');
    });

    it('Hugging Face mode posts repo, file and optional revision/name', async () => {
      await open();
      const group = (fixture.componentInstance as unknown as { form: { patchValue(v: object): void } }).form;
      group.patchValue({ source: 'hf' });
      fixture.detectChanges();
      fill('repo', 'org/name');
      fill('file', 'w/model.safetensors');
      fill('revision', 'v2');
      fill('name', 'mine.safetensors');
      await submit();
      const req = http.expectOne('/api/downloads');
      expect(req.request.body).toEqual({
        kind: 'model',
        repo: 'org/name',
        file: 'w/model.safetensors',
        revision: 'v2',
        name: 'mine.safetensors',
      });
      req.flush({ download: dl() });
    });

    it('Hugging Face mode validates the repo format', async () => {
      await open();
      (fixture.componentInstance as unknown as { form: { patchValue(v: object): void } }).form.patchValue({ source: 'hf' });
      fixture.detectChanges();
      fill('repo', 'no-slash');
      fill('file', 'x.safetensors');
      await submit();
      http.expectNone('/api/downloads');
      expect(text()).toContain('Formato organización/nombre');
    });

    it('shows the server rejection next to the form and keeps the input', async () => {
      await open();
      fill('url', 'https://h/exists.safetensors');
      await submit();
      http
        .expectOne('/api/downloads')
        .flush(
          { error: { code: 'conflict', message: 'exists.safetensors already exists (set overwrite to replace it)' } },
          { status: 409, statusText: 'Conflict' },
        );
      await settle();
      expect(root().querySelector('[data-testid="form-error"]')?.textContent).toContain('already exists');
      expect((root().querySelector('[formcontrolname="url"]') as HTMLInputElement).value).toBe(
        'https://h/exists.safetensors',
      );
    });
  });

  describe('downloads panel', () => {
    it('shows a determinate bar with bytes when the total is known', async () => {
      await open({ downloads: [dl()] });
      const row = root().querySelector('[data-state="running"]')!;
      const bar = row.querySelector('mat-progress-bar')!;
      expect(bar.getAttribute('mode')).toBe('determinate');
      expect(row.textContent).toContain('50 B / 100 B');
    });

    it('shows an indeterminate bar when the total is unknown', async () => {
      await open({ downloads: [dl({ total: undefined })] });
      expect(root().querySelector('[data-state="running"] mat-progress-bar')!.getAttribute('mode')).toBe('indeterminate');
    });

    it('updates live from stream events without a manual refresh', async () => {
      await open({ downloads: [dl({ bytes: 10 })] });
      handlers.get('dl-1')!.onProgress({ id: 'dl-1', bytes: 90, total: 100 });
      await settle();
      expect(text()).toContain('90 B / 100 B');
    });

    it('cancel posts and shows the download as cancelled', async () => {
      await open({ downloads: [dl()] });
      (root().querySelector('[data-state="running"] button') as HTMLButtonElement).click();
      http.expectOne('/api/downloads/dl-1/cancel').flush({ download: dl({ state: 'cancelled' }) });
      await settle();
      expect(root().querySelector('[data-state="cancelled"]')).not.toBeNull();
      expect(root().querySelector('[data-state="cancelled"] button')).toBeNull();
    });

    it('shows the failure message of a failed download', async () => {
      await open({ downloads: [dl({ state: 'failed', error: 'remote answered 404 Not Found' })] });
      expect(root().querySelector('[data-state="failed"]')!.textContent).toContain('remote answered 404');
    });

    it('shows the full Hugging Face access guidance on a gated failure', async () => {
      const guidance =
        'Hugging Face rechazó el acceso (HTTP 401): acepta su licencia, crea un token de lectura y arranca el servidor con HF_TOKEN=<token>.';
      await open({ downloads: [dl({ state: 'failed', error: guidance })] });
      expect(root().querySelector('[data-state="failed"]')!.textContent).toContain(guidance);
    });

    it('queued downloads say they are waiting and can be cancelled', async () => {
      await open({ downloads: [dl({ state: 'queued', bytes: 0 })] });
      expect(text()).toContain('Esperando');
      expect(root().querySelector('[data-state="queued"] button')).not.toBeNull();
    });
  });

  describe('deletion', () => {
    const confirmWith = (answer: boolean) =>
      vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(answer) } as never);

    it('asks for confirmation naming the file, then deletes and refreshes', async () => {
      await open({ models: [{ name: 'm.safetensors', size: 10 }] });
      const spy = confirmWith(true);
      (root().querySelector('.item button') as HTMLButtonElement).click();
      const del = await vi.waitFor(() => http.expectOne('/api/assets/model/m.safetensors'));
      expect(JSON.stringify(spy.mock.calls[0][1])).toContain('m.safetensors');
      del.flush(null, { status: 204, statusText: 'No Content' });
      await vi.waitFor(() => http.expectOne('/api/assets').flush({ kinds: kinds() }));
      http.expectOne('/api/assets/catalog').flush({ entries: catalog() });
      await vi.waitFor(() =>
        http.expectOne('/api/environment').flush({ binaries: [], models: [], voices: [], loras: [], gpus: [] }),
      );
      await settle();
      expect(text()).not.toContain('m.safetensors');
    });

    it('does nothing when the user declines', async () => {
      await open({ models: [{ name: 'm.safetensors', size: 10 }] });
      confirmWith(false);
      (root().querySelector('.item button') as HTMLButtonElement).click();
      await settle();
      http.expectNone('/api/assets/model/m.safetensors');
      expect(text()).toContain('m.safetensors');
    });

    it('keeps the asset listed when the server refuses (a run is active)', async () => {
      await open({ models: [{ name: 'm.safetensors', size: 10 }] });
      confirmWith(true);
      (root().querySelector('.item button') as HTMLButtonElement).click();
      (await vi.waitFor(() => http.expectOne('/api/assets/model/m.safetensors')))
        .flush({ error: { code: 'conflict', message: 'run r1 is queued or active' } }, { status: 409, statusText: 'Conflict' });
      await settle();
      expect(text()).toContain('m.safetensors');
    });
  });

  // --- download keys (Hugging Face and Civitai) -------------------------------------

  describe('download keys', () => {
    const NEITHER: TokenStatus = { huggingface: false, civitai: false };
    const form = () =>
      (fixture.componentInstance as unknown as { form: { patchValue(v: object): void } }).form;
    const q = (sel: string) => root().querySelector(sel) as HTMLElement | null;
    const fillField = (name: string, value: string) => {
      const el = root().querySelector(`[formcontrolname="${name}"]`) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
    };
    const submitForm = async () => {
      (root().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await settle();
    };

    // The bundles of the real catalog: a Civitai checkpoint with two support pieces, and Krea 2.
    const BUNDLES: CatalogEntry[] = [
      ...catalog(),
      {
        id: 'krea2-turbo-q4',
        kind: 'model',
        name: 'Krea 2 Turbo (Q4)',
        description: 'Fotorrealista',
        size_bytes: 10_000_000_000,
        vram_mb: 14336,
        files: [
          { name: 'krea.gguf', role: 'model', url: 'https://h/krea.gguf' },
          { name: 'qwen.gguf', role: 'text_encoder', url: 'https://h/qwen.gguf' },
          { name: 'wan_vae.safetensors', role: 'vae', url: 'https://h/vae.safetensors' },
        ],
        installed: false,
      },
      {
        id: 'krea2-intorealism-v4-fp8',
        kind: 'model',
        name: 'IntoRealism v4.0',
        description: 'Muy fotorrealista',
        size_bytes: 15_000_000_000,
        vram_mb: 14336,
        requires_token: 'civitai',
        files: [
          { name: 'into.safetensors', role: 'model', url: 'https://civitai.com/api/download/models/1' },
          { name: 'qwen.gguf', role: 'text_encoder', url: 'https://h/qwen.gguf' },
          { name: 'wan_vae.safetensors', role: 'vae', url: 'https://h/vae.safetensors' },
        ],
        installed: false,
      },
    ];

    describe('entering keys', () => {
      const input = (svc: string) => q(`[data-testid=key-input-${svc}]`) as HTMLInputElement;
      const typeKey = (svc: string, v: string) => {
        input(svc).value = v;
        input(svc).dispatchEvent(new Event('input'));
      };
      const saveBtn = (svc: string) => q(`[data-testid=key-save-${svc}]`) as HTMLButtonElement;
      const refreshReply = async (tokens: TokenStatus, sources: TokenSources) => {
        http.expectOne('/api/environment').flush(envReport(tokens, sources));
        await settle();
      };
      /** A configured key shows as one status line; "Cambiar" opens its fields. */
      const expandKey = async (svc: string) => {
        (q(`[data-testid=key-expand-${svc}]`) as HTMLButtonElement).click();
        await settle();
      };
      const confirmRemove = (answer: boolean) =>
        vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(answer) } as never);

      it('uses a masked field per service and keeps Save disabled while it is empty', async () => {
        await open({ tokens: NEITHER });
        for (const svc of ['huggingface', 'civitai']) {
          expect(input(svc).type).toBe('password');
          expect(input(svc).getAttribute('autocomplete')).toBe('off');
          expect(saveBtn(svc).disabled).toBe(true);
        }
        typeKey('civitai', '   ');
        await settle();
        expect(saveBtn('civitai').disabled).toBe(true);
        typeKey('civitai', 'civ_key_value');
        await settle();
        expect(saveBtn('civitai').disabled).toBe(false);
        expect(saveBtn('huggingface').disabled).toBe(true);
      });

      it('saves the key once, empties the field and shows the service as configured', async () => {
        await open({ tokens: NEITHER });
        typeKey('civitai', 'civ_key_value');
        await settle();
        saveBtn('civitai').click();
        await settle();
        const req = http.expectOne('/api/tokens/civitai');
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ token: 'civ_key_value' });
        req.flush(null, { status: 204, statusText: 'No Content' });
        await settle();
        await refreshReply({ huggingface: false, civitai: true }, { civitai: 'file' });
        expect(q('[data-testid=tokens] li[data-service=civitai]')?.getAttribute('data-configured')).toBe('true');
        // configured: it collapses to a status line saying where the key lives
        expect(q('[data-testid=key-input-civitai]')).toBeNull();
        expect(q('[data-testid=key-source-civitai]')?.textContent).toContain('guardada en el servidor');
        await expandKey('civitai');
        expect(input('civitai').value).toBe('');
        expect(q('[data-testid=key-remove-civitai]')).not.toBeNull();
      });

      it('never puts the key anywhere on the screen', async () => {
        await open({ tokens: NEITHER });
        typeKey('huggingface', 'hf_super_secret_value');
        await settle();
        saveBtn('huggingface').click();
        await settle();
        http.expectOne('/api/tokens/huggingface').flush(null, { status: 204, statusText: 'No Content' });
        await settle();
        await refreshReply({ huggingface: true, civitai: false }, { huggingface: 'file' });
        expect(root().innerHTML).not.toContain('hf_super_secret_value');
        await expandKey('huggingface');
        expect(root().innerHTML).not.toContain('hf_super_secret_value');
        expect(input('huggingface').value).toBe('');
      });

      it('shows the server message next to the field and keeps what was typed when the key is refused', async () => {
        await open({ tokens: NEITHER });
        typeKey('huggingface', 'hf_bad key');
        await settle();
        saveBtn('huggingface').click();
        await settle();
        http
          .expectOne('/api/tokens/huggingface')
          .flush({ error: { code: 'invalid_request', message: 'la clave no puede llevar espacios' } }, { status: 400, statusText: 'Bad Request' });
        await settle();
        expect(q('[data-testid=key-error-huggingface]')?.textContent).toContain('no puede llevar espacios');
        expect(input('huggingface').value).toBe('hf_bad key');
        expect(q('[data-testid=tokens] li[data-service=huggingface]')?.getAttribute('data-configured')).toBe('false');
        http.expectNone('/api/environment');
      });

      it('offers Remove only for a key from the file, after confirming', async () => {
        await open({ tokens: { huggingface: false, civitai: true }, sources: { civitai: 'file' } });
        expect(q('[data-testid=key-remove-civitai]')).toBeNull(); // collapsed
        await expandKey('civitai');
        expect(q('[data-testid=key-remove-civitai]')).not.toBeNull();
        expect(q('[data-testid=key-remove-huggingface]')).toBeNull();

        const spy = confirmRemove(false);
        (q('[data-testid=key-remove-civitai]') as HTMLButtonElement).click();
        await settle();
        http.expectNone('/api/tokens/civitai');
        spy.mockRestore();

        confirmRemove(true);
        (q('[data-testid=key-remove-civitai]') as HTMLButtonElement).click();
        await settle();
        const req = http.expectOne('/api/tokens/civitai');
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
        await settle();
        await refreshReply(NEITHER, {});
        expect(q('[data-testid=tokens] li[data-service=civitai]')?.getAttribute('data-configured')).toBe('false');
        expect(q('[data-testid=key-remove-civitai]')).toBeNull();
      });

      it('warns that Hugging Face tools share the file when removing its key', async () => {
        await open({ tokens: { huggingface: true, civitai: false }, sources: { huggingface: 'file' } });
        await expandKey('huggingface');
        const spy = confirmRemove(false);
        (q('[data-testid=key-remove-huggingface]') as HTMLButtonElement).click();
        await settle();
        const data = (spy.mock.calls[0][1] as { data: { message: string } }).data;
        expect(data.message).toContain('Otras herramientas de Hugging Face');
      });

      it('says a key from the environment wins and offers no Remove', async () => {
        await open({ tokens: { huggingface: true, civitai: false }, sources: { huggingface: 'env' } });
        expect(q('[data-testid=key-source-huggingface]')?.textContent).toContain('variable de entorno HF_TOKEN');
        await expandKey('huggingface');
        const note = q('[data-testid=key-env-huggingface]')?.textContent ?? '';
        expect(note).toContain('entorno HF_TOKEN, que manda');
        expect(q('[data-testid=key-remove-huggingface]')).toBeNull();
        expect(q('[data-testid=key-input-huggingface]')).not.toBeNull();
        expect(q('[data-testid=how-huggingface]')).toBeNull();
      });

      it('shows a failure to remove next to the field', async () => {
        await open({ tokens: { huggingface: false, civitai: true }, sources: { civitai: 'file' } });
        await expandKey('civitai');
        confirmRemove(true);
        (q('[data-testid=key-remove-civitai]') as HTMLButtonElement).click();
        await settle();
        http
          .expectOne('/api/tokens/civitai')
          .flush({ error: { code: 'internal_error', message: 'no se pudo quitar la clave' } }, { status: 500, statusText: 'x' });
        await settle();
        expect(q('[data-testid=key-error-civitai]')?.textContent).toContain('no se pudo quitar la clave');
      });
    });

    describe('Civitai mode', () => {
      const PAGE = 'https://civitai.com/models/2772917?modelVersionId=3271538';
      const RESOLVED: CivitaiResolve = {
        model: { id: 2772917, name: 'IntoRealism Krea 2', type: 'Checkpoint', base_model: 'Krea 2' },
        version: { id: 3271538, name: 'v4.0' },
        files: [
          {
            id: 3155486,
            name: 'intorealismKrea2_v40_int8.safetensors',
            type: 'Model',
            format: 'SafeTensor',
            fp: 'int8',
            size_bytes: 13_642_000_000,
            download_url: 'https://civitai.com/api/download/models/3271538?fileId=3155486',
          },
          {
            id: 3214808,
            name: 'intorealismKrea2_v40.safetensors',
            type: 'Model',
            format: 'SafeTensor',
            fp: 'fp8',
            size_bytes: 12_895_000_000,
            download_url: 'https://civitai.com/api/download/models/3271538?fileId=3214808',
          },
        ],
      };
      const search = async (ref = PAGE) => {
        form().patchValue({ source: 'civitai' });
        await settle();
        fillField('ref', ref);
        (q('[data-testid=civitai-search]') as HTMLButtonElement).click();
        await settle();
      };
      const answer = async (body: CivitaiResolve | { status: number; error: object }) => {
        const req = http.expectOne((r) => r.url === '/api/civitai/resolve');
        expect(req.request.params.get('ref')).toBeTruthy();
        if ('status' in body) req.flush({ error: body.error }, { status: body.status, statusText: 'x' });
        else req.flush(body);
        await settle();
      };
      const pick = async (id: number) => {
        (q(`[data-testid=civitai-file-${id}] input`) as HTMLInputElement).click();
        await settle();
      };

      it('shows the mode, with the key note', async () => {
        await open({ tokens: { huggingface: false, civitai: false } });
        form().patchValue({ source: 'civitai' });
        await settle();
        expect(text()).toContain('Descargar por URL, Hugging Face o Civitai');
        expect(q('[data-testid=civitai-mode-note]')?.textContent).toContain('todavía no hay clave configurada');
        expect(q('[formcontrolname=ref]')).not.toBeNull();
      });

      it('goes from a page URL to a download of the chosen file', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer(RESOLVED);
        const r = q('[data-testid=civitai-result]')!.textContent!;
        expect(r).toContain('IntoRealism Krea 2');
        expect(r).toContain('Krea 2');
        expect(r).toContain('v4.0');
        expect(r).toContain('fp8');
        expect(r).toContain('int8');

        await pick(3214808);
        expect((q('[formcontrolname=name]') as HTMLInputElement).value).toBe('intorealismKrea2_v40.safetensors');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body).toEqual({
          kind: 'model',
          url: 'https://civitai.com/api/download/models/3271538?fileId=3214808',
          name: 'intorealismKrea2_v40.safetensors',
        });
        req.flush({ download: dl({ name: 'intorealismKrea2_v40.safetensors' }) });
      });

      it('lets the user change the suggested name', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer(RESOLVED);
        await pick(3214808);
        fillField('name', 'mio.safetensors');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body.name).toBe('mio.safetensors');
        req.flush({ download: dl() });
      });

      it('flags int8 files, and only them, without blocking them', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer(RESOLVED);
        expect(q('[data-testid=civitai-file-3155486] [data-testid=civitai-int8]')?.textContent).toContain('195 s');
        expect(q('[data-testid=civitai-file-3214808] [data-testid=civitai-int8]')).toBeNull();
        await pick(3155486);
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body.url).toContain('fileId=3155486');
        req.flush({ download: dl() });
      });

      it('picks the only file by itself, and the kind from the file type', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer({ ...RESOLVED, files: [{ ...RESOLVED.files[1], type: 'LORA' }] });
        expect((q('[formcontrolname=name]') as HTMLInputElement).value).toBe('intorealismKrea2_v40.safetensors');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body.kind).toBe('lora');
        req.flush({ download: dl() });
      });

      it('shows a refused reference next to the field, without a toast', async () => {
        await open({ tokens: NEITHER });
        await search('https://civitai.com/user/x');
        await answer({ status: 400, error: { code: 'invalid_request', message: 'no reconozco esa dirección: pega la URL…' } });
        expect(q('[data-testid=civitai-error]')?.textContent).toContain('no reconozco esa dirección');
        expect(q('[data-testid=civitai-result]')).toBeNull();
        await submitForm();
        http.expectNone('/api/downloads');
      });

      it('does not download before a file is chosen', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer(RESOLVED);
        await submitForm();
        http.expectNone('/api/downloads');
        expect(q('[data-testid=form-error]')?.textContent).toContain('Elige uno de los archivos');
      });

      it('asks to search first when nothing was searched', async () => {
        await open({ tokens: NEITHER });
        form().patchValue({ source: 'civitai' });
        await settle();
        fillField('ref', PAGE);
        await submitForm();
        http.expectNone('/api/downloads');
        expect(q('[data-testid=form-error]')?.textContent).toContain('Busca primero');
      });

      it('forgets the result when the reference changes', async () => {
        await open({ tokens: NEITHER });
        await search();
        await answer(RESOLVED);
        await pick(3214808);
        fillField('ref', 'https://civitai.com/models/1');
        await settle();
        expect(q('[data-testid=civitai-result]')).toBeNull();
        expect((q('[formcontrolname=name]') as HTMLInputElement).value).toBe('');
      });

      it('leaves the URL and Hugging Face modes as they were', async () => {
        await open({ tokens: NEITHER });
        form().patchValue({ source: 'civitai' });
        await settle();
        form().patchValue({ source: 'url' });
        await settle();
        fillField('url', 'https://example.org/m.safetensors');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body).toEqual({ kind: 'model', url: 'https://example.org/m.safetensors' });
        req.flush({ download: dl() });
        form().patchValue({ source: 'hf' });
        await settle();
        expect(q('[data-testid=hf-hint]')).not.toBeNull();
        expect(q('[data-testid=civitai-result]')).toBeNull();
      });
    });

    describe('bundle roles', () => {
      const a14b: CatalogEntry = {
        id: 'video-a14b',
        kind: 'video',
        name: 'Wan A14B',
        description: 'd',
        size_bytes: 1,
        files: [
          { name: 'high.gguf', role: 'high_noise_model', url: 'https://h/high' },
          { name: 'low.gguf', role: 'model', url: 'https://h/low' },
          { name: 'umt5.gguf', role: 'text_encoder', url: 'https://h/t5' },
          { name: 'vae.safetensors', role: 'vae', url: 'https://h/vae' },
        ],
        installed: false,
      };

      it('names the high-noise expert in the bundle line', async () => {
        await open({ cat: [a14b] });
        await openTab(3);
        const t = q('[data-testid=bundle]')?.textContent ?? '';
        expect(t).toContain('4 archivos');
        expect(t).toContain('experto de ruido alto');
      });

      it('does not label the installed expert as a support file, but does the text encoder', async () => {
        await open({ cat: [a14b], models: [{ name: 'high.gguf', size: 5 }, { name: 'umt5.gguf', size: 5 }] });
        const row = (name: string) =>
          Array.from(root().querySelectorAll('li')).find((li) => (li.textContent ?? '').includes(name) && !li.querySelector('li'));
        expect(row('umt5.gguf')).toBeTruthy();
        expect(row('high.gguf')).toBeTruthy();
        expect(row('umt5.gguf')!.querySelector('[data-testid=support]')).not.toBeNull();
        expect(row('high.gguf')!.querySelector('[data-testid=support]')).toBeNull();
      });
    });

    describe('recommended settings', () => {
      const entry = (id: string, preset?: CatalogEntry['preset']): CatalogEntry => ({
        id,
        kind: 'model',
        name: id,
        description: 'd',
        size_bytes: 1,
        files: [{ name: `${id}.gguf`, role: 'model', url: 'https://h/x' }],
        installed: false,
        preset,
      });
      const presetOf = (id: string) =>
        root().querySelector(`[data-testid=entry-${id}] [data-testid=preset], [data-testid=preset]`);

      it('shows the declared steps, cfg and resolution of an entry', async () => {
        await open({ cat: [entry('k', { steps: 8, cfg_scale: 1, resolution: '1024x576' })] });
        const t = q('[data-testid=preset]')?.textContent ?? '';
        expect(t).toContain('recomendados: 8 pasos');
        expect(t).toContain('cfg 1');
        expect(t).toContain('1024x576');
      });

      it('shows only the fields it declares, and cfg 0 as a value', async () => {
        await open({ cat: [entry('k', { cfg_scale: 0 })] });
        const t = q('[data-testid=preset]')?.textContent ?? '';
        expect(t).toContain('cfg 0');
        expect(t).not.toContain('pasos');
      });

      it('shows nothing for an entry without a preset', async () => {
        await open({ cat: [entry('plain')] });
        expect(presetOf('plain')).toBeNull();
      });
    });

    describe('compact strip and long names', () => {
      it('shows a configured key as one status line and a missing one with its fields', async () => {
        await open({ tokens: { huggingface: true, civitai: false }, sources: { huggingface: 'file' } });
        expect(q('[data-testid=tokens] li[data-service=huggingface]')?.classList.contains('keys__compact')).toBe(true);
        expect(q('[data-testid=key-input-huggingface]')).toBeNull();
        expect(q('[data-testid=key-input-civitai]')).not.toBeNull(); // missing: expanded
        expect(q('[data-testid=how-civitai]')).not.toBeNull();
      });

      it('is a single line when every key is configured, with the fields folded', async () => {
        await open({ tokens: { huggingface: true, civitai: true }, sources: { huggingface: 'file', civitai: 'env' } });
        const lines = Array.from(root().querySelectorAll('[data-testid=tokens] li.keys__compact'));
        expect(lines.length).toBe(2);
        expect(root().querySelector('[data-testid=key-input-huggingface]')).toBeNull();
        expect(root().querySelector('[data-testid=key-input-civitai]')).toBeNull();
        expect(q('[data-testid=key-source-civitai]')?.textContent).toContain('CIVITAI_TOKEN');
      });

      it('folds a configured key back with "Ocultar"', async () => {
        await open({ tokens: { huggingface: true, civitai: true }, sources: { huggingface: 'file', civitai: 'file' } });
        (q('[data-testid=key-expand-huggingface]') as HTMLButtonElement).click();
        await settle();
        expect(q('[data-testid=key-input-huggingface]')).not.toBeNull();
        (q('[data-testid=key-collapse-huggingface]') as HTMLButtonElement).click();
        await settle();
        expect(q('[data-testid=key-input-huggingface]')).toBeNull();
      });

      it('shortens a long installed name in the middle and keeps the whole name for hover and screen readers', async () => {
        const name = 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors';
        await open({ models: [{ name, size: 1 }] });
        const item = root().querySelector('.item__name') as HTMLElement;
        const shown = item.querySelector('[aria-hidden=true]')?.textContent ?? '';
        expect(shown).toContain('…');
        expect(shown.length).toBeLessThanOrEqual(34);
        expect(shown.startsWith('Juggernaut-XL')).toBe(true);
        expect(shown.endsWith('.safetensors')).toBe(true);
        expect(item.getAttribute('title')).toBe(name);
        expect(item.querySelector('.sr-only')?.textContent).toBe(name);
      });

      it('leaves a short name untouched', async () => {
        await open({ models: [{ name: 'm.safetensors', size: 1 }] });
        expect(root().querySelector('.item__name [aria-hidden=true]')?.textContent).toBe('m.safetensors');
      });
    });

    describe('guide', () => {
      const guide = () => q('[data-testid=guide]') as HTMLDetailsElement;
      const fold = async (open: boolean) => {
        guide().open = open;
        guide().dispatchEvent(new Event('toggle'));
        await settle();
      };
      afterEach(() => localStorage.removeItem('mo.models.guide'));

      it('is folded the first time', async () => {
        localStorage.removeItem('mo.models.guide');
        await open();
        expect(guide().open).toBe(false);
      });

      it('remembers being opened on the next visit', async () => {
        await open();
        await fold(true);
        expect(localStorage.getItem('mo.models.guide')).toBe('open');
        // a new visit
        fixture.destroy();
        fixture = TestBed.createComponent(ModelsPageComponent);
        await open();
        expect(guide().open).toBe(true);
      });

      it('is folded again once the user folds it', async () => {
        await open();
        await fold(true);
        await fold(false);
        expect(localStorage.getItem('mo.models.guide')).toBe('closed');
      });

      it('is folded when the browser storage cannot be read', async () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('blocked');
        });
        fixture.destroy();
        fixture = TestBed.createComponent(ModelsPageComponent);
        await open();
        spy.mockRestore();
        expect(guide().open).toBe(false);
      });
    });

    describe('status strip', () => {
      it('shows both services as not configured, each with how to configure it', async () => {
        await open({ tokens: NEITHER });
        for (const svc of ['huggingface', 'civitai']) {
          expect(q(`[data-testid=tokens] li[data-service=${svc}]`)?.getAttribute('data-configured')).toBe('false');
        }
        expect(q('[data-testid=how-huggingface]')?.textContent).toContain('licencia');
        expect(q('[data-testid=how-huggingface]')?.textContent).toContain('pégalo aquí');
        const civ = q('[data-testid=how-civitai]')?.textContent ?? '';
        expect(civ).toContain('API Keys');
        expect(civ).toContain('pégala aquí');
        expect(text()).toContain('no configurada');
      });

      it('shows only Civitai as configured, without instructions for it', async () => {
        await open({ tokens: { huggingface: false, civitai: true } });
        expect(q('[data-testid=tokens] li[data-service=civitai]')?.getAttribute('data-configured')).toBe('true');
        expect(q('[data-testid=tokens] li[data-service=huggingface]')?.getAttribute('data-configured')).toBe('false');
        expect(q('[data-testid=how-civitai]')).toBeNull();
        expect(q('[data-testid=how-huggingface]')).not.toBeNull();
      });

      it('refreshing after adding a key shows it as configured', async () => {
        await open({ tokens: NEITHER });
        expect(q('[data-testid=tokens] li[data-service=civitai]')?.getAttribute('data-configured')).toBe('false');
        (root().querySelector('[data-testid=refresh]') as HTMLButtonElement).click();
        http.expectOne('/api/assets').flush({ kinds: kinds() });
        http.expectOne('/api/assets/catalog').flush({ entries: catalog() });
        http.expectOne('/api/downloads').flush({ downloads: [] });
        http.expectOne('/api/environment').flush(envReport({ huggingface: false, civitai: true }));
        await settle();
        expect(q('[data-testid=tokens] li[data-service=civitai]')?.getAttribute('data-configured')).toBe('true');
      });

      it('does not claim anything while the report has no key information', async () => {
        fixture.detectChanges();
        http.expectOne('/api/assets').flush({ kinds: kinds() });
        http.expectOne('/api/assets/catalog').flush({ entries: catalog() });
        http.expectOne('/api/downloads').flush({ downloads: [] });
        http.expectOne('/api/environment').flush({ binaries: [], models: [], voices: [], loras: [], gpus: [] });
        await settle();
        expect(q('[data-testid=tokens]')).toBeNull();
      });
    });

    describe('catalog entries', () => {
      it('flags an entry that needs a Civitai key as a warning when it is missing, keeping Install available', async () => {
        await open({ cat: BUNDLES, tokens: NEITHER });
        const note = q('[data-entry=krea2-intorealism-v4-fp8] [data-testid=requires-civitai]')!;
        expect(note.getAttribute('data-configured')).toBe('false');
        expect(note.textContent).toContain('Necesita clave de Civitai');
        expect(note.textContent).toContain('no está configurada');
        const btn = q('[data-entry=krea2-intorealism-v4-fp8] button') as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        btn.click();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body).toEqual({ id: 'krea2-intorealism-v4-fp8' });
        req.flush({ download: dl({ source: 'catalog:krea2-intorealism-v4-fp8' }) });
      });

      it('shows the key as configured when the server has it', async () => {
        await open({ cat: BUNDLES, tokens: { huggingface: false, civitai: true } });
        const note = q('[data-entry=krea2-intorealism-v4-fp8] [data-testid=requires-civitai]')!;
        expect(note.getAttribute('data-configured')).toBe('true');
        expect(note.textContent).toContain('configurada en el servidor');
        expect(note.textContent).not.toContain('no está configurada');
      });

      it('shows nothing of the kind on entries that need no key', async () => {
        await open({ cat: BUNDLES, tokens: NEITHER });
        expect(q('[data-entry=sd-1-5] [data-testid^=requires-]')).toBeNull();
        expect(q('[data-entry=krea2-turbo-q4] [data-testid^=requires-]')).toBeNull();
      });

      it('supports a Hugging Face key requirement in the same way', async () => {
        const hf: CatalogEntry = { ...BUNDLES[0], id: 'gated', name: 'Modelo gated', requires_token: 'huggingface' };
        await open({ cat: [hf], tokens: NEITHER });
        const note = q('[data-entry=gated] [data-testid=requires-huggingface]')!;
        expect(note.textContent).toContain('Necesita clave de Hugging Face');
        expect(note.getAttribute('data-configured')).toBe('false');
      });
    });

    describe('support files', () => {
      it('labels the text encoder and the VAE, not the checkpoints or unknown files', async () => {
        await open({
          cat: BUNDLES,
          models: [
            { name: 'krea.gguf', size: 1 },
            { name: 'qwen.gguf', size: 1 },
            { name: 'wan_vae.safetensors', size: 1 },
            { name: 'mio.safetensors', size: 1 },
          ],
        });
        const labelled = Array.from(root().querySelectorAll('[data-kind=model] ~ ul li.item'))
          .filter((li) => li.querySelector('[data-testid=support]'))
          .map((li) => li.querySelector('.item__name .sr-only')?.textContent?.trim());
        expect(labelled).toEqual(['qwen.gguf', 'wan_vae.safetensors']);
      });
    });

    describe('URL form', () => {
      const CIV = 'https://civitai.com/api/download/models/3271538?fileId=3214808';

      it('explains Civitai and requires a file name before submitting', async () => {
        await open({ tokens: NEITHER });
        fillField('url', CIV);
        await settle();
        const hint = q('[data-testid=civitai-hint]')!.textContent!;
        expect(hint).toContain('clave');
        expect(hint).toContain('nombre de archivo');
        expect(hint).toContain('todavía no hay clave configurada');
        expect(text()).toContain('obligatorio con Civitai');

        await submitForm();
        http.expectNone('/api/downloads');
        expect(text()).toContain('Indica el nombre del archivo');
      });

      it('says the key is configured when it is', async () => {
        await open({ tokens: { huggingface: false, civitai: true } });
        fillField('url', CIV);
        await settle();
        expect(q('[data-testid=civitai-hint]')!.textContent).toContain('tu clave está configurada');
      });

      it('submits once the file name is given', async () => {
        await open({ tokens: NEITHER });
        fillField('url', CIV);
        fillField('name', 'modelo.safetensors');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body).toEqual({ kind: 'model', url: CIV, name: 'modelo.safetensors' });
        req.flush({ download: dl({ name: 'modelo.safetensors' }) });
      });

      it('shows nothing Civitai-specific for another host and keeps the name optional', async () => {
        await open({ tokens: NEITHER });
        fillField('url', 'https://huggingface.co/x/y/resolve/main/m.safetensors');
        await settle();
        expect(q('[data-testid=civitai-hint]')).toBeNull();
        expect(text()).toContain('Nombre del archivo (opcional)');
        await submitForm();
        const req = http.expectOne('/api/downloads');
        expect(req.request.body.name).toBeUndefined();
        req.flush({ download: dl() });
      });

      it('does not treat look-alike hosts as Civitai', async () => {
        await open({ tokens: NEITHER });
        for (const u of ['https://evilcivitai.com/a.safetensors', 'https://civitai.com.evil.com/a.safetensors']) {
          fillField('url', u);
          await settle();
          expect(q('[data-testid=civitai-hint]')).toBeNull();
        }
        fillField('url', 'https://cdn.civitai.com/a.safetensors');
        await settle();
        expect(q('[data-testid=civitai-hint]')).not.toBeNull();
      });

      it('Hugging Face mode also says whether HF_TOKEN is configured', async () => {
        await open({ tokens: { huggingface: true, civitai: false } });
        form().patchValue({ source: 'hf' });
        await settle();
        expect(q('[data-testid=hf-status]')!.textContent).toContain('HF_TOKEN está configurado');
      });

      it('Hugging Face mode says when HF_TOKEN is not configured', async () => {
        await open({ tokens: NEITHER });
        form().patchValue({ source: 'hf' });
        await settle();
        expect(q('[data-testid=hf-status]')!.textContent).toContain('HF_TOKEN no está configurado');
      });
    });
  });
});

