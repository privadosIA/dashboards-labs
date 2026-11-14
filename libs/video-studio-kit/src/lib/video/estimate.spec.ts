import { QUALITIES } from './model';
import { estimate } from './estimate';

describe('estimate', () => {
  it('is the same for the same settings', () => {
    const s = { duration: 12, quality: '1080p', audio: true } as const;
    expect(estimate(s)).toEqual(estimate({ ...s }));
  });

  it('never gets smaller with more duration, whatever the quality and audio', () => {
    for (const quality of QUALITIES) {
      for (const audio of [true, false]) {
        let before = estimate({ duration: 4, quality, audio });
        for (let duration = 5; duration <= 30; duration++) {
          const now = estimate({ duration, quality, audio });
          expect(now.seconds).toBeGreaterThanOrEqual(before.seconds);
          expect(now.megabytes).toBeGreaterThanOrEqual(before.megabytes);
          before = now;
        }
      }
    }
  });

  it('never gets smaller with a higher quality, at any duration', () => {
    for (let duration = 4; duration <= 30; duration++) {
      for (const audio of [true, false]) {
        const [low, mid, high] = QUALITIES.map((quality) => estimate({ duration, quality, audio }));
        expect(mid.seconds).toBeGreaterThanOrEqual(low.seconds);
        expect(high.seconds).toBeGreaterThanOrEqual(mid.seconds);
        expect(mid.megabytes).toBeGreaterThanOrEqual(low.megabytes);
        expect(high.megabytes).toBeGreaterThanOrEqual(mid.megabytes);
      }
    }
  });

  it('gives more for 20 seconds than for 5', () => {
    const base = { quality: '720p', audio: true } as const;
    expect(estimate({ ...base, duration: 20 }).seconds).toBeGreaterThan(estimate({ ...base, duration: 5 }).seconds);
    expect(estimate({ ...base, duration: 20 }).megabytes).toBeGreaterThan(estimate({ ...base, duration: 5 }).megabytes);
  });
});
