import { TestBed } from '@angular/core/testing';

import type { Script, SongMap } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import type { Selection } from './selection';
import { MotionTimeline, type TimelineEdit } from './timeline';

const MAP: SongMap = {
  duration: 120,
  bpm: 120,
  beats: Array.from({ length: 240 }, (_, i) => i * 0.5),
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'verse', start: 0, end: 60 }, { tag: 'chorus', start: 60, end: 120 }],
  words: [
    { text: 'long', start: 1, end: 3, line: 0 },
    { text: 'x', start: 3, end: 3.1, line: 0 },
    { text: 'far', start: 100, end: 102, line: 1 },
  ],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: Array.from({ length: 240 }, (_, i) => (i % 10) / 10),
};

const SCRIPT: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 20, part: 'toggle', with: [{ part: 'counter' }], lines: [{ line: 0 }], hit: { word: 'go', at: 5, length: 1 } },
    { id: 'p2', start: 20, end: 60, part: 'pulse-ring', with: [{ part: 'a' }, { part: 'b' }, { part: 'c' }] },
    { id: 'p3', start: 60, end: 120, part: 'stamp' },
  ],
};

function setup(selection: Selection | null = null, lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: lang }] });
  const fixture = TestBed.createComponent(MotionTimeline);
  fixture.componentRef.setInput('songMap', MAP);
  fixture.componentRef.setInput('script', SCRIPT);
  fixture.componentRef.setInput('playhead', 12);
  fixture.componentRef.setInput('selection', selection);
  fixture.componentRef.setInput('zoom', 10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const seeks: number[] = [];
  const picks: (Selection | null)[] = [];
  fixture.componentInstance.seek.subscribe((t) => seeks.push(t));
  fixture.componentInstance.select.subscribe((s) => picks.push(s));
  const blocks = () => Array.from(el.querySelectorAll('.lane.main .block'));
  return { fixture, el, seeks, picks, blocks, zoom: () => fixture.componentInstance.zoom() };
}

