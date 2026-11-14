import { BEATS_PER_BAR, MAX_PX_PER_SECOND, MIN_PX_PER_SECOND, TimeScale, barBeats, clampScale, inRange, rulerStep } from './scale';

describe('TimeScale', () => {
  it('turns seconds into pixels and back', () => {
    const s = new TimeScale(50);
    expect(s.xOf(2.5)).toBe(125);
    expect(s.tOf(125)).toBe(2.5);
    expect(s.widthOf(4)).toBe(200);
  });

  it('keeps the scale between 4 and 400 pixels a second', () => {
    expect(new TimeScale(1).pxPerSecond).toBe(MIN_PX_PER_SECOND);
    expect(new TimeScale(9999).pxPerSecond).toBe(MAX_PX_PER_SECOND);
    expect(clampScale(100)).toBe(100);
  });

  it('says what time range a window shows', () => {
    expect(new TimeScale(100).visible(250, 800)).toEqual({ from: 2.5, to: 10.5 });
  });

  it('zooms around a point: the time under it does not move', () => {
    const s = new TimeScale(100);
    const scroll = 300;
    const anchor = 200; // the pointer, 200 px into the window: time (300 + 200) / 100 = 5 s
    const z = s.zoomAround(2, anchor, scroll);
    expect(z.scale.pxPerSecond).toBe(200);
    expect(z.scale.tOf(z.scrollLeft + anchor)).toBe(5);
  });

  it('never scrolls before the start when zooming out, and stops at the limits', () => {
    const z = new TimeScale(100).zoomAround(0.01, 400, 0);
    expect(z.scrollLeft).toBe(0);
    expect(z.scale.pxPerSecond).toBe(MIN_PX_PER_SECOND);
    expect(new TimeScale(300).zoomAround(5, 0, 0).scale.pxPerSecond).toBe(MAX_PX_PER_SECOND);
  });

  it('fits a song to a width', () => {
    expect(TimeScale.fit(240, 1000).pxPerSecond).toBeCloseTo(4.1667, 3);
    expect(TimeScale.fit(0, 1000).pxPerSecond).toBe(MIN_PX_PER_SECOND);
  });
});

describe('bars and ranges', () => {
  it('finds the beats that start a bar, counting from the slice base', () => {
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
    expect(barBeats(beats, 0, 0, 10)).toEqual([0, 4, 8]);
    expect(barBeats(beats, 1, 0, 10)).toEqual([3, 7]);
    expect(barBeats(beats, 0, 1, 3)).toEqual([4]);
    expect(BEATS_PER_BAR).toBe(4);
  });

  it('keeps the items that touch the visible range', () => {
    const items = [{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 12 }];
    expect(inRange(items, 5, 9)).toEqual([items[1], items[2]]);
    expect(inRange(items, 20, 30)).toEqual([]);
  });

  it('spaces the ruler marks so they do not crowd', () => {
    expect(rulerStep(4)).toBe(30);
    expect(rulerStep(100)).toBe(1);
    expect(rulerStep(400)).toBe(0.5);
  });
});
