import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { PipelineEvent, Run } from '../../core/api.models';
import { RunStreamService } from '../../core/run-stream.service';
import { RunMonitorComponent } from './run-monitor.component';

class FakeES {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  closed = false;
  addEventListener(t: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(t, fn);
  }
  close(): void {
    this.closed = true;
  }
  feed(lines: string[]): void {
    this.onopen?.({});
    for (const l of lines) this.onmessage?.({ data: l } as MessageEvent<string>);
  }
  end(statePayload: string): void {
    this.listeners.get('run-state')?.({ data: statePayload } as MessageEvent<string>);
    this.listeners.get('stream-end')?.({ data: '{}' } as MessageEvent<string>);
  }
}

const RUN: Run = {
  id: 'run-1',
  project: 'demo',
  state: 'running',
  gpu: '1',
  keep_tmp: true,
  force: false,
  vram_warn_mb: 2048,
  created_at: '2026-10-09T10:00:00Z',
  started_at: '2026-10-09T10:00:01Z',
};

const EMPTY_RESOURCES = {
  interval_ms: 2000,
  truncated: false,
  gpus: [],
  ram: { total_mb: 0, samples: [] },
  peaks: { vram: [], ram: null },
};

const EVENTS: PipelineEvent[] = [
  { timestamp: '2026-10-09T10:00:01Z', type: 'pipeline_start' },
  { timestamp: 't', type: 'phase_start', scene_id: 'intro', phase: 'tts' },
  { timestamp: 't', type: 'phase_end', scene_id: 'intro', phase: 'tts', duration_ms: 2220 },
];

