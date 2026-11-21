// The theme tokens must stay legible: every text/background pair the app actually draws reaches WCAG AA in both
// themes. The values are read from the real tokens file, so changing a colour there cannot silently break contrast.
import { tokens } from '../testing/tokens';

type Pair = [string, string];

const { light, dark } = tokens();
const t = (name: string, theme: 'light' | 'dark'): string => (theme === 'light' ? light : dark)[name];

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['lab-bg', 'lab-surface', 'lab-surface-high'];

/** Normal text: 4.5:1. */
const TEXT: Pair[] = [
  ...SURFACES.flatMap((s): Pair[] => [['lab-ink', s], ['lab-ink-dim', s], ['lab-accent', s], ['lab-warn', s], ['lab-success', s], ['lab-danger', s]]),
  ['lab-on-accent', 'lab-accent'],
];

/** Large text and the parts of controls that identify them: 3:1. */
const GRAPHICAL: Pair[] = SURFACES.flatMap((s): Pair[] => [['lab-control-line', s], ['lab-accent', s], ['lab-focus', s]]);

describe('theme contrast (WCAG AA)', () => {
  it('reads the declared tokens from the real file', () => {
    for (const name of ['lab-bg', 'lab-surface', 'lab-surface-high', 'lab-ink', 'lab-ink-dim', 'lab-accent', 'lab-warn', 'lab-on-accent', 'lab-success', 'lab-danger', 'lab-control-line']) {
      expect(light[name], `light ${name}`).toBeTruthy();
      expect(dark[name], `dark ${name}`).toBeTruthy();
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`every text pair reaches 4.5:1 in the ${theme} theme`, () => {
      const failures = TEXT.map(([fg, bg]) => ({ fg, bg, v: contrast(t(fg, theme), t(bg, theme)) })).filter((x) => x.v < 4.5);
      expect(failures.map((f) => `${f.fg} on ${f.bg}: ${f.v.toFixed(2)}`)).toEqual([]);
    });

    it(`every control outline and accent mark reaches 3:1 in the ${theme} theme`, () => {
      const failures = GRAPHICAL.map(([fg, bg]) => ({ fg, bg, v: contrast(t(fg, theme), t(bg, theme)) })).filter((x) => x.v < 3);
      expect(failures.map((f) => `${f.fg} on ${f.bg}: ${f.v.toFixed(2)}`)).toEqual([]);
    });
  }

  // The accent also tints a fill (the selected toggle, the active row of the menu, a row under the pointer): the text drawn on it must stay legible.
  const TINTS: Array<[string, number]> = [['selected toggle', 0.14], ['hovered row', 0.08]];
  const mix = (a: string, b: string, share: number): string =>
    '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * share + parseInt(b.slice(i, i + 2), 16) * (1 - share)).toString(16).padStart(2, '0')).join('');

  for (const theme of ['dark', 'light'] as const) {
    it(`keeps the accent text and the ink legible on the accent tints in the ${theme} theme`, () => {
      const failures = TINTS.flatMap(([what, share]) =>
        SURFACES.flatMap((s) =>
          ['lab-accent', 'lab-ink'].map((fg) => ({ what, fg, s, v: contrast(t(fg, theme), mix(t('lab-accent', theme), t(s, theme), share)) })),
        ),
      ).filter((x) => x.v < 4.5);
      expect(failures.map((f) => `${f.fg} on ${f.what} over ${f.s}: ${f.v.toFixed(2)}`)).toEqual([]);
    });
  }

  it('computes the ratio like the WCAG definition', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('does not treat the decorative divider as a control outline', () => {
    // --lab-line is allowed to be quiet (1.4:1); controls use --lab-control-line.
    expect(contrast(dark['lab-line'], dark['lab-surface'])).toBeLessThan(3);
    expect(contrast(dark['lab-control-line'], dark['lab-surface'])).toBeGreaterThanOrEqual(3);
  });

  // The charts draw their series with these tokens (accent, success, danger, dim), on the panel's surface: a mark needs 3:1 against it.
  for (const theme of ['dark', 'light'] as const) {
    it(`every chart series colour reaches 3:1 against the surface it is drawn on in the ${theme} theme`, () => {
      const failures = ['lab-accent', 'lab-success', 'lab-danger', 'lab-ink-dim']
        .map((fg) => ({ fg, v: contrast(t(fg, theme), t('lab-surface', theme)) }))
        .filter((x) => x.v < 3);
      expect(failures.map((f) => `${f.fg}: ${f.v.toFixed(2)}`)).toEqual([]);
    });
  }
});

