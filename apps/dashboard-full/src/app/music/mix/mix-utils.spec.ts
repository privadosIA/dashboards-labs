import { Mix, MixManifestEntry } from '../../core/api.models';
import { beatGrid, estimateLoudness, beatsPerBar, clipEnd, overlapFades, clock, liveGain, mixIsCurrent, nudgeStep, snapTo, tickStep, usedRange } from './mix-utils';

describe('usedRange and clipEnd', () => {
  it('uses the whole file by default', () => {
    expect(usedRange({ track: 'a' }, 30)).toEqual({ from: 0, to: 30, used: 30 });
  });
  it('applies the trims and clamps them to the file', () => {
    expect(usedRange({ track: 'a', trim_start: 1.7, trim_end: 24.9 }, 30)).toEqual({ from: 1.7, to: 24.9, used: 24.9 - 1.7 });
    expect(usedRange({ track: 'a', trim_end: 99 }, 30).to).toBe(30);
  });
  it('never leaves less than a tenth of a second, and draws an unknown length as ten seconds', () => {
    expect(usedRange({ track: 'a', trim_start: 5, trim_end: 5 }, 30).used).toBeCloseTo(0.1);
    expect(usedRange({ track: 'a' }, null).used).toBe(10);
  });
  it('ends where start plus the used part ends', () => {
    expect(clipEnd({ track: 'a', start: 22.1, trim_start: 1.6, trim_end: 26.2 }, 30)).toBeCloseTo(22.1 + 24.6);
  });
});

describe('snapTo, tickStep, clock and nudgeStep', () => {
  it('snaps to the grid and keeps free values to the millisecond', () => {
    expect(snapTo(4.6, 1)).toBe(5);
    expect(snapTo(4.4, 0.5)).toBe(4.5);
    expect(snapTo(4.12345, 0)).toBe(4.123);
  });
  it('spaces the ruler marks at least 70 px apart', () => {
    expect(tickStep(100)).toBe(1);
    expect(tickStep(20)).toBe(5);
    expect(tickStep(4)).toBe(30);
  });
  it('formats m:ss', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75)).toBe('1:15');
    expect(clock(600)).toBe('10:00');
  });
  it('moves by the grid step, or a tenth without it, and ten times more with shift', () => {
    expect(nudgeStep(1, false)).toBe(1);
    expect(nudgeStep(0, false)).toBe(0.1);
    expect(nudgeStep(0.5, true)).toBe(5);
  });
});

describe('mixIsCurrent', () => {
  const mix: Mix = { id: 'm', clips: [{ track: 'a' }, { file: 'v.mp3', start: 5, gain: 0.8 }] };
  const entry = (clips: MixManifestEntry['clips']): MixManifestEntry => ({ id: 'm', file: 'out/s/m.mp3', audio_seconds: 30, hash: 'h', clips });
  it('matches a render of the same clips, whatever the defaults are spelled like', () => {
    expect(
      mixIsCurrent(mix, entry([{ track: 'a', variant: 1, start: 0, gain: 1, fade_in: 0, fade_out: 0 }, { file: 'v.mp3', start: 5, gain: 0.8 }])),
    ).toBe(true);
  });
  it('is stale when the master volume or the normalisation differ from the render', () => {
    const clips = [{ track: 'a', start: 0, gain: 1 }, { file: 'v.mp3', start: 5, gain: 0.8 }];
    expect(mixIsCurrent({ ...mix, gain: 0.8 }, entry(clips))).toBe(false);
    expect(mixIsCurrent({ ...mix, gain: 0.8 }, { ...entry(clips), gain: 0.8 })).toBe(true);
    expect(mixIsCurrent({ ...mix, normalize: true }, entry(clips))).toBe(false);
    expect(mixIsCurrent(mix, { ...entry(clips), normalize: true })).toBe(false);
    expect(mixIsCurrent({ ...mix, gain: 1 }, entry(clips))).toBe(true); // 1 is the default
  });
  it('is stale when a clip changed, was added or there is no render', () => {
    expect(mixIsCurrent(mix, entry([{ track: 'a', start: 0, gain: 1 }, { file: 'v.mp3', start: 6, gain: 0.8 }]))).toBe(false);
    expect(mixIsCurrent(mix, entry([{ track: 'a', start: 0, gain: 1 }]))).toBe(false);
    expect(mixIsCurrent(mix, null)).toBe(false);
  });
});

