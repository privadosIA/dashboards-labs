import { EASE_LAB, EASE_LAB_POINTS, prefersReducedMotion } from './motion';

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the owner easing the same way in CSS and in numbers', () => {
    expect(EASE_LAB).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(EASE_LAB).toBe(`cubic-bezier(${EASE_LAB_POINTS.join(', ')})`);
  });

  it('reads the reduced-motion preference of the system', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
