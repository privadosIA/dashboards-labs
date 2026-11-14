import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAppDynamicForms } from '../../shared/dynamic/dynamic-forms.providers';

import { StatsResult } from '../../core/api.models';
import { StatsPageComponent } from './stats-page.component';

const STATS: StatsResult = {
  period: { since: '2026-09-10T00:00:00Z', until: '2026-10-10T00:00:00Z' },
  totals: { runs: 4, by_state: { succeeded: 3, failed: 1 }, success_rate: 0.75, total_seconds: 4000, queue_wait_mean_seconds: 2 },
  duration: { runs: 3, mean_seconds: 40, median_seconds: 30, p95_seconds: 100, total_seconds: 120 },
  by_day: [
    { date: '2026-10-05', succeeded: 2, failed: 1, other: 0, seconds: 90 },
    { date: '2026-10-06', succeeded: 1, failed: 0, other: 0, seconds: 30 },
  ],
  phases: [
    { phase: 'tts', executions: 2, reused: 1, total_seconds: 4, mean_seconds: 2, p95_seconds: 3 },
    { phase: 'render', executions: 3, reused: 3, total_seconds: 60, mean_seconds: 20, p95_seconds: 25 },
  ],
  cache: { executed: 5, reused: 4, reuse_share: 4 / 9 },
  by_project: [{ name: 'demo', runs: 4, seconds: 120, success_rate: 0.75 }],
  by_gpu: [
    { name: '1', runs: 3, seconds: 100, success_rate: 1, peak_vram_pct: 87.5, mean_peak_vram_pct: 70, sampled_runs: 2 },
    { name: '0', runs: 1, seconds: 20, success_rate: 0 },
  ],
  by_mode: [
    { name: 'video', runs: 3, seconds: 100, success_rate: 2 / 3 },
    { name: 'music', runs: 1, seconds: 20, success_rate: 1 },
  ],
  run_durations: [
    { id: 'run-1', project: 'demo', state: 'succeeded', created_at: '2026-10-05T10:00:00Z', seconds: 10 },
    { id: 'run-2', project: 'demo', state: 'succeeded', created_at: '2026-10-05T11:00:00Z', seconds: 30 },
    { id: 'run-3', project: 'demo', state: 'failed', created_at: '2026-10-06T10:00:00Z', seconds: 80 },
  ],
  slowest: [
    { id: 'run-3', project: 'demo', state: 'failed', created_at: '2026-10-06T10:00:00Z', seconds: 80, mode: 'video' },
    { id: 'run-2', project: 'demo', state: 'succeeded', created_at: '2026-10-05T11:00:00Z', seconds: 30, mode: 'music' },
  ],
};

const EMPTY: StatsResult = {
  period: STATS.period,
  totals: { runs: 0, by_state: {}, total_seconds: 0 },
  duration: { runs: 0, total_seconds: 0 },
  by_day: [], phases: [], cache: { executed: 0, reused: 0 }, by_project: [], by_gpu: [], run_durations: [], slowest: [],
};