describe('liveGain', () => {
  it('is the clip volume, and 1 without one', () => {
    expect(liveGain({ track: 'a' }, 5, 0, 30)).toBe(1);
    expect(liveGain({ track: 'a', gain: 1.5 }, 5, 0, 30)).toBe(1.5);
  });

  it('fades in from the start of the used part, in a straight line', () => {
    const clip = { track: 'a', gain: 0.8, fade_in: 4 };
    expect(liveGain(clip, 2, 2, 30)).toBe(0); // the first used second
    expect(liveGain(clip, 4, 2, 30)).toBeCloseTo(0.4);
    expect(liveGain(clip, 6, 2, 30)).toBeCloseTo(0.8);
    expect(liveGain(clip, 20, 2, 30)).toBeCloseTo(0.8);
  });

  it('fades out towards the end of the used part', () => {
    const clip = { track: 'a', fade_out: 5 };
    expect(liveGain(clip, 20, 0, 30)).toBe(1);
    expect(liveGain(clip, 27.5, 0, 30)).toBeCloseTo(0.5);
    expect(liveGain(clip, 30, 0, 30)).toBe(0);
  });

  it('does not apply the mute: a track listened to alone always sounds', () => {
    expect(liveGain({ track: 'a', mute: true, gain: 0.7 }, 5, 0, 30)).toBe(0.7);
  });
});

describe('beatGrid', () => {
  it('gives the beat and the bar of a tempo', () => {
    expect(beatGrid(120, '4')).toEqual({ bpm: 120, beat: 0.5, bar: 2, perBar: 4 });
    expect(beatGrid(90, '3')?.bar).toBeCloseTo(2, 6);
  });

  it('has no grid without a usable tempo', () => {
    for (const bpm of [undefined, 0, 10, 1000, Number.NaN]) expect(beatGrid(bpm, '4')).toBeNull();
  });

  it('reads the time signature, and falls back to four beats', () => {
    expect(beatsPerBar('6')).toBe(6);
    for (const ts of [undefined, '', 'x', '0', '40']) expect(beatsPerBar(ts)).toBe(4);
  });
});

describe('overlapFades', () => {
  const a = { track: 'a' }; // 20 s long in these tests
  it('fades the earlier clip out and the later one in over the overlap', () => {
    const clips = [{ ...a }, { track: 'b', start: 16 }];
    expect(overlapFades(clips, [20, 20])).toEqual([
      { index: 0, patch: { fade_out: 4 } },
      { index: 1, patch: { fade_in: 4 } },
    ]);
  });

  it('follows the order in time, not the order in the list, and counts the trims', () => {
    const clips = [{ track: 'b', start: 8 }, { ...a, trim_end: 10 }];
    // a plays 0-10, b starts at 8 -> 2 s overlap; b is the clip at index 0
    expect(overlapFades(clips, [20, 20])).toEqual([
      { index: 0, patch: { fade_in: 2 } },
      { index: 1, patch: { fade_out: 2 } },
    ]);
  });

  it('never fades longer than the shorter clip, ignores gaps, tiny overlaps and muted clips', () => {
    expect(overlapFades([{ ...a, trim_end: 10 }, { track: 'b', start: 5, trim_end: 2 }], [20, 20])).toEqual([
      { index: 0, patch: { fade_out: 2 } },
      { index: 1, patch: { fade_in: 2 } },
    ]);
    expect(overlapFades([{ ...a }, { track: 'b', start: 25 }], [20, 20])).toEqual([]);
    expect(overlapFades([{ ...a }, { track: 'b', start: 19.98 }], [20, 20])).toEqual([]);
    expect(overlapFades([{ ...a }, { track: 'b', start: 10, mute: true }], [20, 20])).toEqual([]);
  });

  it('returns nothing the second time', () => {
    const clips = [{ ...a, fade_out: 4 }, { track: 'b', start: 16, fade_in: 4 }];
    expect(overlapFades(clips, [20, 20])).toEqual([]);
  });
});

describe('estimateLoudness', () => {
  it('is the loudness of a single clip, and 6 dB louder with twice its volume', () => {
    expect(estimateLoudness([{ start: 0, used: 20, lufs: -20, gain: 1 }])).toBeCloseTo(-20, 6);
    expect(estimateLoudness([{ start: 5, used: 20, lufs: -20, gain: 2 }])).toBeCloseTo(-13.98, 2);
  });

  it('adds the power of clips that overlap, averaged over the time anything plays', () => {
    // two equal clips on top of each other: +3 dB
    expect(estimateLoudness([{ start: 0, used: 10, lufs: -20, gain: 1 }, { start: 0, used: 10, lufs: -20, gain: 1 }])).toBeCloseTo(-16.99, 2);
    // one after the other: the same loudness, a gap in between is not counted
    expect(estimateLoudness([{ start: 0, used: 10, lufs: -20, gain: 1 }, { start: 30, used: 10, lufs: -20, gain: 1 }])).toBeCloseTo(-20, 6);
  });

  it('has nothing to say without audible clips', () => {
    expect(estimateLoudness([])).toBeNull();
    expect(estimateLoudness([{ start: 0, used: 10, lufs: -20, gain: 0 }])).toBeNull();
    expect(estimateLoudness([{ start: 0, used: 0, lufs: -20, gain: 1 }])).toBeNull();
  });
});