describe('MotionTimeline', () => {
  it('draws the lanes: main track with a block per piece, three extra lanes, sections, loudness and the playhead', () => {
    const { el, blocks } = setup();
    expect(blocks()).toHaveLength(3);
    expect(blocks()[0].textContent).toContain('toggle');
    expect(el.querySelectorAll('.lane.extra')).toHaveLength(3);
    expect(el.querySelectorAll('.lane.extra .block').length).toBe(1 + 3);
    expect(el.querySelectorAll('.section')).toHaveLength(2);
    expect(el.querySelector('.loudness')!.getAttribute('d')).toMatch(/^M/);
    expect((el.querySelector('.playhead') as HTMLElement).style.left).toBe('120px');
  });

  it('marks a dot for each line and a flag for the word hit', () => {
    const { el } = setup();
    expect(el.querySelectorAll('.lane.main .dot')).toHaveLength(1);
    expect(el.querySelectorAll('.lane.main .flag')).toHaveLength(1);
  });

  it('paints the words only where they are wide enough, and only the ones in view', () => {
    const { el, fixture } = setup();
    const words = () => Array.from(el.querySelectorAll('.word')).map((w) => w.textContent);
    expect(words()).toEqual([]); // 'long' is 20 px wide at 10 px a second: under the threshold
    fixture.componentRef.setInput('zoom', 40);
    fixture.detectChanges();
    expect(words()).toEqual(['long']); // 80 px; 'x' is 4 px wide and 'far' is out of view
  });

  it('paints only what is in view: a block far to the right is not there until it scrolls in', () => {
    const { el, blocks, fixture } = setup();
    expect(blocks().map((b) => b.textContent!.trim())).toEqual(['toggle', 'pulse-ring', 'stamp']); // 1000 px at 10 px/s sees 100 s
    fixture.componentRef.setInput('zoom', 40); // 4800 px of song, 1000 px window: only the first seconds
    fixture.detectChanges();
    expect(blocks().map((b) => b.textContent!.trim())).toEqual(['toggle', 'pulse-ring']);
    const scroller = el.querySelector('.scroller') as HTMLElement;
    scroller.scrollLeft = 3000;
    scroller.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(blocks().map((b) => b.textContent!.trim())).toEqual(['stamp']);
  });

  it('seeks to the time under a press on a lane, and not past the song', () => {
    const { el, seeks } = setup();
    const lanes = el.querySelector('.lanes') as HTMLElement;
    lanes.dispatchEvent(new MouseEvent('pointerdown', { clientX: 250, bubbles: true }));
    expect(seeks).toEqual([25]);
    lanes.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    lanes.dispatchEvent(new MouseEvent('pointerdown', { clientX: 99999, bubbles: true }));
    expect(seeks.at(-1)).toBe(120);
  });

  it('keeps seeking while the button is held and the pointer moves, and stops when it is let go', () => {
    const { el, seeks } = setup();
    const lanes = el.querySelector('.lanes') as HTMLElement;
    lanes.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
    lanes.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, bubbles: true }));
    lanes.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, bubbles: true }));
    expect(seeks).toEqual([10, 20, 30]);
    lanes.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    lanes.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, bubbles: true }));
    expect(seeks).toEqual([10, 20, 30]);
  });

  it('does not scrub from a press on a block: that selects it', () => {
    const { seeks, blocks } = setup();
    blocks()[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(seeks).toEqual([]);
  });

  it('selects on a click or Enter on a block and does not seek', () => {
    const { el, seeks, picks, blocks } = setup();
    blocks()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picks).toEqual([{ piece: 'p2' }]);
    expect(seeks).toEqual([]);
    el.querySelectorAll('.lane.extra .block')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(picks.at(-1)).toEqual({ piece: 'p1', extra: 0 });
  });

  it('marks the selection with the accent class and aria-pressed', () => {
    const { blocks, el } = setup({ piece: 'p2', extra: 1 });
    expect(blocks().map((b) => b.classList.contains('selected'))).toEqual([false, false, false]);
    const sel = Array.from(el.querySelectorAll('.lane.extra .block')).filter((b) => b.classList.contains('selected'));
    expect(sel).toHaveLength(1);
    // the control that takes the keyboard is the block's body, and it says it is pressed
    expect(sel[0].querySelector('[role="button"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(sel[0].textContent).toContain('b');
  });

  it('zooms with Ctrl and the wheel, and with + and −, inside 4 and 400', () => {
    const { el, zoom, fixture } = setup();
    const scroller = el.querySelector('.scroller') as HTMLElement;
    scroller.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, clientX: 100, bubbles: true, cancelable: true }));
    expect(zoom()).toBeCloseTo(11.5, 5);
    scroller.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 100, clientX: 100, bubbles: true, cancelable: true }));
    expect(zoom()).toBeCloseTo(10, 5);
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(zoom()).toBeCloseTo(11.5, 5);
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    expect(zoom()).toBeCloseTo(10, 5);
    fixture.componentRef.setInput('zoom', 399);
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(zoom()).toBe(400);
  });

  it('scrolls with the plain wheel', () => {
    const { el } = setup();
    const scroller = el.querySelector('.scroller') as HTMLElement;
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    scroller.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scroller.scrollLeft).toBe(120);
  });

  it('goes to the playhead when it leaves the window, and stays when it is in view', () => {
    const { el, fixture } = setup();
    const scroller = el.querySelector('.scroller') as HTMLElement;
    fixture.componentRef.setInput('zoom', 40); // 4800 px of song in a window of 1000
    fixture.componentRef.setInput('playhead', 50); // x = 2000, out of view
    fixture.detectChanges();
    expect(scroller.scrollLeft).toBe(1500); // centred: 2000 - 1000 / 2
    scroller.scrollLeft = 1500;
    fixture.componentRef.setInput('playhead', 52); // x = 2080, in view
    fixture.detectChanges();
    expect(scroller.scrollLeft).toBe(1500);
  });

  describe('what is dropped from the library', () => {
    const drag = (el: HTMLElement, type: string, clientX: number, clientY: number, data: string | null = '{"kind":"part","name":"toggle"}') => {
      const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types: data === null ? ['text/plain'] : ['application/x-motion-palette-item'], getData: () => data ?? '', dropEffect: '' } });
      el.querySelector('.lanes')!.dispatchEvent(event);
      return event;
    };

    it('takes an item over the main track and over an extra lane, at the time under the pointer', () => {
      const { el, fixture } = setup();
      const drops: { item: unknown; time: number; lane: unknown }[] = [];
      fixture.componentInstance.dropItem.subscribe((d) => drops.push(d));
      drag(el, 'drop', 250, 120); // y 120 is in the main track (104..140)
      drag(el, 'drop', 400, 150); // 140..162 is extra lane 0
      drag(el, 'drop', 100, 190); // 184..206 is extra lane 2
      drag(el, 'drop', 100, 30); // the sections lane
      expect(drops).toEqual([
        { item: { kind: 'part', name: 'toggle' }, time: 25, lane: 'main' },
        { item: { kind: 'part', name: 'toggle' }, time: 40, lane: 0 },
        { item: { kind: 'part', name: 'toggle' }, time: 10, lane: 2 },
        { item: { kind: 'part', name: 'toggle' }, time: 10, lane: 'other' },
      ]);
    });

    it('shows where it would land while it is over, and not for something that is not from the library', () => {
      const { el, fixture } = setup();
      const over = drag(el, 'dragover', 250, 120);
      fixture.detectChanges();
      expect(over.defaultPrevented).toBe(true);
      expect(el.querySelector('[data-testid="drop-line"]')!.getAttribute('data-lane')).toBe('main');
      el.querySelector('.lanes')!.dispatchEvent(new Event('dragleave', { bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="drop-line"]')).toBeNull();
      const other = drag(el, 'dragover', 250, 120, null);
      expect(other.defaultPrevented).toBe(false);
    });

    it('ignores a drop that is not an item of ours', () => {
      const { el, fixture } = setup();
      const drops: unknown[] = [];
      fixture.componentInstance.dropItem.subscribe((d) => drops.push(d));
      drag(el, 'drop', 250, 120, 'not json');
      expect(drops).toEqual([]);
    });
  });

  it('says its labels in Spanish', () => {
    const { el } = setup(null, 'es');
    expect(el.textContent).toContain('Parte principal');
    expect(el.querySelector('.timeline')!.getAttribute('aria-label')).toBe('Línea de tiempo');
  });

  it('marks the blocks that have a warning and says what it is when the pointer rests on it', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('warnings', [
      { kind: 'param-range', severity: 'warning', piece: 'p2', param: 'count', limit: 5 },
      { kind: 'level', severity: 'info', piece: 'p2', part: 'pulse-ring', text: 'simple' },
      { kind: 'level', severity: 'info', piece: 'p3', part: 'stamp', text: 'simple' },
    ]);
    fixture.detectChanges();
    const marks = Array.from(el.querySelectorAll('[data-testid="warn-mark"]'));
    expect(marks).toHaveLength(2);
    expect(marks[0].classList.contains('soft')).toBe(false);
    expect(marks[0].querySelector('title')!.textContent).toContain('"count" is outside its limit (5)');
    expect(marks[1].classList.contains('soft')).toBe(true);
  });

  it('marks a block the server refused, in the colour of an error, with the reason', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('refused', { p3: 'the parameter "label" is longer than 18 characters' });
    fixture.detectChanges();
    const mark = el.querySelector('[data-testid="warn-mark"]')!;
    expect(mark.classList.contains('refused')).toBe(true);
    expect(mark.querySelector('title')!.textContent).toContain('longer than 18');
  });

  it('marks a block with the verdict a review gave it, with a glyph besides the colour and the host\'s words as its title', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('grades', { p1: { verdict: 'fail', text: 'p1: 3 of 10, two accents' }, p2: { verdict: 'pass', text: 'p2: 8 of 10' } });
    fixture.detectChanges();
    const marks = Array.from(el.querySelectorAll('[data-testid="grade-mark"]'));
    expect(marks.map((m) => m.getAttribute('data-verdict'))).toEqual(['fail', 'pass']);
    expect(marks[0].querySelector('title')!.textContent).toContain('two accents');
    expect(marks.map((m) => m.querySelector('text')!.textContent)).toEqual(['✕', '✓']);
  });

  describe('dragging', () => {
    function drag() {
      const ctx = setup();
      const edits: TimelineEdit[] = [];
      ctx.fixture.componentInstance.edit.subscribe((e) => edits.push(e));
      const lanes = ctx.el.querySelector('.lanes') as HTMLElement;
      const at = (type: string, clientX: number, init: MouseEventInit = {}) => lanes.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, ...init }));
      const handles = () => Array.from(ctx.el.querySelectorAll('[data-testid="cut-handle"]'));
      const last = () => edits.at(-1)!.change!(SCRIPT).pieces.map((p) => [p.start, p.end]);
      return { ...ctx, edits, at, handles, last, lanes };
    }

    describe('with the keyboard', () => {
      const press = (target: Element, key: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

      it('moves a cut by a tenth of a second, by a second with Shift and by a hundredth with Alt, one edit each', () => {
        const { handles, edits, last, seeks } = drag();
        press(handles()[0], 'ArrowRight');
        expect(edits.map((e) => e.phase)).toEqual(['apply']);
        expect(last()).toEqual([[0, 20.1], [20.1, 60], [60, 120]]);
        expect(seeks.at(-1)).toBe(20.1);
        press(handles()[0], 'ArrowLeft', { shiftKey: true });
        expect(last()).toEqual([[0, 19], [19, 60], [60, 120]]);
        press(handles()[0], 'ArrowRight', { altKey: true });
        expect(last()).toEqual([[0, 20.01], [20.01, 60], [60, 120]]);
        expect(edits).toHaveLength(3);
      });

      it('moves a block with both its cuts, and leaves other keys and a locked timeline alone', () => {
        const { el, edits, last, fixture } = drag();
        const body = (n: number) => el.querySelectorAll('.lane.main .block-body')[n];
        press(body(1), 'ArrowRight', { shiftKey: true });
        expect(last()).toEqual([[0, 21], [21, 61], [61, 120]]);
        press(body(1), 'a');
        press(body(1), 'ArrowRight', { ctrlKey: true });
        expect(edits).toHaveLength(1);
        fixture.componentRef.setInput('locked', true);
        fixture.detectChanges();
        press(body(1), 'ArrowRight');
        expect(edits).toHaveLength(1);
      });

      it('swaps what a block draws with the piece before or after with [ and ], and selects where it went', () => {
        const { el, edits, fixture } = drag();
        const picks: (Selection | null)[] = [];
        fixture.componentInstance.select.subscribe((s) => picks.push(s));
        const body = (n: number) => el.querySelectorAll('.lane.main .block-body')[n];
        press(body(0), ']');
        expect(edits.map((e) => e.phase)).toEqual(['apply']);
        const swapped = edits[0].change!(SCRIPT).pieces;
        expect(swapped.map((p) => [p.id, p.start, p.end, p.part])).toEqual([['p1', 0, 20, 'pulse-ring'], ['p2', 20, 60, 'toggle'], ['p3', 60, 120, 'stamp']]);
        expect(picks.at(-1)).toEqual({ piece: 'p2' });
        press(body(0), '[');
        press(body(2), ']');
        expect(edits).toHaveLength(1);
        press(body(1), '[', { altKey: true });
        expect(edits).toHaveLength(1);
        fixture.componentRef.setInput('locked', true);
        fixture.detectChanges();
        press(body(1), '[');
        expect(edits).toHaveLength(1);
      });

      it('makes the cuts reachable with Tab and says where they are', () => {
        const { handles } = drag();
        expect(handles()[0].getAttribute('tabindex')).toBe('0');
        expect(handles()[0].getAttribute('aria-valuenow')).toBe('20');
        expect(handles()[0].getAttribute('aria-label')).toContain('Left and Right arrows');
      });
    });

    describe('with the keyboard, extras', () => {
      const press = (target: Element, key: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

      it('takes an extra to the lane below or above, selects it there, and stops at the first and the last', () => {
        const { handles, edits, last, fixture, el } = drag();
        void handles;
        const picks: (Selection | null)[] = [];
        fixture.componentInstance.select.subscribe((s) => picks.push(s));
        const extra = (n: number) => el.querySelector(`.lane.extra[data-extra="${n}"] .block-body[data-piece="p2"]`)!;
        press(extra(0), 'ArrowDown');
        expect(edits.map((e) => e.phase)).toEqual(['apply']);
        expect(last().length).toBe(3);
        expect(edits.at(-1)!.change!(SCRIPT).pieces[1].with!.map((w) => w.part)).toEqual(['b', 'a', 'c']);
        expect(picks.at(-1)).toEqual({ piece: 'p2', extra: 1 });
        press(extra(0), 'ArrowUp');
        press(extra(2), 'ArrowDown');
        expect(edits).toHaveLength(1);
        press(extra(1), 'ArrowDown', { altKey: true });
        expect(edits).toHaveLength(1);
      });
    });

    it('offers an edge to drag between two blocks, and none at the start of the first', () => {
      const { handles } = drag();
      expect(handles()).toHaveLength(2);
    });

    it('moves a cut and lands it on the nearest beat with the magnet on, in one gesture', () => {
      const { handles, at, edits, last, el, fixture, seeks } = drag();
      handles()[0].dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      at('pointermove', 252);
      fixture.detectChanges();
      expect(edits.map((e) => e.phase)).toEqual(['begin', 'update']);
      expect(last()).toEqual([[0, 25], [25, 60], [60, 120]]);
      expect(seeks.at(-1)).toBe(25);
      expect(el.querySelector('[data-testid="guide"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="drag-time"]')!.textContent).toContain('25.00 s');
      at('pointerup', 252);
      expect(edits.map((e) => e.phase)).toEqual(['begin', 'update', 'end']);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="guide"]')).toBeNull();
    });

    it('places the cut freely while Alt is held, and when the magnet is off', () => {
      const a = drag();
      a.handles()[0].dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      a.at('pointermove', 252, { altKey: true });
      expect(a.last()).toEqual([[0, 25.2], [25.2, 60], [60, 120]]);
      TestBed.resetTestingModule();
      const b = drag();
      b.fixture.componentRef.setInput('magnet', false);
      b.handles()[0].dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      b.at('pointermove', 252);
      expect(b.last()).toEqual([[0, 25.2], [25.2, 60], [60, 120]]);
    });

    it('keeps a piece at least half a second long', () => {
      const { handles, at, last } = drag();
      handles()[0].dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
      at('pointermove', 5);
      expect(last()[0]).toEqual([0, 0.5]);
    });

    it('moves a block by its body, both cuts together', () => {
      const { blocks, at, last, edits } = drag();
      blocks()[1].dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, bubbles: true }));
      at('pointermove', 450);
      expect(last()).toEqual([[0, 25], [25, 65], [65, 120]]);
      at('pointerup', 450);
      expect(edits.at(-1)!.phase).toBe('end');
    });

    it('swaps two blocks when one is picked up with Shift and dropped on the other, and shows the target on the way', () => {
      const { blocks, at, edits, fixture, el } = drag();
      blocks()[0].dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, shiftKey: true, bubbles: true }));
      at('pointermove', 400, { shiftKey: true });
      fixture.detectChanges();
      expect(el.querySelector('.block.swap-target')).not.toBeNull();
      at('pointerup', 400);
      expect(edits.map((e) => e.phase)).toEqual(['apply']);
      const next = edits[0].change!(SCRIPT);
      expect(next.pieces.map((p) => [p.id, p.part])).toEqual([['p1', 'pulse-ring'], ['p2', 'toggle'], ['p3', 'stamp']]);
    });

    it('reorders the extras of a piece by dragging an extra block to another extra lane, showing the lane it would land on', () => {
      const { el, at, edits, fixture } = drag();
      const lanes = el.querySelector('.lanes') as HTMLElement;
      // lane tops: ruler 24 + sections 20 + loudness 40 + words 20 + main 36 = 140; extra lanes are 22 high
      Object.defineProperty(el.querySelector('.scroller')!, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 1000, height: 300, right: 1000, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) });
      const extraThird = el.querySelectorAll('.lane.extra')[2].querySelector('.extra-block') as HTMLElement;
      extraThird.dispatchEvent(new MouseEvent('pointerdown', { clientX: 300, clientY: 140 + 22 * 2 + 10, bubbles: true }));
      lanes.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 140 + 5, bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelectorAll('.lane.extra')[0].classList.contains('reorder-target')).toBe(true);
      at('pointerup', 300);
      expect(edits.map((e) => e.phase)).toEqual(['apply']);
      const next = edits[0].change!(SCRIPT);
      expect(next.pieces[1].with!.map((x) => x.part)).toEqual(['c', 'a', 'b']);
    });

    it('is still a click when the pointer hardly moves', () => {
      const { blocks, at, edits, picks } = drag();
      blocks()[1].dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, bubbles: true }));
      at('pointermove', 402);
      at('pointerup', 402);
      blocks()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(edits).toEqual([]);
      expect(picks.at(-1)).toEqual({ piece: 'p2' });
    });

    it('does nothing while locked', () => {
      const { fixture, blocks, at, edits, el } = drag();
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="cut-handle"]')).toHaveLength(0);
      blocks()[1].dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, bubbles: true }));
      at('pointermove', 450);
      expect(edits).toEqual([]);
    });

    it('turns the magnet off and on from its button', () => {
      const { el, fixture } = drag();
      const button = el.querySelector('[data-testid="magnet"]') as HTMLButtonElement;
      expect(fixture.componentInstance.magnet()).toBe(true);
      button.click();
      expect(fixture.componentInstance.magnet()).toBe(false);
    });
  });
});
