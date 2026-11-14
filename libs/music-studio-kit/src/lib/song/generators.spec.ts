import { GENERATORS, GENERATOR_LABELS, GENERATOR_ORDER, defaultGenerator } from './generators';
import type { EngineStatus } from './model';

const engines = (...avail: boolean[]): EngineStatus[] => GENERATOR_ORDER.map((generator, i) => ({ generator, available: avail[i] ?? false }));

describe('generators', () => {
  it('lists HeartMuLa first and names the three', () => {
    expect(GENERATOR_ORDER).toEqual(['heartmula', 'ace-step', 'diffrhythm2']);
    expect(GENERATOR_LABELS['ace-step']).toBe('ACE-Step');
  });

  it('says what each one reads', () => {
    expect(GENERATORS.heartmula).toMatchObject({ style: 'tags', vocabulary: true, instrumental: true });
    expect(GENERATORS['ace-step']).toMatchObject({ style: 'sentence', vocabulary: false, instrumental: true });
    expect(GENERATORS.diffrhythm2).toMatchObject({ style: 'tags', vocabulary: false, instrumental: false, englishLyrics: true });
  });

  it('picks HeartMuLa when it is available, else the first one that is, else HeartMuLa so the screen can say why', () => {
    expect(defaultGenerator(engines(true, true, true))).toBe('heartmula');
    expect(defaultGenerator(engines(false, true, true))).toBe('ace-step');
    expect(defaultGenerator(engines(false, false, false))).toBe('heartmula');
    expect(defaultGenerator([])).toBe('heartmula');
  });

  it('keeps HeartMuLa when it is only stopped, because it can be started', () => {
    const stopped: EngineStatus[] = [{ generator: 'heartmula', available: false, reason: 'not_running' }, { generator: 'ace-step', available: true }, { generator: 'diffrhythm2', available: true }];
    expect(defaultGenerator(stopped)).toBe('heartmula');
  });
});
