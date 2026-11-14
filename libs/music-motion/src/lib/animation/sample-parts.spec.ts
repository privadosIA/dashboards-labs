import { BUILT_IN_DATASET } from './dataset';

/** The three own parts of the sample carry the text of a part, and that text keeps the part contract. */
describe('the own parts of the sample', () => {
  const parts = BUILT_IN_DATASET.parts ?? [];

  it('are the three of the sample, each with a manifest and a fragment', () => {
    expect(parts.map((p) => p.name)).toEqual(['confetti-burst', 'ticker-tape', 'pulse-ring']);
    for (const p of parts) {
      expect(p.manifest).toMatchObject({ name: p.name, version: 1 });
      expect(typeof p.fragment).toBe('string');
      const params = (p.manifest as { params: { name: string; default: string }[] }).params;
      expect(params.length).toBeGreaterThanOrEqual(1);
      expect(params.length).toBeLessThanOrEqual(2);
      for (const q of params) expect(q.default).not.toBe('');
    }
  });

  it.each(['confetti-burst', 'ticker-tape', 'pulse-ring'])('%s follows the part contract', (name) => {
    const f = parts.find((p) => p.name === name)!.fragment!;
    expect(f).toContain('__partSeek');
    expect(f).toContain('__params');
    for (const banned of [/Math\.random/, /Date\.now/, /performance\.now/, /__seek\s*=/, /transition/i, /@keyframes/i, /https?:/i]) expect(f).not.toMatch(banned);
  });
});
