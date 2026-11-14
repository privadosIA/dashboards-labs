import { animationFileName } from './export-animation';

describe('animationFileName', () => {
  it('writes the title in plain letters', () => {
    expect(animationFileName('Neon Pulse')).toBe('neon-pulse.motion.json');
    expect(animationFileName('  ¡Canción de la mañana!  ')).toBe('cancion-de-la-manana.motion.json');
  });

  it('has a name even when the title has no letters, and keeps it short', () => {
    expect(animationFileName('***')).toBe('animation.motion.json');
    expect(animationFileName('a'.repeat(200)).length).toBeLessThanOrEqual(60 + '.motion.json'.length);
  });
});
