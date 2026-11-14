// The answer to the pointer lives in one global stylesheet (src/theme/_interaction.scss): this reads it and checks the rules that keep it
// honest. The browser behaviour (the computed transform on hover and press) is checked with a script in the restyle's verification.
import { readSource } from '../testing/tokens';

const scss = readSource('src/theme/_interaction.scss');
const code = scss
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('the interaction stylesheet', () => {
  it('is included once from the global styles', () => {
    expect(readSource('src/styles.scss')).toContain("@use 'theme/interaction';");
  });

  it('reaches every Material button and the cards marked .lab-pressable, and only the enabled ones', () => {
    expect(code).toContain('.mat-mdc-button-base#{$enabled}');
    expect(code).toContain('.lab-pressable#{$enabled}');
    for (const guard of [':not([disabled])', ':not([aria-disabled="true"])', ':not(.mat-mdc-button-disabled)']) {
      expect(code.split('$enabled:')[1].split(';')[0]).toContain(guard);
    }
  });

  it('lifts on hover, presses on activation and softens a shadow from the tokens', () => {
    expect(code).toContain('translateY(-1px)');
    expect(code).toContain('scale(0.98)');
    expect(code).toMatch(/box-shadow:\s*var\(--lab-elev-hover\)/);
  });

  it('answers only when the person has not asked for reduced motion, and only where there is a pointer that hovers', () => {
    expect(code.trim().startsWith('$enabled')).toBe(true);
    expect(code).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(code).toContain('@media (hover: hover)');
    // everything that moves is inside the reduced-motion guard: nothing comes before it but the Sass variables
    const before = code.slice(0, code.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(before).not.toMatch(/transform:|transition:|box-shadow:/);
  });

  it('uses the app\'s easing and length from the tokens, never a colour or a curve of its own', () => {
    expect(code).toContain('var(--lab-ease)');
    expect(code).toContain('var(--lab-dur)');
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|cubic-bezier|ease-in|ease-out|linear/i);
  });

  it('does not touch the focus ring', () => {
    expect(code).not.toMatch(/(^|[\s;{])outline(-\w+)?\s*:|:focus/);
  });

  it('lets icon buttons lift but not sink, and gives text and icon buttons no shadow', () => {
    expect(code).toMatch(/\.mat-mdc-icon-button#\{\$enabled\}:active\s*\{\s*transform:\s*\$lift/);
    const shadowed = code.slice(code.indexOf('.mat-mdc-unelevated-button'), code.indexOf('box-shadow'));
    expect(shadowed).not.toContain('.mat-mdc-icon-button');
    expect(shadowed).not.toContain('.mat-mdc-button#');
  });
});
