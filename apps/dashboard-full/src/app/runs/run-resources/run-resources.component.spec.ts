import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunResources } from '../../core/api.models';
import { RunResourcesComponent } from './run-resources.component';

const RES: RunResources = {
  interval_ms: 2000,
  truncated: false,
  gpus: [
    {
      index: 1,
      total_mb: 16000,
      samples: [
        { t_ms: 0, used_mb: 1600, util_pct: 0 },
        { t_ms: 2000, used_mb: 14400, util_pct: 95 },
        { t_ms: 4000, used_mb: 8000, util_pct: 40 },
      ],
    },
  ],
  ram: { total_mb: 30000, samples: [{ t_ms: 0, used_mb: 6000 }, { t_ms: 2000, used_mb: 21000 }] },
  peaks: { vram: [{ gpu: 1, mb: 14400, pct: 90 }], ram: { mb: 21000, pct: 70 } },
};

const EMPTY: RunResources = {
  interval_ms: 2000,
  truncated: false,
  gpus: [],
  ram: { total_mb: 0, samples: [] },
  peaks: { vram: [], ram: null },
};

describe('RunResourcesComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<RunResourcesComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector(sel) as HTMLElement | null;
  const qa = (sel: string) => Array.from(el().querySelectorAll(sel)) as HTMLElement[];
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function mount(body: RunResources | 'fail', state = 'succeeded') {
    await TestBed.configureTestingModule({
      imports: [RunResourcesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RunResourcesComponent);
    fixture.componentRef.setInput('runId', 'run-1');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    const req = http.expectOne('/api/runs/run-1/resources');
    if (body === 'fail') req.flush({ error: { code: 'internal_error', message: 'x' } }, { status: 500, statusText: 'x' });
    else req.flush(body);
    await settle();
  }

  afterEach(() => http.verify());

  it('draws a VRAM curve per GPU as a percentage of its total, with utilization and the peak', async () => {
    await mount(RES);
    const gpu = q('[data-testid=res-gpu-1]')!;
    expect(gpu).not.toBeNull();
    expect(gpu.textContent).toContain('GPU 1');
    expect(gpu.textContent).toContain('14.400 MB (90,0 %)'); // the peak, in MB and %
    expect(gpu.querySelectorAll('.line').length).toBe(2); // VRAM + utilization
    const ys = Array.from(gpu.querySelectorAll('circle')).slice(0, 3).map((c) => Number(c.getAttribute('cy')));
    expect(ys[1]).toBeLessThan(ys[0]); // 90 % is drawn above 10 %
    // the axis is 0-100 %: plot area y from 10 (100 %) to 172 (0 %), so 90 % sits at 10 + 162 * 0.1
    expect(ys[1]).toBeCloseTo(26.2, 1);
    expect(ys[0]).toBeCloseTo(10 + 162 * 0.9, 1);
    expect(ys.every((y) => y >= 10 && y <= 172)).toBe(true);
    expect(gpu.textContent).toContain('100 %'); // the axis is 0-100 %
  });

  it('labels the VRAM as that of the whole GPU', async () => {
    await mount(RES);
    const t = q('[data-testid=res-gpu-1]')!.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('Memoria de la GPU entera durante el run');
    expect(t).toContain('incluye cualquier otro proceso que la usara');
  });

  it('draws the RAM curve with its peak', async () => {
    await mount(RES);
    const ram = q('[data-testid=res-ram]')!;
    expect(ram.textContent).toContain('21.000 MB (70,0 %)');
    expect(ram.querySelectorAll('circle').length).toBe(2);
  });

  it('describes a point on focus in MB and percent', async () => {
    await mount(RES);
    const circle = q('[data-testid=res-gpu-1] circle')!;
    expect(circle.getAttribute('aria-label')).toContain('VRAM usada');
    circle.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(q('[data-testid=res-gpu-1] [data-testid=chart-readout]')?.textContent).toContain('1600 MB (10,0 %) a los 0 s');
  });

  it('offers the same numbers as a table', async () => {
    await mount(RES);
    (q('[data-testid=res-gpu-1] [data-testid=chart-toggle]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cells = Array.from(el().querySelectorAll('[data-testid=res-gpu-1] [data-testid=chart-table] td')).map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(['0 s', '1600', '10,0', '0']);
    expect(cells.slice(4, 8)).toEqual(['2 s', '14400', '90,0', '95']);
  });

  it('says no resource data was recorded for a run without samples', async () => {
    await mount(EMPTY);
    expect(q('[data-testid=res-nodata]')?.textContent).toContain('No se registraron datos de recursos para este run');
    expect(q('mo-chart-frame')).toBeNull();
  });

  it('explains a failed load without hiding the rest of the page', async () => {
    await mount('fail');
    expect(q('[data-testid=res-error]')?.textContent).toContain('No se pudieron cargar los recursos');
  });

  it('says when sampling stopped at the limit', async () => {
    await mount({ ...RES, truncated: true });
    expect(q('[data-testid=res-truncated]')?.textContent).toContain('se dejó de muestrear');
  });

  it('draws only the RAM when the run has no GPU samples', async () => {
    await mount({ ...RES, gpus: [], peaks: { vram: [], ram: RES.peaks.ram } });
    expect(q('[data-testid=res-ram]')).not.toBeNull();
    expect(qa('mo-chart-frame').length).toBe(1);
  });

  it('reloads what was sampled so far when asked, and when the run changes state', async () => {
    await mount(EMPTY, 'running');
    (q('[data-testid=res-refresh]') as HTMLButtonElement).click();
    await settle();
    http.expectOne('/api/runs/run-1/resources').flush(RES);
    await settle();
    expect(q('[data-testid=res-gpu-1]')).not.toBeNull();
    fixture.componentRef.setInput('state', 'succeeded');
    fixture.detectChanges();
    http.expectOne('/api/runs/run-1/resources').flush({ ...RES, truncated: true });
    await settle();
    expect(q('[data-testid=res-truncated]')).not.toBeNull();
  });
});
