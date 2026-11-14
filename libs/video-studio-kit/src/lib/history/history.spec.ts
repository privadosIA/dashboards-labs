import { TestBed } from '@angular/core/testing';
import { TicketService } from '@lab/server-connection';

import { stubStorage } from '../../testing/memory-storage';
import type { VideoEdit } from '../video-edit/model';
import { DEFAULT_SETTINGS, type Generation } from '../video/model';
import { History } from './history';

const done: Generation = { id: 'g1', settings: DEFAULT_SETTINGS, state: 'done', progress: 100, videoUrl: 'http://host:4666/api/projects/api-gen-1/artifacts/v.mp4' };

function link(withTicket: (url: string) => string): HTMLAnchorElement {
  stubStorage({ 'video-studio.lang': 'en' });
  TestBed.configureTestingModule({ providers: [{ provide: TicketService, useValue: { withTicket } }] });
  const fixture = TestBed.createComponent(History);
  fixture.componentRef.setInput('generations', [done]);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[download]')!;
}

describe('History and the access token', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the ticket in the download link when there is one', () => {
    expect(link((url) => `${url}?ticket=t1`).getAttribute('href')).toBe(`${done.videoUrl}?ticket=t1`);
  });

  it('leaves the link as the server gave it when there is no token', () => {
    expect(link((url) => url).getAttribute('href')).toBe(done.videoUrl);
  });
});

