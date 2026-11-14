import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { PackageReport } from '../../core/api.models';
import { PackageImportComponent } from './package-import.component';

const REPORT: PackageReport = {
  project: 'Chicas Patines',
  suggested_id: 'Chicas-Patines',
  id_taken: false,
  mode: 'video',
  scenes: 15,
  tracks: 0,
  sources: 2,
  recipe: {
    format: 1,
    project: 'Chicas Patines',
    mode: 'video',
    exported_at: '2026-10-13T10:00:00Z',
    settings: { resolution: '1024x576', steps: 8, cfg_scale: 1, animate: { engine: 'minimax-h3', resolution: '864x480', frames: 56, fps: 24, steps: 4, turbo_lora: true } },
    presets: [{ for: 'Modelo de imagen', catalog_id: 'krea2-turbo-q4', catalog_name: 'Krea 2 Turbo', recommended: { steps: 8 }, used: { steps: 6 }, matches: false, differences: ['steps 8 → 6'] }],
    files: [
      { key: 'defaults.voice', label: 'Voz', path: 'voices/v.onnx', name: 'v.onnx', installed: true },
      { key: 'defaults.model_set.diffusion_model', label: 'Modelo de difusión', path: 'models/k.gguf', name: 'k.gguf', catalog_id: 'krea2-turbo-q4', catalog_name: 'Krea 2 Turbo', installed: false },
      { key: 'defaults.model_set.vae', label: 'VAE', path: 'models/rare.safetensors', name: 'rare.safetensors', installed: false },
    ],
  },
  install: [{ catalog_id: 'krea2-turbo-q4', name: 'Krea 2 Turbo', size_bytes: 10_000_000_000, missing: ['k.gguf'], total_files: 3 }],
  unknown: ['models/rare.safetensors'],
  problems: ['scene "a": picture "mine.png" not found in sources'],
  ready: false,
};

type Cmp = {
  onFile(input: { files: File[] }): Promise<void>;
  install(g: { catalog_id: string }): Promise<void>;
  create(): Promise<void>;
};

describe('PackageImportComponent', () => {
  const close = vi.fn();
  let http: HttpTestingController;
  let fixture: ComponentFixture<PackageImportComponent>;
  let cmp: Cmp;

  const flushStartup = () => {
    for (const url of ['/api/assets', '/api/assets/catalog', '/api/downloads']) {
      for (const r of http.match(url)) r.flush(url === '/api/assets' ? { kinds: [] } : url === '/api/assets/catalog' ? { entries: [] } : { downloads: [] });
    }
  };

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [PackageImportComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PackageImportComponent);
    fixture.detectChanges();
    flushStartup();
    cmp = fixture.componentInstance as unknown as Cmp;
  });

  afterEach(() => http.verify());

  async function choose(): Promise<void> {
    const done = cmp.onFile({ files: [new File(['PK'], 'p.zip')] });
    await Promise.resolve();
    http.expectOne((r) => r.url.startsWith('/api/import/package/preview') && r.method === 'POST').flush(REPORT);
    await done;
    fixture.detectChanges();
  }

  it('shows what the project uses, what is missing and the preset it changed', async () => {
    await choose();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="package-summary"]')?.textContent).toContain('15');
    expect(el.querySelector('[data-testid="package-settings"]')?.textContent).toContain('minimax-h3');
    expect(el.querySelector('[data-testid="package-presets"]')?.textContent).toContain('steps 8 → 6');
    const rows = el.querySelectorAll('[data-testid="package-files"] tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('lo tienes');
    expect(rows[1].textContent).toContain('falta');
    expect(el.querySelector('[data-testid="package-unknown"]')?.textContent).toContain('rare.safetensors');
    expect(el.querySelector('[data-testid="package-problems"]')?.textContent).toContain('mine.png');
    expect(el.querySelector('[data-testid="package-ready"]')).toBeNull();
    expect((el.querySelector('[data-testid="package-id"]') as HTMLInputElement).value).toBe('Chicas-Patines');
  });

  it('installs a missing bundle by its catalog id', async () => {
    await choose();
    const p = cmp.install({ catalog_id: 'krea2-turbo-q4' });
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/downloads' });
    expect(req.request.body).toEqual({ id: 'krea2-turbo-q4' });
    req.flush({ download: { id: 'd1', state: 'queued', kind: 'model', name: 'k', files: [], source: 'catalog:krea2-turbo-q4', bytes: 0, created_at: '' } });
    await p;
  });

  it('creates the project from the same zip and closes with its id', async () => {
    await choose();
    const p = cmp.create();
    await Promise.resolve();
    const req = http.expectOne((r) => r.url.startsWith('/api/import/package/confirm') && r.method === 'POST');
    expect(req.request.url).toContain('id=Chicas-Patines');
    req.flush({ id: 'Chicas-Patines', ready: false, install: null, unknown: null });
    await p;
    expect(close).toHaveBeenCalledWith({ id: 'Chicas-Patines', mode: 'video' });
  });
});
