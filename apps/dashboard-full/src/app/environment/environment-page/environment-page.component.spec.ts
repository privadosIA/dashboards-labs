import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';

import { EnvironmentReport } from '../../core/api.models';
import { EnginesStore } from '../../core/engines.store';
import { EnvironmentPageComponent } from './environment-page.component';

const REPORT: EnvironmentReport = {
  binaries: [
    { name: 'piper', required: true, present: true, path: '/x/piper', version: '1.2.0' },
    { name: 'sd', required: true, present: false, fix: 'bash scripts/build-sd.sh' },
    { name: 'nvidia-smi', required: false, present: false, fix: 'install the NVIDIA driver' },
  ],
  models: [],
  voices: [{ name: 'v.onnx', size: 2048 }],
  loras: [],
  ram: { total_bytes: 32e9, available_bytes: 12e9 },
  gpus: [
    { index: 0, name: 'RTX 4070', free_vram_mb: 3123, low_vram: true },
    { index: 1, name: 'RTX 5060 Ti', free_vram_mb: 14900, ollama_mb: 4096 },
  ],
};

describe('EnvironmentPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EnvironmentPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EnvironmentPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/environment').flush(REPORT);
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: {} });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('shows missing binaries with the named script as a manual fix, no run button', () => {
    expect(text()).toContain('piper');
    expect(text()).toContain('1.2.0');
    expect(text()).toContain('bash scripts/build-sd.sh');
    expect(text()).toContain('ejecútalo a mano');
    // No execution affordance anywhere near the fix.
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button:not([data-testid=gpu-free-ollama]):not([data-testid^=gpu-free-])'));
    expect(buttons.length).toBe(1); // only the refresh button (the others free what the app holds on a card)
  });

  it('shows the memory available and in use', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=ram-available]')?.textContent).toContain('GB');
    expect(el.querySelector('[data-testid=ram-used]')?.textContent).toContain('/');
  });

  it('lists inventories with sizes and quiet empty states', () => {
    expect(text()).toContain('v.onnx');
    expect(text()).toContain('2,0 KB');
    expect(text()).toContain('ninguno — bash scripts/get-models.sh');
  });

  it('shows GPUs with free VRAM and the Ollama caveat on the affected one', () => {
    expect(text()).toContain('RTX 4070');
    expect(text()).toContain('3123 MB libres');
    expect(text()).toContain('Ollama retiene 4096 MB');
    expect(text()).toContain('Queda poca VRAM libre (3123 MB)');
    expect(text()).toContain('Liberar VRAM de Ollama');
  });

  it('groups the report into titled panels, with the counts in the inventories', () => {
    const el = fixture.nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('mo-panel [data-testid=panel-title]')).map((t) => t.textContent);
    expect(titles).toEqual(['Binarios', 'Voces (1)', 'Modelos (0)', 'LoRAs (0)', 'GPUs', 'RAM']);
    expect(el.querySelector('mo-page-header h1')?.textContent).toBe('Entorno');
  });

  it('refresh fetches a fresh report', async () => {
    const cmp = fixture.componentInstance as unknown as { refresh(): void };
    cmp.refresh();
    http.expectOne('/api/environment').flush(REPORT);
  });
  /** Answers, in order of arrival, what a freeing asks of the server. */
  async function settle(answers: Record<string, unknown>): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await fixture.whenStable();
      for (const r of http.match(() => true)) {
        const key = r.request.url + (r.request.urlWithParams.includes('?') ? '?' + r.request.urlWithParams.split('?')[1] : '');
        r.flush(answers[key] ?? answers[r.request.url] ?? {});
      }
    }
    fixture.detectChanges();
  }

  it('frees a card of the music container running on it, and says what it let go of', async () => {
    const el = fixture.nativeElement as HTMLElement;
    // Every card has the button, whether or not the app holds anything on it.
    expect(el.querySelector('[data-testid=gpu-free-0]')).not.toBeNull();
    expect(el.querySelector('[data-testid=gpu-free-1]')).not.toBeNull();
    TestBed.inject(EnginesStore).data.set({
      heartmula: { available: true, mode: 'local', version: '1', container: { state: 'running', gpu: 0, port: 1 } },
    } as never);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=gpu-free-0]')).not.toBeNull();

    (el.querySelector('[data-testid=gpu-free-0]') as HTMLButtonElement).click();
    await settle({ '/api/music/engines/heartmula/stop': { container: { state: 'stopped' } }, '/api/music/engines?stats=1': { engines: {} }, '/api/environment': REPORT });
    expect(el.querySelector('[data-testid=gpu-freed-0]')?.textContent).toContain('HeartMuLa');
  });

  it('says there was nothing to let go of when the card holds nothing of the app', async () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid=gpu-free-0]') as HTMLButtonElement).click();
    await settle({ '/api/environment': REPORT });
    expect(el.querySelector('[data-testid=gpu-freed-0]')?.textContent).toContain('nada');
  });

  it('unloads Ollama when the card holds its models', async () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid=gpu-free-1]') as HTMLButtonElement).click();
    await settle({ '/api/environment/ollama/unload': { unloaded: ['gemma4:26b'] }, '/api/environment': REPORT });
    expect(el.querySelector('[data-testid=gpu-freed-1]')?.textContent).toContain('gemma4:26b');
  });

});

