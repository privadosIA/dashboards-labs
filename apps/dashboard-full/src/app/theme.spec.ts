// Contract tests for the token system and theme: every colour token has a light and a dark value, the data-theme
// blocks agree with them, and the global theme is built from the token palette with the system font stack (the default Material look,
// Roboto and the azure prebuilt, must be unreachable).
import { readSource, tokens } from '../testing/tokens';

const { text: tokensScss, light, dark } = tokens();
const stylesScss = readSource('src/styles.scss');

const PALETTE_TOKENS = ['lab-bg', 'lab-surface', 'lab-surface-high', 'lab-ink', 'lab-ink-dim', 'lab-line', 'lab-accent', 'lab-success', 'lab-danger'];

describe('design tokens', () => {
  for (const token of PALETTE_TOKENS) {
    it(`defines --${token} as a colour for both themes`, () => {
      expect(light[token]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark[token]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  }

  it('pins the same values in the data-theme blocks as in the light and dark ones', () => {
    for (const [theme, values] of [['dark', dark], ['light', light]] as const) {
      const start = tokensScss.indexOf(`:root[data-theme='${theme}']`);
      const block = tokensScss.slice(start, tokensScss.indexOf('}', start));
      for (const [name, value] of Object.entries(values)) {
        if (/^#/.test(value)) expect(block, `${theme} ${name}`).toContain(`--${name}: ${value};`);
      }
    }
  });

  it('defines the typography families and the six-step scale (body 14 px, meta 12 px)', () => {
    expect(tokensScss).toContain("--lab-font: 'Geist Variable'");
    expect(tokensScss).toContain("--lab-font-display: 'Plus Jakarta Sans Variable'");
    expect(tokensScss).toContain("--lab-font-mono: ui-monospace");
    for (const step of ['meta: 12px', 'body: 14px', 'section: 15px', 'title: 24px', 'page: 36px', 'hero: 44px']) {
      expect(tokensScss).toContain(`--lab-fs-${step}`);
    }
  });

  it('keeps body text at least 14 px and secondary text at least 12 px', () => {
    const px = (name: string) => Number(new RegExp(`--lab-fs-${name}:\\s*(\\d+)px`).exec(tokensScss)?.[1]);
    expect(px('body')).toBeGreaterThanOrEqual(14);
    expect(px('meta')).toBeGreaterThanOrEqual(12);
  });

  it('defines one spacing scale, the shape radii and the control heights', () => {
    for (const [i, v] of [[1, 4], [2, 8], [3, 12], [4, 16], [5, 24], [6, 32], [7, 48]]) {
      expect(tokensScss).toContain(`--lab-space-${i}: ${v}px`);
    }
    for (const t of ['--lab-radius-panel: 20px', '--lab-radius-control: 12px', '--lab-control-h: 40px', '--lab-control-h-compact: 32px']) {
      expect(tokensScss).toContain(t);
    }
  });
});

describe('theme', () => {
  it('builds Material from the tokens, not the default look', () => {
    expect(stylesScss).toContain('@include mat.theme');
    expect(stylesScss).toContain('plain-family: var(--lab-font)');
    expect(stylesScss).toContain('brand-family: var(--lab-font-display)');
    expect(stylesScss).toContain('--mat-sys-primary: var(--lab-accent)');
    expect(stylesScss).toContain('--mat-sys-surface: var(--lab-bg)');
    expect(stylesScss).toContain('--mat-sys-error: var(--lab-danger)');
    const code = stylesScss
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/roboto/i);
    expect(code).not.toMatch(/azure/i);
  });

  it('starts dark and switches with data-theme', () => {
    expect(readSource('src/index.html')).toContain('data-theme="dark"');
    expect(tokensScss).toMatch(/:root\[data-theme='dark'\]\s*{\s*color-scheme:\s*dark/);
    expect(tokensScss).toMatch(/:root\[data-theme='light'\]\s*{\s*color-scheme:\s*light/);
  });

  it('keeps the accessibility floor: visible focus and reduced motion', () => {
    expect(stylesScss).toContain(':focus-visible');
    expect(stylesScss).toContain('prefers-reduced-motion');
  });
});

describe('type', () => {
  const angularJson = JSON.parse(readSource('../../angular.json')) as { projects: Record<string, { architect: { build: { options: { styles: string[] } } } }> };
  const styles = angularJson.projects['dashboard-full'].architect.build.options.styles;
  const code = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('serves both faces itself: their stylesheets are listed in angular.json and nothing is fetched from another site', () => {
    expect(styles).toContain('@fontsource-variable/plus-jakarta-sans/index.css');
    expect(styles).toContain('@fontsource-variable/geist/index.css');
    for (const text of [code(stylesScss), code(tokensScss), readSource('src/index.html')]) {
      expect(text).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(text).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
    }
  });

  it('sets headings in the display face with tight letter spacing', () => {
    const rule = /h1,\s*h2,\s*h3,\s*h4,[^{]*\{([^}]*)\}/.exec(stylesScss)?.[1] ?? '';
    expect(rule).toContain('font-family: var(--lab-font-display)');
    expect(rule).toContain('letter-spacing: var(--lab-tracking-tight)');
    expect(tokensScss).toMatch(/--lab-tracking-tight:\s*-0\.0\d+em/);
  });
});

