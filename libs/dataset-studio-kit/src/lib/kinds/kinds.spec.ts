import { KINDS, briefFits, generationMode, isTupleKind, kindOf } from './kinds';

describe('kinds', () => {
  it('has the five kinds, each one once', () => {
    expect(KINDS.map((k) => k.id)).toEqual(['video', 'images', 'graphics', 'songs', 'piece']);
  });

  it('reads Images as a video project in images mode and the piece as no import mode', () => {
    expect(kindOf('images')).toMatchObject({ mode: 'video', images: true });
    expect(kindOf('piece').mode).toBe('animation');
    expect(isTupleKind(kindOf('piece'))).toBe(false);
    expect(KINDS.filter(isTupleKind).map((k) => k.id)).toEqual(['video', 'images', 'graphics', 'songs']);
  });

  it('shows the negative and the look only for video and images, the generator for songs and the parts for graphics', () => {
    expect(KINDS.filter((k) => k.panels.negative).map((k) => k.id)).toEqual(['video', 'images']);
    expect(KINDS.filter((k) => k.panels.look).map((k) => k.id)).toEqual(['video', 'images']);
    expect(KINDS.filter((k) => k.panels.generator).map((k) => k.id)).toEqual(['songs']);
    expect(KINDS.filter((k) => k.panels.parts).map((k) => k.id)).toEqual(['graphics']);
  });

  it('limits every brief to what the server\'s writers take', () => {
    expect(KINDS.every((k) => k.limit === 2000)).toBe(true);
  });

  it('counts a brief against the limit', () => {
    expect(briefFits(kindOf('video'), 'x'.repeat(2000))).toEqual({ ok: true, length: 2000 });
    expect(briefFits(kindOf('video'), 'x'.repeat(2100))).toEqual({ ok: false, length: 2100 });
  });

  it('uses one line per scene until the server lists the dataset feature, and then one sentence, for the three kinds that need it', () => {
    for (const id of ['video', 'images', 'graphics'] as const) {
      expect(generationMode(kindOf(id), ['plan'])).toBe('lines');
      expect(generationMode(kindOf(id), ['plan', 'dataset'])).toBe('sentence');
    }
    expect(generationMode(kindOf('songs'), ['dataset'])).toBe('track');
    expect(generationMode(kindOf('piece'), [])).toBe('plan');
  });
});