describe('EnvironmentPageComponent music engine', () => {
  async function open(report: EnvironmentReport) {
    await TestBed.configureTestingModule({
      imports: [EnvironmentPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EnvironmentPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/environment').flush(report);
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: {} });
    await fixture.whenStable();
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, http };
  }

  it('lists the engine with its fix when it is missing, as something only music projects need', async () => {
    const { el, http } = await open({
      ...REPORT,
      binaries: [
        ...REPORT.binaries,
        { name: 'ace-synth', required: false, present: false, fix: 'bash scripts/build-acestep.sh' },
        { name: 'ace-lm', required: false, present: true, path: '/x/ace-lm', version: 'acestep.cpp d881ad2' },
      ],
    });
    const rows = Array.from(el.querySelectorAll('.item'));
    const synth = rows.find((r) => r.textContent?.includes('ace-synth'))!;
    expect(synth.textContent).toContain('bash scripts/build-acestep.sh');
    expect(synth.textContent).toContain('ejecútalo a mano');
    expect(synth.querySelector('[data-testid=music-only]')?.textContent).toContain('proyectos de música');
    expect(synth.querySelector('.item__state')?.classList.contains('missing')).toBe(false); // not an error for the others
    const lm = rows.find((r) => r.textContent?.includes('ace-lm'))!;
    expect(lm.textContent).toContain('acestep.cpp d881ad2');
    expect(lm.querySelector('[data-testid=music-only]')).toBeNull();
    http.verify();
  });

  it('lists the retouch files in their own panel, apart from the image models', async () => {
    const { el, http } = await open({
      ...REPORT,
      models: [{ name: 'sdxl.safetensors', size: 7e9 }],
      retouch: [{ name: 'Qwen-Image-Edit-2509-Q4_K_M.gguf', size: 13e9 }],
    });
    const panel = el.querySelector('[data-testid="retouch-panel"]')!;
    expect(panel.textContent).toContain('Modelos de retoque (1)');
    expect(panel.textContent).toContain('Qwen-Image-Edit-2509');
    expect(panel.textContent).not.toContain('sdxl');
    expect(el.textContent).toContain('Modelos (1)');
    http.verify();
  });

  it('puts the big panels first and, with the retouch panel, stacks disk and RAM so the rows stay four and four', async () => {
    const { el, http } = await open({
      ...REPORT,
      retouch: [{ name: 'q.gguf', size: 1 }],
      music: [{ name: 'vae-BF16.gguf', size: 2048 }],
      disk: { total_bytes: 928e9, free_bytes: 231e9, low: false },
    });
    const titles = Array.from(el.querySelectorAll('mo-panel [data-testid=panel-title]')).map((t) => t.textContent?.replace(/ \(\d+\)$/, ''));
    expect(titles).toEqual(['Binarios', 'Voces', 'Modelos', 'Modelos de música', 'Modelos de retoque', 'LoRAs', 'GPUs', 'Disco', 'RAM']);
    const stack = el.querySelector('.stack')!;
    expect(stack.classList).toContain('stack--on');
    expect(stack.querySelector('[data-testid="disk-panel"]')).not.toBeNull();
    expect(stack.querySelector('[data-testid="ram-panel"]')).not.toBeNull();
    http.verify();
  });

  it('shows no retouch panel when there are no retouch files', async () => {
    const { el, http } = await open(REPORT);
    expect(el.querySelector('[data-testid="retouch-panel"]')).toBeNull();
    http.verify();
  });

  it('shows the installed music models in their own panel, with a hint when there are none', async () => {
    const full = await open({ ...REPORT, music: [{ name: 'vae-BF16.gguf', size: 2048 }] });
    const titles = Array.from(full.el.querySelectorAll('mo-panel [data-testid=panel-title]')).map((t) => t.textContent);
    expect(titles).toContain('Modelos de música (1)');
    expect(full.el.querySelector('[data-testid=music-panel]')?.textContent).toContain('vae-BF16.gguf');
    full.http.verify();
  });

  it('says how to install them when the panel is empty', async () => {
    const { el, http } = await open({ ...REPORT, music: [] });
    expect(el.querySelector('[data-testid=music-panel]')?.textContent).toContain('pestaña Música');
    http.verify();
  });
});

describe('EnvironmentPageComponent long names', () => {
  const LONG = 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors';

  it('renders a long model name whole, and the stylesheet lets it wrap inside its panel', async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EnvironmentPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/environment').flush({ ...REPORT, models: [{ name: LONG, size: 7_000_000_000 }] });
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: {} });
    await fixture.whenStable();
    fixture.detectChanges();

    const names = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.item__name')).map((n) => n.textContent);
    expect(names).toContain(LONG);
    // jsdom has no layout: the real overflow is checked in a browser; here the rule that prevents it.
    const css = readFileSync('apps/dashboard-full/src/app/environment/environment-page/environment-page.component.scss', 'utf8');
    expect(css).toMatch(/&__name\s*{[^}]*overflow-wrap:\s*anywhere/);
    http.verify();
  });
});
