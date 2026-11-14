import { period, snapBoundary, snapHit, snapToSections } from './snap';

const beats = Array.from({ length: 41 }, (_, i) => i * 0.5);
const map = { beats, sections: [{ tag: 'verse', start: 0, end: 10.1 }, { tag: 'chorus', start: 10.1, end: 20 }] };

describe('snap', () => {
  it('measures the period as the usual gap between beats', () => {
    expect(period(map)).toBe(0.5);
    expect(period({ beats: [] })).toBe(0);
    expect(period({ beats: [3] })).toBe(0);
  });

  it('lands a cut on the nearest beat within half a beat', () => {
    expect(snapBoundary(10.18, map)).toBe(10);
    expect(snapBoundary(10.3, map)).toBe(10.5);
  });

  it('leaves a time that is not near any beat, and a song with no beats', () => {
    expect(snapBoundary(21.3, map)).toBe(21.3);
    expect(snapBoundary(7.1, { beats: [] })).toBe(7.1);
  });

  it('prefers a section boundary within half a beat when it is closer than a beat', () => {
    expect(snapToSections(10.12, map)).toBe(10.1);
    expect(snapToSections(10.3, map)).toBe(10.5);
    expect(snapToSections(10.0, { ...map, sections: [] })).toBe(10);
  });

  it('snaps a word hit to the nearest half beat', () => {
    expect(snapHit(5.3, map)).toBe(5.25);
    expect(snapHit(5.4, map)).toBe(5.5);
    expect(snapHit(2.2, { beats: [] })).toBe(2.2);
  });
});
