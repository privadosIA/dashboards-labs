import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MotionPage } from '../../core/api.models';
import { Timeline } from './motion-timeline';
import { MotionTimelineDialogComponent, TimelineSession } from './motion-timeline-dialog.component';

const TL: Timeline = { version: 1, tracks: [{ id: 'title', target: 'h1', start: 0.5, duration: 1, ease: 'out', from: { opacity: 0 }, to: { opacity: 1 } }] };
const PAGE: MotionPage = {
  scene: 'gfx', overlay: false, exists: true, html: '<html></html>', preview: '<html><head></head><body><h1>x</h1></body></html>', duration: 6,
};

describe('MotionTimelineDialogComponent', () => {
  let fixture: ComponentFixture<MotionTimelineDialogComponent>;
  let page: ReturnType<typeof signal<MotionPage | null>>;
  let time: ReturnType<typeof signal<number>>;
  let dirty: ReturnType<typeof signal<boolean>>;
  let working: ReturnType<typeof signal<string | null>>;
  let closed: number;
  let calls: string[];
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function open(): Promise<void> {
    page = signal<MotionPage | null>(PAGE);
    time = signal(0);
    dirty = signal(false);
    working = signal<string | null>(null);
    closed = 0;
    calls = [];
    const session: TimelineSession = {
      page, time, playing: signal(false), busy: signal(''), timeline: signal<Timeline | null>(TL), workingHtml: working, dirty,
      toggle: () => calls.push('toggle'), changed: () => calls.push('changed'), save: async () => void calls.push('save'),
    };
    TestBed.configureTestingModule({
      imports: [MotionTimelineDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: session },
        { provide: MatDialogRef, useValue: { close: () => closed++, addPanelClass: () => undefined, removePanelClass: () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(MotionTimelineDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the preview, its player and the timeline panel of the page', async () => {
    await open();
    expect(q('[data-testid=timeline-window-frame]')).toBeTruthy();
    expect(q('[data-testid=timeline-window-play]')).toBeTruthy();
    expect(q('[data-testid=motion-timeline]')).toBeTruthy();
    expect(q('[data-testid=timeline-track-title]')).toBeTruthy();
    expect(text()).toContain('0.00 / 6.0 s');
  });

  it('has the bar and the grips of a window: move, maximize, close and eight edges', async () => {
    await open();
    expect(q('[data-testid=timeline-window-handle]')).toBeTruthy();
    expect(q('[data-testid=timeline-window-maximize]')).toBeTruthy();
    expect(q('[data-testid=timeline-window-close]')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-edge]')).toHaveLength(8);
    (q('[data-testid=timeline-window-maximize]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-edge]')).toHaveLength(0); // maximized: no grips
    expect(q('[data-testid=timeline-window-maximize]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('tells the preview in its frame the time and the edited timeline', async () => {
    await open();
    const frame = q('[data-testid=timeline-window-frame]') as HTMLIFrameElement;
    const posted: { type: string; t?: number }[] = [];
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (m: { type: string; t?: number }) => posted.push(m) }, configurable: true });
    time.set(2.5);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(posted).toContainEqual({ type: 'seek', t: 2.5 });
    working.set('<html><script type="application/json" id="motion-timeline">{"version":1,"tracks":[{"id":"title","target":"h1","start":1,"duration":1,"from":{"opacity":0},"to":{"opacity":1}}]}</script></html>');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(posted.some((m) => m.type === 'timeline')).toBe(true);
  });

  it('offers to save only when there are unsaved changes, and saves through the editor', async () => {
    await open();
    expect(q('[data-testid=timeline-window-save]')).toBeNull();
    dirty.set(true);
    fixture.detectChanges();
    (q('[data-testid=timeline-window-save]') as HTMLButtonElement).click();
    expect(calls).toContain('save');
  });

  it('the play button and the time slider belong to the editor', async () => {
    await open();
    (q('[data-testid=timeline-window-play]') as HTMLButtonElement).click();
    expect(calls).toEqual(['toggle']);
  });

  it('closes by itself when the page goes away', async () => {
    await open();
    page.set({ ...PAGE, exists: false });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(closed).toBeGreaterThan(0);
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }
});
