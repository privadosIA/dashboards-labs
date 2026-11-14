import { TestBed } from '@angular/core/testing';

import type { Catalog, Keyframe, Script, SongMap } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import type { Selection } from './selection';
import { MotionTimeline, type TimelineEdit } from './timeline';

const MAP: SongMap = {
  duration: 120,
  bpm: 120,
  beats: Array.from({ length: 240 }, (_, i) => i * 0.5),
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'verse', start: 0, end: 60 }],
  words: [],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
};

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });

const SCRIPT: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 20, part: 'counter', animate: { to: [kf(0, 0, 'linear'), kf(10, 50), kf(20, 100)] }, with: [{ part: 'toggle', animate: { on: [kf(0, true, 'step'), kf(5, false)] } }] },
    { id: 'p2', start: 20, end: 60, part: 'counter', animate: { to: [kf(0, 7)] } },
    { id: 'p3', start: 60, end: 120, part: 'stamp' },
  ],
};
const CATALOG = { parts: [{ name: 'counter', params: [{ name: 'to', type: 'int' }] }] } as unknown as Catalog;

function setup(script: Script = SCRIPT) {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: 'en' }] });
  const fixture = TestBed.createComponent(MotionTimeline);
  fixture.componentRef.setInput('songMap', MAP);
  fixture.componentRef.setInput('script', script);
  fixture.componentRef.setInput('zoom', 10);
  fixture.componentRef.setInput('catalog', CATALOG);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const edits: TimelineEdit[] = [];
  const picks: (Selection | null)[] = [];
  const seeks: number[] = [];
  fixture.componentInstance.edit.subscribe((e) => edits.push(e));
  fixture.componentInstance.choose.subscribe((s) => picks.push(s));
  fixture.componentInstance.seek.subscribe((t) => seeks.push(t));
  const lanes = el.querySelector('.lanes') as HTMLElement;
  const at = (type: string, clientX: number, init: MouseEventInit = {}) => lanes.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, ...init }));
  const rows = () => Array.from(el.querySelectorAll('[data-testid="kf-row"]')) as SVGElement[];
  const diamonds = (row: SVGElement) => Array.from(row.querySelectorAll('[data-testid="kf"]')) as SVGElement[];
  const last = () => edits.at(-1)!.change!(script);
  return { fixture, el, edits, picks, seeks, lanes, at, rows, diamonds, last };
}

