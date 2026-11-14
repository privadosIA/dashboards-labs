import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { AvailabilityResponse, EnvironmentReport, MotionPage, ProjectConfig } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { EditorStore } from '../editor.store';
import { MotionPageComponent } from './motion-page.component';
import { MotionTimelineDialogComponent, TimelineSession } from './motion-timeline-dialog.component';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'gfx', prompt: '', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 3, motion_graphic: 'three bullets' }],
};

const PAGE: MotionPage = {
  scene: 'gfx',
  overlay: false,
  exists: true,
  html: '<html><body>x</body></html>',
  preview: '<html><head></head><body>x</body></html>',
  duration: 4.5,
  origin: 'generated',
  summary: 'motion graphic · page written by writer:7b · Chrome 126.0.1',
  model: 'writer:7b',
  browser: '126.0.1',
};

function report(chrome: boolean): EnvironmentReport {
  return {
    binaries: [{ name: 'chrome', required: false, present: chrome, version: chrome ? '126.0.1' : undefined, fix: chrome ? undefined : 'install Google Chrome or Chromium, or set its path in Settings' }],
    models: [], voices: [], loras: [], music: [], music_adapters: [], gpus: [],
    ollama: { host: 'http://127.0.0.1:11434', source: 'default', remote: false },
    tokens: { huggingface: false, civitai: false }, token_sources: {},
  } as unknown as EnvironmentReport;
}

