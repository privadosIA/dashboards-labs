import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Timeline } from './motion-timeline';
import { MotionTimelinePanelComponent } from './motion-timeline-panel.component';

const TL: Timeline = {
  version: 1,
  tracks: [
    { id: 'title', label: 'Título', target: 'h1', start: 0.5, duration: 1, ease: 'out', from: { opacity: 0, y: 30 }, to: { opacity: 1, y: 0 } },
    { id: 'items', target: 'li', start: 1, duration: 0.5, stagger: 0.2, from: { opacity: 0 }, to: { opacity: 1 } },
  ],
};

describe('MotionTimelinePanelComponent', () => {
  let fixture: ComponentFixture<MotionTimelinePanelComponent>;
  let emitted: Timeline[];
  let sought: number[];
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);
  const input = (id: string) => q(`[data-testid=${id}]`) as HTMLInputElement;

  async function open(tl: Timeline = TL, duration = 4): Promise<void> {
    TestBed.configureTestingModule({ imports: [MotionTimelinePanelComponent] });
    fixture = TestBed.createComponent(MotionTimelinePanelComponent);
    fixture.componentRef.setInput('timeline', tl);
    fixture.componentRef.setInput('duration', duration);
    fixture.componentRef.setInput('time', 0);
    emitted = [];
    sought = [];
    fixture.componentInstance.changed.subscribe((t) => emitted.push(t));
    fixture.componentInstance.seekTo.subscribe((t) => sought.push(t));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The axis is 400 px wide in the test, so one pixel is 0.01 s of a 4 s clip. */
  function pointer(type: string, el: Element, clientX: number): void {
    el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientX, pointerId: 1 }));
  }
  function wide(): void {
    for (const axis of Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.axis'))) {
      (axis as HTMLElement).getBoundingClientRect = () => ({ left: 0, width: 400, right: 400, top: 0, bottom: 20, height: 20, x: 0, y: 0, toJSON: () => ({}) });
    }
  }

  it('shows a row and a bar per track, placed over the time axis', async () => {
    await open();
    expect(q('[data-testid=timeline-track-title]')).toBeTruthy();
    expect(q('[data-testid=timeline-track-items]')).toBeTruthy();
    const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
    expect(bar.style.left).toBe('12.5%'); // 0.5 s of 4 s
    expect(bar.style.width).toBe('25%'); // 1 s of 4 s
    expect(q('[data-testid=timeline-select-title]')?.textContent).toContain('Título'); // the label, else the id
    expect(q('[data-testid=timeline-select-items]')?.textContent).toContain('items');
  });

  it('puts the playhead where the preview is', async () => {
    await open();
    fixture.componentRef.setInput('time', 2);
    fixture.detectChanges();
    expect((q('[data-testid=timeline-playhead]') as HTMLElement).style.left).toBe('50%');
  });

  it('dragging a bar moves its start in steps of 0.05 s and is one undo step', async () => {
    await open();
    wide();
    const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
    pointer('pointerdown', bar, 100);
    pointer('pointermove', bar, 150); // +50 px = +0.5 s
    pointer('pointermove', bar, 153); // +0.53 s snaps to +0.55
    pointer('pointerup', bar, 153);
    fixture.detectChanges();
    const last = emitted[emitted.length - 1];
    expect(last.tracks[0]).toMatchObject({ start: 1.05, duration: 1 });
    input('timeline-undo');
    (q('[data-testid=timeline-undo]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(emitted[emitted.length - 1].tracks[0].start).toBe(0.5); // the whole drag is one step
  });

  it('dragging the right edge changes the duration and never goes past the clip', async () => {
    await open();
    wide();
    const grip = q('[data-testid=timeline-grip-title]') as HTMLElement;
    pointer('pointerdown', grip, 200);
    pointer('pointermove', grip, 240); // +0.4 s
    expect(emitted[emitted.length - 1].tracks[0]).toMatchObject({ start: 0.5, duration: 1.4 });
    pointer('pointermove', grip, 900); // far beyond the end
    const t = emitted[emitted.length - 1].tracks[0];
    expect(t.start + t.duration).toBeLessThanOrEqual(4.0001);
    pointer('pointerup', grip, 900);
  });

  it('a bar cannot be dragged before 0 or past the end', async () => {
    await open();
    wide();
    const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
    pointer('pointerdown', bar, 100);
    pointer('pointermove', bar, -500);
    expect(emitted[emitted.length - 1].tracks[0].start).toBe(0);
    pointer('pointermove', bar, 900);
    const t = emitted[emitted.length - 1].tracks[0];
    expect(t.start + t.duration).toBeLessThanOrEqual(4.0001);
  });

  it('edits the numbers by field: start, duration, stagger, curve and values', async () => {
    await open();
    const set = (id: string, v: string) => {
      const el = input(id);
      el.value = v;
      el.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    set('timeline-start-title', '1.23');
    expect(emitted[emitted.length - 1].tracks[0].start).toBe(1.25); // snapped
    set('timeline-duration-title', '0.8');
    expect(emitted[emitted.length - 1].tracks[0].duration).toBe(0.8);
    set('timeline-stagger-title', '0.15');
    expect(emitted[emitted.length - 1].tracks[0].stagger).toBe(0.15);
    set('timeline-stagger-title', '0');
    expect(emitted[emitted.length - 1].tracks[0].stagger).toBeUndefined();
    const sel = q('[data-testid=timeline-ease-title]') as HTMLSelectElement;
    sel.value = 'in-out';
    sel.dispatchEvent(new Event('change'));
    expect(emitted[emitted.length - 1].tracks[0].ease).toBe('in-out');
    set('timeline-to-title-opacity', '3');
    expect(emitted[emitted.length - 1].tracks[0].to.opacity).toBe(1); // clamped to its range
    set('timeline-from-title-y', '-20');
    expect(emitted[emitted.length - 1].tracks[0].from.y).toBe(-20);
  });

  it('ignores text that is not a number', async () => {
    await open();
    const el = input('timeline-start-title');
    el.value = '';
    el.dispatchEvent(new Event('change'));
    expect(emitted).toHaveLength(0);
  });

  it('undo and redo walk back and forward through the edits', async () => {
    await open();
    const sel = q('[data-testid=timeline-ease-title]') as HTMLSelectElement;
    sel.value = 'linear';
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect((q('[data-testid=timeline-undo]') as HTMLButtonElement).disabled).toBe(false);
    (q('[data-testid=timeline-undo]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(emitted[emitted.length - 1].tracks[0].ease).toBe('out');
    expect((q('[data-testid=timeline-redo]') as HTMLButtonElement).disabled).toBe(false);
    (q('[data-testid=timeline-redo]') as HTMLButtonElement).click();
    expect(emitted[emitted.length - 1].tracks[0].ease).toBe('linear');
  });

  it('shows the fields of the selected track and clicking the axis asks the preview to go there', async () => {
    await open();
    expect(q('[data-testid=timeline-detail-title]')).toBeTruthy();
    (q('[data-testid=timeline-select-items]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-testid=timeline-detail-items]')).toBeTruthy();
    expect(q('[data-testid=timeline-detail-title]')).toBeNull();
    wide();
    const axis = (q('[data-testid=timeline-track-items]') as HTMLElement).querySelector('.axis') as HTMLElement;
    axis.dispatchEvent(Object.assign(new MouseEvent('click', { bubbles: true, clientX: 200 })));
    expect(sought).toEqual([2]);
  });

  it('the red bar can be dragged: the preview follows the pointer, kept inside the clip', async () => {
    await open();
    wide();
    const head = q('[data-testid=timeline-playhead]') as HTMLElement;
    pointer('pointerdown', head, 100); // 100 px of 400 = 1 s of 4 s
    expect(sought[sought.length - 1]).toBe(1);
    pointer('pointermove', head, 300);
    expect(sought[sought.length - 1]).toBe(3);
    pointer('pointermove', head, 900);
    expect(sought[sought.length - 1]).toBe(4);
    pointer('pointermove', head, -50);
    expect(sought[sought.length - 1]).toBe(0);
    const count = sought.length;
    pointer('pointerup', head, 0);
    pointer('pointermove', head, 200);
    expect(sought).toHaveLength(count); // released: no more movement
    expect(emitted).toHaveLength(0); // scrubbing is not an edit
  });

  describe('from the keyboard', () => {
    function key(el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      el.dispatchEvent(ev);
      fixture.detectChanges();
      return ev;
    }
    const last = () => emitted[emitted.length - 1].tracks[0];

    it('a bar is focusable and the arrows move its start by one step, ten with shift', async () => {
      await open();
      const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
      expect(bar.getAttribute('tabindex')).toBe('0');
      expect(bar.getAttribute('aria-label')).toBe('Título');
      expect(bar.getAttribute('role')).toBe('slider');
      expect(bar.getAttribute('aria-valuenow')).toBe('0.5');
      expect(key(bar, 'ArrowRight').defaultPrevented).toBe(true);
      expect(last()).toMatchObject({ start: 0.55, duration: 1 });
      expect(bar.getAttribute('aria-valuenow')).toBe('0.55');
      key(bar, 'ArrowLeft', { shiftKey: true });
      expect(last().start).toBe(0.05);
    });

    it('alt plus the arrows change the duration and the clip bounds are kept', async () => {
      await open();
      const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
      key(bar, 'ArrowRight', { altKey: true });
      expect(last()).toMatchObject({ start: 0.5, duration: 1.05 });
      for (let i = 0; i < 20; i++) key(bar, 'ArrowRight', { shiftKey: true }); // far past the end
      expect(last().start + last().duration).toBeLessThanOrEqual(4.0001);
      for (let i = 0; i < 20; i++) key(bar, 'ArrowLeft', { shiftKey: true });
      expect(last().start).toBe(0);
    });

    it('a keyboard move is one undo step per press and other keys do nothing', async () => {
      await open();
      const bar = q('[data-testid=timeline-bar-title]') as HTMLElement;
      key(bar, 'a');
      expect(emitted).toHaveLength(0);
      key(bar, 'ArrowRight');
      (q('[data-testid=timeline-undo]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(last().start).toBe(0.5);
    });

    it('the red bar is a slider that seeks with the arrows and stays inside the clip', async () => {
      await open();
      const head = q('[data-testid=timeline-ruler-playhead]') as HTMLElement;
      expect(head.getAttribute('role')).toBe('slider');
      expect(head.getAttribute('tabindex')).toBe('0');
      expect(head.getAttribute('aria-valuemax')).toBe('4');
      expect(q('[data-testid=timeline-playhead]')?.getAttribute('aria-hidden')).toBe('true'); // one slider, not one per row
      key(head, 'ArrowLeft');
      expect(sought[sought.length - 1]).toBe(0); // time is 0: never below zero
      fixture.componentRef.setInput('time', 1);
      fixture.detectChanges();
      expect(head.getAttribute('aria-valuenow')).toBe('1');
      key(head, 'ArrowRight');
      expect(sought[sought.length - 1]).toBe(1.05);
      key(head, 'ArrowRight', { shiftKey: true });
      expect(sought[sought.length - 1]).toBe(1.5);
      fixture.componentRef.setInput('time', 3.98);
      fixture.detectChanges();
      key(head, 'ArrowRight');
      expect(sought[sought.length - 1]).toBe(4);
      expect(emitted).toHaveLength(0); // seeking is not an edit
    });
  });

  it('the ruler can be grabbed too, and the red bar on it follows the time', async () => {
    await open();
    wide();
    fixture.componentRef.setInput('time', 1);
    fixture.detectChanges();
    expect((q('[data-testid=timeline-ruler-playhead]') as HTMLElement).style.left).toBe('25%');
    const ruler = q('[data-testid=timeline-ruler]') as HTMLElement;
    pointer('pointerdown', ruler, 200);
    expect(sought[sought.length - 1]).toBe(2);
    pointer('pointerup', ruler, 200);
  });

  it('a new timeline from outside (after saving) restarts the panel', async () => {
    await open();
    const sel = q('[data-testid=timeline-ease-title]') as HTMLSelectElement;
    sel.value = 'linear';
    sel.dispatchEvent(new Event('change'));
    fixture.componentRef.setInput('timeline', { ...TL, tracks: [{ ...TL.tracks[0], ease: 'linear' }] });
    fixture.detectChanges();
    expect((q('[data-testid=timeline-undo]') as HTMLButtonElement).disabled).toBe(true);
  });
});
