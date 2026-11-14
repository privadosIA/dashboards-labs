import { anchorOffset, beatGrid, beatSnapper, snapAnchored, snapTo } from './snap';

describe('anchorOffset and snapAnchored', () => {
  it('anchors on the very second without a period', () => {
    expect(anchorOffset(2, 5, 0)).toBe(3);
    expect(anchorOffset(8, 5, 0)).toBe(0);
  });

  it('anchors on the first beat at or after the start with a period', () => {
    expect(anchorOffset(0, 0.3, 0.5)).toBeCloseTo(0.3, 6);
    expect(anchorOffset(1, 0.3, 0.5)).toBeCloseTo(0.3, 6); // beats at 0.3, 0.8, 1.3
  });

  it('puts the anchor on the grid and never starts before 0', () => {
    expect(snapAnchored(4.4, 1, 0.3)).toBe(4.7); // the line at 5 minus the offset
    expect(snapAnchored(0.05, 1, 0.8)).toBe(0.2); // the line at 0 would start before 0, so the one at 1
    expect(snapAnchored(4.4, 1, 0)).toBe(snapTo(4.4, 1));
  });
});

describe('beatSnapper', () => {
  it('is null without a tempo', () => {
    expect(beatSnapper(null)).toBeNull();
  });

  it('rounds to the beat, and to the bar when asked, from the offset', () => {
    const snap = beatSnapper(beatGrid(120, '4'), 0.1)!;
    expect(snap(1.2, false)).toBe(1.1); // beats at 0.1, 0.6, 1.1, 1.6
    expect(snap(3.9, true)).toBe(4.1); // bars at 0.1, 2.1, 4.1
    expect(snap(0, false)).toBe(0.1);
  });
});
