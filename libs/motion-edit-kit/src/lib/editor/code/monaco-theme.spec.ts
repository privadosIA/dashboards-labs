import { cssToHex, themeFrom } from './monaco-theme';

const tokens = (surface: string): Record<string, string> => ({
  '--lab-surface': surface,
  '--lab-surface-high': '#222222',
  '--lab-ink': '#eeeeee',
  '--lab-ink-dim': '#999999',
  '--lab-line': '#333333',
  '--lab-accent': '#f5a000',
  '--lab-success': '#40c060',
  '--lab-warn': '#e0b000',
  '--lab-danger': '#e04040',
});

const theme = (values: Record<string, string>) => themeFrom((name) => values[name] ?? '', (v) => (v.startsWith('#') ? v : undefined));

describe('themeFrom', () => {
  it('takes the editor colours from the page tokens', () => {
    const t = theme(tokens('#101418'));
    expect(t.colors['editor.background']).toBe('#101418');
    expect(t.colors['editor.foreground']).toBe('#eeeeee');
    expect(t.colors['editorLineNumber.foreground']).toBe('#999999');
    expect(t.colors['editorCursor.foreground']).toBe('#f5a000');
    expect(t.colors['editor.selectionBackground']).toBe('#f5a0004d');
    expect(t.rules.find((r) => r.token === 'keyword')).toMatchObject({ foreground: 'f5a000', fontStyle: 'bold' });
    expect(t.rules.find((r) => r.token === 'string')?.foreground).toBe('40c060');
  });

  it('is dark on a dark surface and light on a light one', () => {
    expect(theme(tokens('#101418')).base).toBe('vs-dark');
    expect(theme(tokens('#fafaf5')).base).toBe('vs');
  });

  it('leaves out a colour it cannot read instead of inventing one', () => {
    const t = theme({ '--lab-ink': '#eeeeee' });
    expect(t.colors['editor.background']).toBeUndefined();
    expect(t.colors['editor.foreground']).toBe('#eeeeee');
    expect(t.base).toBe('vs-dark');
  });
});

describe('cssToHex', () => {
  it('keeps a hex colour as it is, in lowercase', () => {
    expect(cssToHex('#AABBCC')).toBe('#aabbcc');
    expect(cssToHex(' #aabbcc80 ')).toBe('#aabbcc80');
  });

  it('asks a canvas for any other colour, and says nothing where there is none', () => {
    expect(cssToHex('oklch(0.7 0.1 80)', () => null)).toBeUndefined();
    const pixel = new Uint8ClampedArray([245, 160, 0, 255]);
    const ctx = { clearRect: () => undefined, fillRect: () => undefined, fillStyle: '', getImageData: () => ({ data: pixel }) } as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
    expect(cssToHex('color-mix(in srgb, red, blue)', () => canvas)).toBe('#f5a000');
  });
});