describe('MotionPageComponent', () => {
  let http: HttpTestingController;
  let store: EditorStore;
  let fixture: ComponentFixture<MotionPageComponent>;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the component, answers what it asks for and settles. */
  async function open(opts: { page?: MotionPage | null; chrome?: boolean; avail?: AvailabilityResponse; described?: boolean; overlay?: boolean } = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [MotionPageComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EditorStore);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
    await loading;
    fixture = TestBed.createComponent(MotionPageComponent);
    fixture.componentRef.setInput('sceneId', 'gfx');
    fixture.componentRef.setInput('overlay', opts.overlay ?? false);
    fixture.componentRef.setInput('described', opts.described ?? true);
    fixture.detectChanges();
    http.match((r) => r.url.startsWith('/api/environment')).forEach((r) => r.flush(report(opts.chrome ?? true)));
    http.match((r) => r.url === '/api/models/availability').forEach((r) => r.flush(opts.avail ?? ALL_AVAILABLE));
    const get = http.expectOne((r) => r.method === 'GET' && r.url === '/api/projects/demo/scenes/gfx/motion');
    if (opts.page === null) get.flush({ error: { message: 'x' } }, { status: 404, statusText: 'Not Found' });
    else get.flush(opts.page ?? PAGE);
    await settle();
  }

  afterEach(() => http.verify());

  it('shows the stored page in a sandboxed frame with how it was made', async () => {
    await open();
    const frame = q('[data-testid=motion-frame]') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(q('[data-testid=motion-summary]')?.textContent).toContain('writer:7b');
  });

  it('a page that does not exist yet says it is written on the run and offers to write it now', async () => {
    await open({ page: { ...PAGE, exists: false, html: '', preview: undefined } });
    expect(q('[data-testid=motion-frame]')).toBeNull();
    expect(q('[data-testid=motion-empty]')).toBeTruthy();
    const gen = q('[data-testid=motion-generate]') as HTMLButtonElement;
    expect(gen.disabled).toBe(false);
    expect(gen.textContent).toContain('Escribir la página');
  });

  it('moving the slider tells the frame the second to draw', async () => {
    await open();
    const win = (q('[data-testid=motion-frame]') as HTMLIFrameElement).contentWindow!;
    const spy = vi.spyOn(win, 'postMessage');
    (fixture.componentInstance as unknown as { setTime(t: number): void }).setTime(2.25);
    fixture.detectChanges();
    await settle();
    expect(spy).toHaveBeenCalledWith({ type: 'seek', t: 2.25 }, '*');
    expect(text()).toContain('2.25 / 4.5 s');
  });

  it('asking for a new page replaces the shown one', async () => {
    await open();
    (q('[data-testid=motion-generate]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/projects/demo/scenes/gfx/motion/generate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ overlay: false });
    req.flush({ ...PAGE, summary: 'motion graphic · page written by other:1b', model: 'other:1b' });
    await settle();
    expect(q('[data-testid=motion-summary]')?.textContent).toContain('other:1b');
  });

  it('a refused generation shows the server\'s reason', async () => {
    await open();
    (q('[data-testid=motion-generate]') as HTMLButtonElement).click();
    http.expectOne('/api/projects/demo/scenes/gfx/motion/generate').flush({ error: { code: 'invalid', message: 'the model could not write a working page after 3 attempts' } }, { status: 422, statusText: 'Unprocessable' });
    await settle();
    expect(q('[data-testid=motion-error]')?.textContent).toContain('after 3 attempts');
  });

  it('editing shows the source and saves it by hand', async () => {
    await open();
    (q('[data-testid=motion-edit]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const area = q('[data-testid=motion-source]') as HTMLTextAreaElement;
    expect(area.value).toBe(PAGE.html);
    area.value = '<html><body>mine</body></html>';
    area.dispatchEvent(new Event('input'));
    (q('[data-testid=motion-save]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/projects/demo/scenes/gfx/motion');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ html: '<html><body>mine</body></html>', overlay: false });
    req.flush({ ...PAGE, origin: 'supplied', summary: 'motion graphic · page written by hand' });
    await settle();
    expect(q('[data-testid=motion-source]')).toBeNull();
    expect(q('[data-testid=motion-summary]')?.textContent).toContain('by hand');
  });

  describe('the timeline of the page', () => {
    const BLOCK = '{"version":1,"tracks":[{"id":"title","target":"h1","start":0.5,"duration":1,"ease":"out","from":{"opacity":0},"to":{"opacity":1}}]}';
    const WITH = `<html><body><h1>x</h1><script type="application/json" id="motion-timeline">${BLOCK}</script></body></html>`;
    const withTimeline: MotionPage = { ...PAGE, html: WITH, preview: `<html><head></head><body><h1>x</h1></body></html>`, duration: 3 };
    const longTimeline: MotionPage = { ...withTimeline, duration: 6 };

    it('shows the panel with its tracks when the page declares one', async () => {
      await open({ page: withTimeline });
      expect(q('[data-testid=motion-timeline]')).toBeTruthy();
      expect(q('[data-testid=timeline-track-title]')).toBeTruthy();
      expect(q('[data-testid=motion-no-timeline]')).toBeNull();
      expect(q('[data-testid=timeline-save]')).toBeNull(); // nothing to save yet
    });

    it('a clip of more than 4 s edits its timeline in a window: a button instead of the panel', async () => {
      await open({ page: longTimeline });
      expect(q('[data-testid=motion-timeline]')).toBeNull();
      expect(q('[data-testid=timeline-long]')).toBeTruthy();
      expect(q('[data-testid=timeline-open]')).toBeTruthy();
    });

    it('a clip of exactly 4 s keeps the panel inline and has no window button', async () => {
      await open({ page: { ...withTimeline, duration: 4 } });
      expect(q('[data-testid=motion-timeline]')).toBeTruthy();
      expect(q('[data-testid=timeline-open]')).toBeNull();
    });

    it('opening the window shares the page: edits made there are kept and saved from the editor', async () => {
      await open({ page: longTimeline });
      const dialog = TestBed.inject(MatDialog);
      const opened = vi.spyOn(dialog, 'open').mockReturnValue({ close: () => undefined } as never);
      (q('[data-testid=timeline-open]') as HTMLButtonElement).click();
      const [component, config] = opened.mock.calls[0] as unknown as [unknown, { data: TimelineSession; panelClass: string }];
      expect(component).toBe(MotionTimelineDialogComponent);
      expect(config.panelClass).toBe('mo-resizable-dialog');
      const session = config.data;
      expect(session.page()?.duration).toBe(6);
      expect(session.timeline()?.tracks[0].id).toBe('title');
      expect(session.dirty()).toBe(false);
      const tl = structuredClone(session.timeline()!);
      tl.tracks[0].start = 2;
      session.changed(tl);
      await settle();
      expect(session.dirty()).toBe(true);
      expect(q('[data-testid=timeline-save]')).toBeTruthy(); // the editor offers to save too
      void session.save();
      const req = http.expectOne('/api/projects/demo/scenes/gfx/motion');
      expect((req.request.body as { html: string }).html).toContain('"start":2');
      req.flush({ ...longTimeline, html: (req.request.body as { html: string }).html });
      await settle();
      expect(session.dirty()).toBe(false);
    });

    it('the buttons share one row', async () => {
      await open({ page: withTimeline });
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.actions');
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.querySelector('[data-testid=motion-edit]')).toBeTruthy();
      expect(row.querySelector('[data-testid=motion-generate]')).toBeTruthy();
    });

    it('says that a page that animates with CSS has no tracks to edit', async () => {
      await open();
      expect(q('[data-testid=motion-timeline]')).toBeNull();
      expect(q('[data-testid=motion-no-timeline]')?.textContent).toContain('CSS');
    });

    it('says when the block cannot be read', async () => {
      await open({ page: { ...PAGE, html: '<html><body><script type="application/json" id="motion-timeline">{"version":1,"tracks":[</script></body></html>' } });
      expect(q('[data-testid=motion-timeline]')).toBeNull();
      expect(q('[data-testid=motion-bad-timeline]')).toBeTruthy();
    });

    it('an edit shows in the preview at once, offers to save, and saving stores the page with the new block', async () => {
      await open({ page: withTimeline });
      const frame = q('[data-testid=motion-frame]') as HTMLIFrameElement;
      const posted: unknown[] = [];
      Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (m: unknown) => posted.push(m) }, configurable: true });
      const start = q('[data-testid=timeline-start-title]') as HTMLInputElement;
      start.value = '1.5';
      start.dispatchEvent(new Event('change'));
      await settle();
      expect(posted).toContainEqual(expect.objectContaining({ type: 'timeline' }));
      const msg = posted.find((m) => (m as { type: string }).type === 'timeline') as { data: { tracks: { start: number }[] } };
      expect(msg.data.tracks[0].start).toBe(1.5);
      expect(q('[data-testid=timeline-unsaved]')).toBeTruthy();
      (q('[data-testid=timeline-save]') as HTMLButtonElement).click();
      const req = http.expectOne('/api/projects/demo/scenes/gfx/motion');
      expect(req.request.method).toBe('PUT');
      const html = (req.request.body as { html: string }).html;
      expect(html).toContain('"start":1.5');
      expect(html).toContain('<h1>x</h1>'); // the rest of the page is untouched
      req.flush({ ...withTimeline, html, origin: 'edited', summary: 'motion graphic · then edited' });
      await settle();
      expect(q('[data-testid=timeline-unsaved]')).toBeNull();
      expect(q('[data-testid=motion-summary]')?.textContent).toContain('edited');
    });

    it('works without the model: the panel and saving do not ask for it', async () => {
      await open({ page: withTimeline, avail: missing('motion_graphics', 'no_models') });
      expect(q('[data-testid=motion-generate]')).toBeNull();
      expect(q('[data-testid=motion-timeline]')).toBeTruthy();
      const ease = q('[data-testid=timeline-ease-title]') as HTMLSelectElement;
      ease.value = 'linear';
      ease.dispatchEvent(new Event('change'));
      await settle();
      expect(q('[data-testid=timeline-save]')).toBeTruthy();
    });

    it('editing the code by hand starts from the page with the timeline edits', async () => {
      await open({ page: withTimeline });
      const ease = q('[data-testid=timeline-ease-title]') as HTMLSelectElement;
      ease.value = 'linear';
      ease.dispatchEvent(new Event('change'));
      await settle();
      (q('[data-testid=motion-edit]') as HTMLButtonElement).click();
      await settle();
      expect((q('[data-testid=motion-source]') as HTMLTextAreaElement).value).toContain('"ease":"linear"');
    });
  });

  it('the overlay asks for its own page', async () => {
    TestBed.configureTestingModule({ imports: [MotionPageComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(EditorStore);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
    await loading;
    fixture = TestBed.createComponent(MotionPageComponent);
    fixture.componentRef.setInput('sceneId', 'gfx');
    fixture.componentRef.setInput('overlay', true);
    fixture.detectChanges();
    http.match((r) => r.url.startsWith('/api/environment')).forEach((r) => r.flush(report(true)));
    http.match((r) => r.url === '/api/models/availability').forEach((r) => r.flush(ALL_AVAILABLE));
    http.expectOne('/api/projects/demo/scenes/gfx/motion?overlay=1').flush({ ...PAGE, overlay: true });
    await settle();
  });

  describe('the controls are disabled with the reason', () => {
    const reason = () => q('[data-testid=motion-blocked]')?.textContent ?? '';
    const generate = () => q('[data-testid=motion-generate]') as HTMLButtonElement;

    it('no browser', async () => {
      await open({ chrome: false });
      expect(generate().disabled).toBe(true);
      expect(reason()).toContain('Chrome');
      expect(reason()).toContain('Settings');
    });

    it('no model: the button is hidden, not disabled, and the page stays', async () => {
      await open({ avail: missing('motion_graphics', 'no_models') });
      expect(generate()).toBeNull();
      expect(q('[data-testid=model-notice]')?.textContent).toContain('ollama pull gemma4:26b');
      expect(q('[data-testid=motion-frame]')).toBeTruthy(); // the stored page still plays
      expect(q('[data-testid=motion-edit]')).toBeTruthy(); // and can be edited by hand
    });

    it('no model and no page yet: says so', async () => {
      await open({ avail: missing('motion_graphics', 'no_models'), page: { ...PAGE, exists: false, html: '', preview: '' } });
      expect(generate()).toBeNull();
      expect(q('[data-testid=motion-no-model]')).toBeTruthy();
    });

    it('the model cannot be reached: nothing is shown in its place', async () => {
      await open({ avail: missing('motion_graphics', 'unreachable') });
      expect(generate()).toBeNull();
      expect(q('[data-testid=model-notice]')).toBeNull();
    });

    it('nothing described yet', async () => {
      await open({ described: false });
      expect(generate().disabled).toBe(true);
      expect(reason()).toContain('descripción');
    });

    it('unsaved changes', async () => {
      await open();
      store.updateScene(0, { motion_graphic: 'something else' });
      fixture.detectChanges();
      expect(generate().disabled).toBe(true);
      expect(reason()).toContain('Guarda el proyecto');
    });
  });
});
