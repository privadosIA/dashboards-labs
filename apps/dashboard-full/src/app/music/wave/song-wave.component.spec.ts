import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PeaksResponse } from '../../core/api.models';
import { SongWaveComponent, WaveRange, wavePath } from './song-wave.component';
import { beatGrid, beatSnapper } from './snap';

const PEAKS: PeaksResponse = { duration: 100, buckets: 10, peaks: [0.1, 0.5, 1, 1, 0.5, 0.2, 0.2, 0.4, 0.8, 0.1], active: null };

describe('wavePath', () => {
  it('draws a bar per peak and nothing without peaks', () => {
    expect(wavePath(PEAKS)?.width).toBe(10);
    expect(wavePath(PEAKS, 20, 50)?.width).toBe(3);
    expect(wavePath(null)).toBeNull();
    expect(wavePath({ ...PEAKS, peaks: [] })).toBeNull();
  });
});

describe('SongWaveComponent', () => {
  let fixture: ComponentFixture<SongWaveComponent>;
  let seeks: number[];
  let ranges: WaveRange[];

  beforeEach(() => TestBed.configureTestingModule({ imports: [SongWaveComponent] }));

  /** A box 100 px wide, so a pixel is a second of the 100 s song. */
  function make(inputs: Record<string, unknown> = {}) {
    fixture = TestBed.createComponent(SongWaveComponent);
    fixture.componentRef.setInput('peaks', PEAKS);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    seeks = [];
    ranges = [];
    fixture.componentInstance.seek.subscribe((s) => seeks.push(s));
    fixture.componentInstance.rangeChange.subscribe((r) => ranges.push(r));
    host().getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 64, right: 100, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    fixture.detectChanges();
  }
  const host = () => fixture.nativeElement as HTMLElement;
  const pointer = (type: string, x: number, init: MouseEventInit = {}, el: Element = host()) =>
    el.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true, ...init }));
  const q = (id: string) => host().querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const key = (id: string, k: string, shift = false) =>
    q(id).dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

  it('is a decoration when nothing can be done with it', () => {
    make();
    expect(host().querySelector('svg path')?.getAttribute('d')).toContain('M');
    expect(host().getAttribute('role')).toBeNull();
    expect(q('wave-head')).toBeNull();
  });

  it('draws nothing, and no error, when the peaks cannot be read', () => {
    make({ peaks: null, seekable: true });
    expect(host().querySelector('svg')).toBeNull();
    pointer('pointerdown', 50);
    pointer('pointerup', 50);
    expect(seeks).toEqual([]);
  });

  it('gives a text alternative with the length and the range', () => {
    make({ seekable: true });
    expect(host().getAttribute('role')).toBe('group');
    expect(host().getAttribute('aria-label')).toContain('1:40');
    fixture.componentRef.setInput('range', { start: 40, end: 65 });
    fixture.detectChanges();
    expect(host().getAttribute('aria-label')).toContain('40');
    expect(host().getAttribute('aria-label')).toContain('65');
  });

  it('moves the playhead and draws the played part up to it', () => {
    make({ seekable: true, position: 25 });
    expect(q('wave-head').style.left).toBe('25%');
    expect((host().querySelector('.wave--played') as HTMLElement).style.clipPath).toContain('75%');
  });

  it('seeks with a click', () => {
    make({ seekable: true });
    pointer('pointerdown', 50);
    pointer('pointerup', 50);
    expect(seeks).toEqual([50]);
    expect(ranges).toEqual([]);
  });

  it('picks a range by dragging, rounded to a tenth', () => {
    make({ editable: true });
    pointer('pointerdown', 40);
    pointer('pointermove', 65.04);
    pointer('pointerup', 65.04);
    expect(ranges).toEqual([{ start: 40, end: 65 }]);
    expect(seeks).toEqual([]);
  });

  it('picks a range dragged backwards and keeps it inside the song', () => {
    make({ editable: true });
    pointer('pointerdown', 60);
    pointer('pointermove', 20);
    pointer('pointerup', 20);
    pointer('pointerdown', 90);
    pointer('pointermove', 400);
    pointer('pointerup', 400);
    expect(ranges).toEqual([
      { start: 20, end: 60 },
      { start: 90, end: 100 },
    ]);
  });

  it('draws the range live while dragging', () => {
    make({ editable: true });
    pointer('pointerdown', 10);
    pointer('pointermove', 30);
    fixture.detectChanges();
    expect(q('wave-range').style.left).toBe('10%');
    expect(q('wave-range').style.width).toBe('20%');
  });

  it('drags a handle without moving the other', () => {
    make({ editable: true, range: { start: 40, end: 65 } });
    pointer('pointerdown', 40, {}, q('wave-start'));
    pointer('pointermove', 30);
    pointer('pointerup', 30);
    pointer('pointerdown', 65, {}, q('wave-end'));
    pointer('pointermove', 80);
    pointer('pointerup', 80);
    expect(ranges).toEqual([
      { start: 30, end: 65 },
      { start: 40, end: 80 },
    ]);
  });

  it('does not let the ends cross', () => {
    make({ editable: true, range: { start: 40, end: 65 } });
    pointer('pointerdown', 40, {}, q('wave-start'));
    pointer('pointermove', 90);
    pointer('pointerup', 90);
    expect(ranges).toEqual([{ start: 64.9, end: 65 }]);
  });

  it('snaps to the beat, and to the bar with Alt', () => {
    make({ editable: true, snap: beatSnapper(beatGrid(60, '4'), 0) });
    pointer('pointerdown', 10.4);
    pointer('pointermove', 33, { altKey: true });
    pointer('pointerup', 33, { altKey: true });
    expect(ranges).toEqual([{ start: 10, end: 32 }]);
  });

  it('moves the ends with the keys: a tenth, a second with Shift, Home and End', () => {
    make({ editable: true, range: { start: 40, end: 65 } });
    key('wave-start', 'ArrowRight');
    key('wave-start', 'ArrowLeft', true);
    key('wave-end', 'ArrowRight', true);
    key('wave-end', 'End');
    key('wave-start', 'Home');
    expect(ranges).toEqual([
      { start: 40.1, end: 65 },
      { start: 39, end: 65 },
      { start: 40, end: 66 },
      { start: 40, end: 100 },
      { start: 0, end: 65 },
    ]);
  });

  it('ignores other keys and does not move a handle past the other', () => {
    make({ editable: true, range: { start: 40, end: 40.1 } });
    key('wave-start', 'a');
    key('wave-start', 'ArrowRight');
    key('wave-end', 'ArrowLeft');
    expect(ranges).toEqual([]);
  });

  it('draws a range past the end of the song up to the end, and marks it', () => {
    make({ editable: true, range: { start: 80, end: 130 } });
    expect(q('wave-range').style.width).toBe('20%');
    expect(q('wave-range').classList).toContain('wave__range--over');
  });

  it('does not offer to edit when it is only seekable', () => {
    make({ seekable: true, range: { start: 40, end: 65 } });
    pointer('pointerdown', 10);
    pointer('pointermove', 30);
    pointer('pointerup', 30);
    key('wave-start', 'ArrowRight');
    expect(ranges).toEqual([]);
  });
});