describe('StatsPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<StatsPageComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector(sel) as HTMLElement | null;
  const qa = (sel: string) => Array.from(el().querySelectorAll(sel)) as HTMLElement[];
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** The y-axis labels sit left of the plot; the last x label also ends at the right edge. */
  const yTicks = (chart: Element) =>
    Array.from(chart.querySelectorAll('text.tick[text-anchor=end]'))
      .filter((t) => Number(t.getAttribute('x')) < 100)
      .map((t) => t.textContent?.trim());
  const statsReq = () => http.expectOne((r) => r.url === '/api/stats');

  async function open(stats: StatsResult = STATS, servers: string[] = [], grafana = '') {
    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideAppDynamicForms()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([{ id: 'demo', name: 'demo', mode: 'video', scene_count: 1 }, { id: 'test', name: 'test', mode: 'video', scene_count: 1 }]);
    http.match('/api/settings/database').forEach((r) => r.flush({ saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, server_name: 'x', servers }));
    http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: grafana ? [{ id: 'grafana', address: grafana, secret_set: false }] : [] }));
    statsReq().flush(stats);
    await settle();
  }

  afterEach(() => http.verify());

  it('asks for the last 30 days by default and shows the cards', async () => {
    await open();
    // (the request was answered in open(); check what it asked for through the page state)
    expect(q('[data-testid=card-runs] .card__value')?.textContent?.trim()).toBe('4');
    expect(q('[data-testid=card-success] .card__value')?.textContent?.trim()).toBe('75 %');
    expect(q('[data-testid=card-time] .card__value')?.textContent?.trim()).toBe('1 h 06 min');
    expect(q('[data-testid=card-median] .card__value')?.textContent?.trim()).toBe('30 s');
    expect(q('[data-testid=card-cache] .card__value')?.textContent?.trim()).toBe('44 %');
  });

  it('has no link to Grafana when no address is saved in Settings', async () => {
    await open();
    expect(q('[data-testid=stats-grafana]')).toBeNull();
  });

  it('links to Grafana when its address is saved in Settings', async () => {
    await open(STATS, [], 'http://192.168.1.20:3000');
    fixture.detectChanges();
    const a = q('[data-testid=stats-grafana]') as HTMLAnchorElement;
    expect(a.href).toBe('http://192.168.1.20:3000/');
    expect(a.target).toBe('_blank');
  });

  it('offers the server filter only when the history has more than one, and asks the server for it', async () => {
    await open(STATS, ['estudio', 'portatil']);
    const select = q('[data-testid=stats-server]');
    expect(select).not.toBeNull();
    (fixture.componentInstance as unknown as { setServer(n: string): Promise<void> }).setServer('portatil');
    const req = http.expectOne((r) => r.url === '/api/stats' && r.params.get('server') === 'portatil');
    req.flush(STATS);
    await settle();
  });

  it('offers the client filter from the clients in the history, asks the server for it and keeps the list while one is chosen', async () => {
    await open({ ...STATS, by_client: [{ name: 'embedded', runs: 3, seconds: 10 }, { name: 'video-studio', runs: 2, seconds: 20 }] });
    expect(q('[data-testid=stats-client]')).not.toBeNull();
    (fixture.componentInstance as unknown as { setClient(n: string): Promise<void> }).setClient('video-studio');
    http.expectOne((r) => r.url === '/api/stats' && r.params.get('client') === 'video-studio').flush({ ...STATS, by_client: [{ name: 'video-studio', runs: 2, seconds: 20 }] });
    await settle();
    expect(q('[data-testid=stats-client]')).not.toBeNull();
  });

  it('does not offer the client filter when every run has the same client', async () => {
    await open({ ...STATS, by_client: [{ name: 'embedded', runs: 3, seconds: 10 }] });
    expect(q('[data-testid=stats-client]')).toBeNull();
  });

  it('does not offer the server filter for a single server', async () => {
    await open(STATS, ['estudio']);
    expect(q('[data-testid=stats-server]')).toBeNull();
  });

  it('requests a 30-day window with no project at first', async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideAppDynamicForms()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([]);
    http.match('/api/settings/database').forEach((r) => r.flush({ saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, server_name: 'x', servers: [] }));
    http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: [] }));
    const req = statsReq();
    expect(req.request.params.has('project')).toBe(false);
    const since = Date.parse(req.request.params.get('since')!);
    expect(Date.now() - since).toBeGreaterThan(29.9 * 24 * 3600 * 1000);
    expect(Date.now() - since).toBeLessThan(30.1 * 24 * 3600 * 1000);
    req.flush(EMPTY);
    await settle();
  });

  it('draws the six charts from the server figures', async () => {
    await open();
    expect(qa('mo-chart-frame').length).toBe(6);
    expect(qa('[data-testid=stacked-chart] .seg').length).toBe(3); // day 1: ok+bad, day 2: ok
    expect(q('[data-testid=line-chart] .line')).not.toBeNull();
    expect(q('[data-testid=chart-reference]')).not.toBeNull();
    expect(q('.ref-label')?.textContent).toContain('mediana 30 s');
    expect(qa('[data-testid=bar-chart]').length).toBe(3); // phases, GPU peaks and runs by kind
    expect(q('[data-testid=ratio-bar]')).not.toBeNull();
  });

  it('tops the duration axis at a round time so the tick labels are short and fit', async () => {
    await open();
    const line = q('[data-testid=line-chart]')!;
    const ticks = yTicks(line);
    expect(ticks).toEqual(['0 s', '30 s', '1 min', '1,5 min', '2 min']); // 80 s of data tops out at 2 min
    for (const t of ticks) expect(t!.length).toBeLessThanOrEqual(8);
  });

  it('rounds the duration axis to hours when runs take hours', async () => {
    await open({ ...STATS, run_durations: [{ ...STATS.run_durations[0], seconds: 5000 }], duration: { ...STATS.duration, median_seconds: 5000 } });
    expect(yTicks(q('[data-testid=line-chart]')!)).toEqual(['0 s', '30 min', '1 h', '1,5 h', '2 h']);
  });

  it('shows time per phase with executions, mean and reuses in the readout', async () => {
    await open();
    const first = qa('[data-testid=bar-chart]')[0];
    const labels = qa('[data-testid=bar-chart] .label').map((l) => l.textContent);
    expect(labels).toContain('render');
    (first.querySelector('[data-testid=bar-1]') as HTMLElement).dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    const readout = first.closest('mo-bar-chart')!.querySelector('[data-testid=chart-readout]');
    expect(readout?.textContent).toMatch(/render: 1 min 00 s · 3 ejecuciones · media 20 s · 3 reutilizadas/);
  });

  it('shows the GPU peaks as percentages and says what they measure', async () => {
    await open();
    const gpu = qa('mo-chart-frame')[4];
    expect(gpu.textContent).toContain('memoria de la GPU entera');
    expect(gpu.textContent).toContain('87,5 %');
    expect(gpu.textContent).toContain('GPU 1');
    expect(gpu.textContent).not.toContain('GPU 0'); // no samples: no peak bar
  });

  it('says there are no resource samples yet when no GPU has peaks', async () => {
    await open({ ...STATS, by_gpu: [{ name: '1', runs: 3, seconds: 100, success_rate: 1 }] });
    expect(q('[data-testid=gpu-nodata]')?.textContent).toContain('anteriores al muestreo');
  });

  it('switches a chart to its table with the same numbers', async () => {
    await open();
    const phases = qa('mo-chart-frame')[2];
    (phases.querySelector('[data-testid=chart-toggle]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cells = Array.from(phases.querySelectorAll('[data-testid=chart-table] td')).map((c) => c.textContent);
    expect(cells.slice(0, 6)).toEqual(['tts', '2', '1', '4 s', '2 s', '3 s']);
  });

  it('lists the slowest runs, each opening its monitor', async () => {
    await open();
    const links = qa('[data-testid=stats-slowest] a');
    expect(links.map((a) => a.textContent?.trim())).toEqual(['run-3', 'run-2']);
    expect(links[0].getAttribute('href')).toBe('/runs/run-3');
  });

  it('shows a run whose result is gone as plain text, without a link', async () => {
    await open({ ...STATS, slowest: [STATS.slowest[0], { ...STATS.slowest[1], result_available: false }] });
    const table = q('[data-testid=stats-slowest]')!;
    expect(Array.from(table.querySelectorAll('a')).map((a) => a.textContent?.trim())).toEqual(['run-3']);
    expect(table.textContent).toContain('run-2');
  });

  it('says so, instead of drawing empty charts, when the period has no runs', async () => {
    await open(EMPTY);
    expect(q('[data-testid=stats-empty]')?.textContent).toContain('Aún no hay runs en este periodo');
    expect(q('mo-chart-frame')).toBeNull();
    expect(q('[data-testid=stats-cards]')).toBeNull();
  });

  it('recomputes everything for the chosen project', async () => {
    await open();
    q('[data-testid=stats-project]')!.click();
    await settle();
    (document.querySelector('mat-option:nth-child(3)') as HTMLElement).click(); // "test"
    await settle();
    const req = statsReq();
    expect(req.request.params.get('project')).toBe('test');
    req.flush({ ...STATS, totals: { ...STATS.totals, runs: 9 } });
    await settle();
    expect(q('[data-testid=card-runs] .card__value')?.textContent?.trim()).toBe('9');
  });

  it('changes the period and asks the server again with the new window', async () => {
    await open();
    const buttons = qa('[data-testid=stats-period] button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['7 días', '30 días', '90 días', 'Todo']);
    buttons[0].click();
    await settle();
    let req = statsReq();
    const since = Date.parse(req.request.params.get('since')!);
    expect(Date.now() - since).toBeLessThan(7.1 * 24 * 3600 * 1000);
    req.flush(STATS);
    await settle();
    buttons[3].click();
    await settle();
    req = statsReq();
    expect(req.request.params.get('since')).toBe('2000-01-01');
    req.flush(STATS);
    await settle();
  });

  it('explains a failed request without breaking the page', async () => {
    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideAppDynamicForms()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StatsPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([]);
    http.match('/api/settings/database').forEach((r) => r.flush({ saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, server_name: 'x', servers: [] }));
    http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: [] }));
    statsReq().flush({ error: { code: 'internal_error', message: 'x' } }, { status: 500, statusText: 'x' });
    await settle();
    expect(q('[data-testid=stats-error]')?.textContent).toContain('No se pudieron cargar las estadísticas');
    expect(q('[data-testid=stats-filters]')).not.toBeNull();
  });

  it('shows how many runs each kind of project had, and the kind of each slow run', async () => {
    await open();
    const bars = qa('[data-testid=stats-by-mode] [data-testid=bar-label], [data-testid=stats-by-mode] text');
    expect(q('[data-testid=stats-by-mode]')?.textContent).toContain('Vídeo');
    expect(q('[data-testid=stats-by-mode]')?.textContent).toContain('Música');
    expect(bars.length).toBeGreaterThan(0);
    const slow = q('[data-testid=stats-slowest]')!.textContent!;
    expect(slow).toContain('Tipo');
    expect(slow).toContain('Vídeo');
    expect(slow).toContain('Música');
  });

  it('asks only for one kind of project when the type is picked', async () => {
    await open();
    (q('[data-testid=stats-mode-music] button') as HTMLButtonElement).click();
    const req = statsReq();
    expect(req.request.params.get('mode')).toBe('music');
    req.flush(STATS);
    await settle();
    (q('[data-testid=stats-mode-all] button') as HTMLButtonElement).click();
    const again = statsReq();
    expect(again.request.params.has('mode')).toBe(false);
    again.flush(STATS);
    await settle();
  });
});