describe('History cards', () => {
  afterEach(() => vi.unstubAllGlobals());

  function draw(generations: Generation[]): HTMLElement {
    stubStorage({ 'video-studio.lang': 'en' });
    TestBed.configureTestingModule({ providers: [{ provide: TicketService, useValue: { withTicket: (u: string) => u } }] });
    const fixture = TestBed.createComponent(History);
    fixture.componentRef.setInput('generations', generations);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const styles = () => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');

  it('shows the model, the duration, the aspect ratio and the quality as pills under the prompt', () => {
    const el = draw([done]);
    expect([...el.querySelectorAll('li .pills .pill')].map((p) => p.textContent?.trim())).toEqual([DEFAULT_SETTINGS.model, '5 s', DEFAULT_SETTINGS.aspectRatio, DEFAULT_SETTINGS.quality]);
    expect(el.querySelector('li .prompt')).toBeTruthy();
  });

  it('has a stripe at the start of the card for its state, as the pill and the card are rounded', () => {
    draw([done]);
    expect(styles()).toMatch(/border-inline-start:\s*2px solid/);
    expect(styles()).toMatch(/data-state=.?running.?[^{]*\{[^}]*border-inline-start-color:\s*var\(--lab-accent\)/);
    expect(styles()).toMatch(/data-state=.?done.?[^{]*\{[^}]*border-inline-start-color:\s*var\(--lab-success\)/);
    expect(styles()).toMatch(/data-state=.?failed.?[^{]*\{[^}]*border-inline-start-color:\s*var\(--lab-danger\)/);
    expect(styles()).toMatch(/\.pill[^{]*\{[^}]*var\(--lab-radius-pill\)/);
    expect(styles()).toMatch(/li[^{]*\{[^}]*var\(--lab-radius-panel\)/);
  });

  it('has its actions at least as tall as the control token', () => {
    draw([done]);
    expect(styles()).toMatch(/\.actions[^{]*button[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
  });

  it('says it is empty in a dashed frame', () => {
    const el = draw([]);
    expect(el.querySelector('.empty')).toBeTruthy();
    expect(styles()).toMatch(/\.empty[^{]*\{[^}]*dashed/);
  });

  it('shows the inputs of a generation under its settings, and the name of its first input when it has no prompt', () => {
    const el = draw([{ ...done, settings: { ...DEFAULT_SETTINGS, prompt: '' }, inputs: [{ kind: 'reference_image', name: 'ref.png', url: 'http://s/ref.png' }] }]);
    expect(el.querySelector('li .prompt')?.textContent?.trim()).toBe('ref.png');
    expect(el.querySelectorAll('li [data-testid=inputs-list] li')).toHaveLength(1);
  });
});

describe('History cards of video edits', () => {
  afterEach(() => vi.unstubAllGlobals());

  const edit = (over: Partial<VideoEdit> = {}): VideoEdit => ({ id: 'e1', tool: 'scale', settings: { factor: 2 }, state: 'running', progress: 40, createdAt: '2026-11-07T10:00:00Z', ...over });
  const result = (over: Partial<NonNullable<VideoEdit['result']>> = {}): NonNullable<VideoEdit['result']> => ({ video: 'http://host/api/v/e1.mp4', format: 'mp4', hasAudio: true, width: 1280, height: 720, notes: [], ...over });

  function draw(edits: VideoEdit[], generations: Generation[] = []): HTMLElement {
    stubStorage({ 'video-studio.lang': 'en' });
    TestBed.configureTestingModule({ providers: [{ provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=t1` } }] });
    const fixture = TestBed.createComponent(History);
    fixture.componentRef.setInput('generations', generations);
    fixture.componentRef.setInput('edits', edits);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const buttons = (el: HTMLElement) => [...el.querySelectorAll('li .actions button, li .actions a')].map((b) => b.textContent?.trim());

  it('shows the tool, the settings and the progress of an edit that runs', () => {
    const el = draw([edit()]);
    expect(el.querySelector('li .name')?.textContent).toBe('Scale');
    expect(el.querySelector('li .state')?.textContent).toBe('Editing');
    expect([...el.querySelectorAll('li .pill')].map((p) => p.textContent?.trim())).toEqual(['factor: 2']);
    expect(el.querySelector('progress')?.value).toBe(40);
    expect(el.querySelector('li')?.getAttribute('data-state')).toBe('running');
  });

  it('offers to view, download and delete a finished edit, and says whether it has sound', () => {
    const el = draw([edit({ state: 'done', progress: 100, result: result() })]);
    expect(buttons(el)).toEqual(['View', 'Download', 'Delete']);
    expect(el.querySelector<HTMLAnchorElement>('a[download]')?.getAttribute('href')).toBe('http://host/api/v/e1.mp4?ticket=t1');
    expect(el.querySelector('[data-testid=sound]')?.textContent).toBe('With sound');
    TestBed.resetTestingModule();
    const silent = draw([edit({ id: 'e2', tool: 'extend', state: 'done', progress: 100, result: result({ hasAudio: false }) })]);
    expect(silent.querySelector('[data-testid=sound]')?.textContent).toBe('No sound');
  });

  it('shows the server\'s notes of a finished edit', () => {
    const el = draw([edit({ state: 'done', progress: 100, result: result({ notes: ['the fallback filter was used'] }) })]);
    expect(el.querySelector('.notes li')?.textContent).toBe('the fallback filter was used');
  });

  it('says an extended video was extended, and that a result with alpha is a WebM', () => {
    const el = draw([edit({ tool: 'extend', state: 'done', progress: 100, result: result({ extendedTimes: 2, format: 'webm' }) })]);
    expect(el.querySelector('[data-testid=extended]')?.textContent).toBe('Extended ×2');
    expect([...el.querySelectorAll('.pill')].map((p) => p.textContent?.trim())).toContain('WebM');
  });

  it('shows the error of a failed edit and offers only to delete it', () => {
    const el = draw([edit({ state: 'failed', error: 'the model ran out of memory' })]);
    expect(el.querySelector('.error')?.textContent).toContain('ran out of memory');
    expect(buttons(el)).toEqual(['Delete']);
  });

  it('does not offer to repeat an edit', () => {
    expect(buttons(draw([edit({ state: 'done', progress: 100, result: result() })]))).not.toContain('Repeat');
  });

  it('puts edits among the generations by the time they were asked for', () => {
    const generation: Generation = { ...done, createdAt: '2026-11-07T10:01:00Z' };
    const el = draw([edit({ createdAt: '2026-11-07T10:02:00Z' }), edit({ id: 'e0', createdAt: '2026-11-07T10:00:00Z' })], [generation]);
    expect([...el.querySelectorAll('li')].map((li) => li.querySelector('.name, .prompt')?.tagName)).toHaveLength(3);
    expect([...el.querySelectorAll('li')].map((li) => (li.querySelector('app-edit-card') ? 'edit' : 'generation'))).toEqual(['edit', 'generation', 'edit']);
  });

  it('is not empty when there are only edits', () => {
    expect(draw([edit()]).querySelector('.empty')).toBeNull();
  });

describe('History pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows ten items a page, in order, and the page after the first has the next ten', () => {
    sessionStorage.clear();
    stubStorage({ 'video-studio.lang': 'en' });
    TestBed.configureTestingModule({ providers: [{ provide: TicketService, useValue: { withTicket: (u: string) => u } }] });
    const fixture = TestBed.createComponent(History);
    const generations = Array.from({ length: 40 }, (_, i) => ({ ...done, id: `g${i}`, createdAt: 1000 - i, settings: { ...DEFAULT_SETTINGS, prompt: `prompt ${i}` } }));
    fixture.componentRef.setInput('generations', generations);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const prompts = () => [...el.querySelectorAll('li .prompt')].map((p) => p.textContent?.trim());
    expect(prompts()).toEqual(Array.from({ length: 10 }, (_, i) => `prompt ${i}`));
    el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();
    expect(prompts()).toEqual(Array.from({ length: 10 }, (_, i) => `prompt ${i + 10}`));
  });
});
});