describe('RunMonitorComponent', () => {
  let es: FakeES;
  let http: HttpTestingController;
  let dialogResult = true;

  async function create(run: Run = RUN, projects: object[] = []): Promise<ComponentFixture<RunMonitorComponent>> {
    await TestBed.configureTestingModule({
      imports: [RunMonitorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    const svc = TestBed.inject(RunStreamService);
    svc.esFactory = () => {
      es = new FakeES();
      return es;
    };
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RunMonitorComponent);
    fixture.componentRef.setInput('id', run.id);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush(projects);
    http.expectOne(`/api/runs/${run.id}`).flush({ run });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  /** The resources section asks for the run's samples whenever its state changes. */
  const answerResources = (body: object = EMPTY_RESOURCES) =>
    http.match((r) => r.url.endsWith('/resources')).forEach((r) => r.flush(body));

  afterEach(() => {
    answerResources();
    http.verify();
  });

  it('renders live phase states from the stream, per scene and phase', async () => {
    const fixture = await create();
    es.feed(EVENTS.map((e) => JSON.stringify(e)));
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const done = el.querySelector('.seg--done');
    expect(done).not.toBeNull();
    expect(done!.textContent).toContain('0:02'); // 2220 ms
    expect(el.textContent).toContain('intro');
    // The raw log carries the verbatim lines.
    expect(el.textContent).toContain('Log de eventos');
  });

  it('cancel asks for confirmation and calls the API; stream-end stops the stream', async () => {
    const fixture = await create();
    es.feed(EVENTS.map((e) => JSON.stringify(e)));
    fixture.detectChanges();

    dialogResult = true;
    const cancelBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Cancelar run'))!;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne({ method: 'POST', url: '/api/runs/run-1/cancel' })
      .flush({ run: { ...RUN, state: 'cancelled' } });
    await fixture.whenStable();

    es.end('{"id":"run-1","state":"cancelled"}');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(es.closed).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('cancelled');
  });

  it('replays a finished run through the same renderer with the final artifact', async () => {
    const finished: Run = { ...RUN, state: 'succeeded', artifact: 'out/demo.mp4' };
    const fixture = await create(finished);
    const all = [
      ...EVENTS,
      { timestamp: 't', type: 'skipped', scene_id: 'intro', phase: 'render' },
      { timestamp: 't', type: 'phase_end', scene_id: '_global', phase: 'concat', duration_ms: 5, artifact: 'out/demo.mp4' },
      { timestamp: 't', type: 'pipeline_end', artifact: 'out/demo.mp4', duration_ms: 9000 },
    ];
    es.feed(all.map((e) => JSON.stringify(e)));
    es.end('{"id":"run-1","state":"succeeded","artifact":"out/demo.mp4"}');
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.seg--cache')).not.toBeNull();
    // Final artifact: player + download link against the artifact endpoint.
    const link = el.querySelector('a[download]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/projects/demo/artifacts/out/demo.mp4');
    expect(el.querySelector('video')).not.toBeNull();
    // Total duration replaces the ticking clock.
    expect(el.querySelector('.elapsed')!.textContent).toContain('0:09');
  });

  it('images-mode run: offers the gallery of the project, not the manifest download', async () => {
    const fixture = await create({ ...RUN, state: 'succeeded', artifact: 'out/demo/manifest.json' });
    es.feed([
      JSON.stringify(EVENTS[0]),
      JSON.stringify({ timestamp: 't', type: 'pipeline_end', artifact: 'out/demo/manifest.json', duration_ms: 500 }),
    ]);
    es.end('{"id":"run-1","state":"succeeded","artifact":"out/demo/manifest.json"}');
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const gallery = el.querySelector('[data-testid="open-gallery"]') as HTMLAnchorElement;
    expect(gallery).not.toBeNull();
    expect(gallery.getAttribute('href')).toBe('/gallery?project=demo');
    expect(el.querySelector('a[download]')).toBeNull();
    expect(el.querySelector('video')).toBeNull();
  });

  it('music run: offers the studio of the project, not the gallery, and shows compose and synth', async () => {
    const fixture = await create(
      { ...RUN, state: 'succeeded', artifact: 'out/demo/manifest.json' },
      [{ id: 'demo', name: 'demo', mode: 'music', scene_count: 0, track_count: 1 }],
    );
    const musicEvents = [
      { timestamp: 't', type: 'phase_start', scene_id: 'ballad', phase: 'compose' },
      { timestamp: 't', type: 'phase_end', scene_id: 'ballad', phase: 'compose', duration_ms: 2000 },
      { timestamp: 't', type: 'phase_start', scene_id: 'ballad', phase: 'synth' },
      { timestamp: 't', type: 'pipeline_end', artifact: 'out/demo/manifest.json', duration_ms: 500 },
    ];
    es.feed(musicEvents.map((e) => JSON.stringify(e)));
    es.end('{"id":"run-1","state":"succeeded","artifact":"out/demo/manifest.json"}');
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('[data-testid="open-music"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/projects/demo/music');
    expect(el.querySelector('[data-testid="open-gallery"]')).toBeNull();
    const heads = Array.from(el.querySelectorAll('.strip__phase')).map((p) => p.textContent?.trim());
    expect(heads).toEqual(['compose', 'synth', 'export']);
  });

  it('shows no result section for a run that failed', async () => {
    const fixture = await create({ ...RUN, state: 'failed' });
    es.feed(EVENTS.map((e) => JSON.stringify(e)));
    es.end('{"id":"run-1","state":"failed","error":"boom"}');
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.result')).toBeNull();
  });

  it('explains that a run deleted from the history is gone, with a way back', async () => {
    await TestBed.configureTestingModule({
      imports: [RunMonitorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const svc = TestBed.inject(RunStreamService);
    svc.esFactory = () => {
      es = new FakeES();
      return es;
    };
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RunMonitorComponent);
    fixture.componentRef.setInput('id', 'run-deleted');
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([]);
    http
      .expectOne('/api/runs/run-deleted')
      .flush({ error: { code: 'not_found', message: 'run run-deleted not found' } }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=run-gone]')?.textContent).toContain('ya no está en el historial');
    expect(el.querySelector('[data-testid=back-to-runs]')?.getAttribute('href')).toBe('/runs');
    expect(el.querySelector('app-phase-strip')).toBeNull();
    expect(es.closed).toBe(true);
  });

  it('opens with the page header: the project as its title, the run id, the state and the cancel action', async () => {
    const fixture = await create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('demo');
    expect(el.querySelector('[data-testid=page-desc]')?.textContent).toBe('run-1');
    expect(el.querySelector('[data-testid=page-actions] [data-testid=run-state]')?.textContent?.trim()).toBe('running');
    expect(el.querySelector('[data-testid=page-actions] button.danger')?.textContent).toContain('Cancelar run');
  });
});