describe('the keyframe rows of the timeline', () => {
  it('draws a row for every animated parameter, labelled, with a diamond for each keyframe', () => {
    const { el, rows, diamonds } = setup();
    expect(rows().map((r) => r.getAttribute('data-row'))).toEqual(['main:to', '0:on']);
    expect(Array.from(el.querySelectorAll('[data-testid="kf-label"]')).map((l) => l.textContent?.trim())).toEqual(['◆ to', '◆ Extra 1 · on']);
    // p1 has three and p2 one, on the row of `to`
    expect(diamonds(rows()[0])).toHaveLength(4);
    expect(diamonds(rows()[1])).toHaveLength(2);
  });

  it('puts a diamond at the song time of its keyframe, and draws a line over the piece that animates it', () => {
    const { rows, diamonds } = setup();
    const centre = (d: SVGElement) => {
      const nums = (d.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
      return nums[0] + 6; // the first point is the left corner of the diamond
    };
    expect(diamonds(rows()[0]).map(centre)).toEqual([0, 100, 200, 200]);
    expect(rows()[0].querySelectorAll('.kf-span')).toHaveLength(2);
  });

  it('has no row for a script that animates nothing', () => {
    const { rows } = setup({ version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'counter' }] });
    expect(rows()).toHaveLength(0);
  });

  it('names a keyframe for assistive tools and says it in the labels', () => {
    const { rows, diamonds } = setup();
    expect(diamonds(rows()[0])[1].getAttribute('aria-label')).toContain('Keyframe of "to" at 10.00 s');
  });

  describe('selecting', () => {
    it('selects a keyframe with its parameter and place, on a click or Enter, and marks it', () => {
      const { rows, diamonds, picks, fixture } = setup();
      diamonds(rows()[0])[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(picks.at(-1)).toEqual({ piece: 'p1', param: 'to', keyframe: 1 });
      diamonds(rows()[1])[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(picks.at(-1)).toEqual({ piece: 'p1', extra: 0, param: 'on', keyframe: 0 });
      fixture.componentRef.setInput('selection', { piece: 'p1', param: 'to', keyframe: 1 });
      fixture.detectChanges();
      expect(diamonds(rows()[0])[1].classList.contains('selected')).toBe(true);
      expect(diamonds(rows()[0])[1].getAttribute('aria-pressed')).toBe('true');
      expect(diamonds(rows()[0])[0].classList.contains('selected')).toBe(false);
    });

    it('does not move the playhead when a diamond is pressed', () => {
      const { rows, diamonds, seeks } = setup();
      diamonds(rows()[0])[1].dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      expect(seeks).toEqual([]);
    });
  });

  describe('dragging a keyframe', () => {
    const press = (ctx: ReturnType<typeof setup>, row: number, n: number, x: number) => ctx.diamonds(ctx.rows()[row])[n].dispatchEvent(new MouseEvent('pointerdown', { clientX: x, bubbles: true }));
    const times = (s: Script, param = 'to') => s.pieces[0].animate![param].map((k) => k.t);

    it('lands on the nearest beat with the magnet on, as the piece\'s own seconds, in one gesture', () => {
      const ctx = setup();
      press(ctx, 0, 1, 100);
      ctx.at('pointermove', 152);
      expect(ctx.edits.map((e) => e.phase)).toEqual(['begin', 'update']);
      expect(times(ctx.last())).toEqual([0, 15, 20]);
      expect(ctx.picks.at(-1)).toEqual({ piece: 'p1', param: 'to', keyframe: 1 });
      ctx.fixture.detectChanges();
      expect(ctx.el.querySelector('[data-testid="drag-time"]')!.textContent).toContain('15.00 s');
      ctx.at('pointerup', 152);
      expect(ctx.edits.map((e) => e.phase)).toEqual(['begin', 'update', 'end']);
    });

    it('is free while Alt is held and when the magnet is off', () => {
      const a = setup();
      press(a, 0, 1, 100);
      a.at('pointermove', 152, { altKey: true });
      expect(times(a.last())).toEqual([0, 15.2, 20]);
      TestBed.resetTestingModule();
      const b = setup();
      b.fixture.componentRef.setInput('magnet', false);
      press(b, 0, 1, 100);
      b.at('pointermove', 152);
      expect(times(b.last())).toEqual([0, 15.2, 20]);
    });

    it('stays inside the piece and short of its neighbours', () => {
      const ctx = setup();
      press(ctx, 0, 1, 100);
      ctx.at('pointermove', 900);
      expect(times(ctx.last())).toEqual([0, 19.99, 20]);
      ctx.at('pointermove', -400);
      expect(times(ctx.last())).toEqual([0, 0.01, 20]);
    });

    it('moves the keyframe of an extra by its own parameter', () => {
      const ctx = setup();
      press(ctx, 1, 1, 50);
      ctx.at('pointermove', 80);
      expect(ctx.last().pieces[0].with![0].animate!['on'].map((k) => k.t)).toEqual([0, 8]);
    });

    it('is still a click when the pointer hardly moves, and does nothing while locked', () => {
      const ctx = setup();
      press(ctx, 0, 1, 100);
      ctx.at('pointermove', 101);
      ctx.at('pointerup', 101);
      expect(ctx.edits).toEqual([]);
      TestBed.resetTestingModule();
      const locked = setup();
      locked.fixture.componentRef.setInput('locked', true);
      press(locked, 0, 1, 100);
      locked.at('pointermove', 152);
      expect(locked.edits).toEqual([]);
    });
  });

  describe('adding a keyframe by a double click on the row', () => {
    const dbl = (ctx: ReturnType<typeof setup>, row: number, x: number) => ctx.rows()[row].dispatchEvent(new MouseEvent('dblclick', { clientX: x, bubbles: true }));

    it('adds one at that time with the value the parameter has there, and selects it', () => {
      const ctx = setup();
      dbl(ctx, 0, 50);
      expect(ctx.edits.map((e) => e.phase)).toEqual(['apply']);
      expect(ctx.last().pieces[0].animate!['to']).toEqual([kf(0, 0, 'linear'), { t: 5, value: 25, ease: 'linear' }, kf(10, 50), kf(20, 100)]);
      expect(ctx.picks.at(-1)).toEqual({ piece: 'p1', param: 'to', keyframe: 1 });
    });

    it('rounds the value for a whole-number parameter', () => {
      const ctx = setup();
      dbl(ctx, 0, 36);
      expect(ctx.last().pieces[0].animate!['to'][1]).toEqual({ t: 3.6, value: 18, ease: 'linear' });
    });

    it('adds to the extra\'s own parameter', () => {
      const ctx = setup();
      dbl(ctx, 1, 20);
      expect(ctx.last().pieces[0].with![0].animate!['on'].map((k) => [k.t, k.value])).toEqual([[0, true], [2, true], [5, false]]);
    });

    it('does nothing outside the pieces that animate the parameter, or while locked', () => {
      const ctx = setup();
      dbl(ctx, 0, 900);
      expect(ctx.edits).toEqual([]);
      ctx.fixture.componentRef.setInput('locked', true);
      dbl(ctx, 0, 50);
      expect(ctx.edits).toEqual([]);
    });
  });

  describe('with the keyboard', () => {
    const press = (target: Element, key: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

    it('moves a keyframe by a tenth of a second, a second with Shift, a hundredth with Alt, one edit each', () => {
      const { rows, diamonds, edits, last, seeks } = setup();
      const d = diamonds(rows()[0])[1];
      press(d, 'ArrowRight');
      expect(edits.map((e) => e.phase)).toEqual(['apply']);
      expect(last().pieces[0].animate!['to'][1].t).toBe(10.1);
      expect(seeks.at(-1)).toBe(10);
      press(d, 'ArrowLeft', { shiftKey: true });
      expect(last().pieces[0].animate!['to'][1].t).toBe(9);
      press(d, 'ArrowRight', { altKey: true });
      expect(last().pieces[0].animate!['to'][1].t).toBe(10.01);
    });

    it('moves the keyframe of an extra by its own parameter, and not past the end of the piece', () => {
      const { rows, diamonds, last, edits } = setup();
      press(diamonds(rows()[1])[1], 'ArrowRight', { shiftKey: true });
      expect(last().pieces[0].with![0].animate!['on'][1].t).toBe(6);
      const before = edits.length;
      // the last one is already at the end of the piece: nothing to move, nothing emitted
      press(diamonds(rows()[0])[2], 'ArrowRight');
      expect(edits.length).toBe(before);
    });

    it('leaves other keys and a locked timeline alone', () => {
      const { rows, diamonds, edits, fixture } = setup();
      const d = diamonds(rows()[0])[1];
      press(d, 'a');
      press(d, 'ArrowRight', { ctrlKey: true });
      expect(edits).toEqual([]);
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      press(d, 'ArrowRight');
      expect(edits).toEqual([]);
    });
  });
});
