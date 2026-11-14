/** The two Monaco themes are the `--lab-*` values of the page at the time, so the editor follows the dashboard's own light and dark. */

export interface MonacoThemeData {
  readonly base: 'vs' | 'vs-dark';
  readonly inherit: true;
  // Monaco's own types are mutable, so these are too.
  rules: { token: string; foreground?: string; fontStyle?: string }[];
  colors: Record<string, string>;
}

/** The tokens the theme reads, by what they colour. */
const TOKENS = {
  surface: '--lab-surface',
  surfaceHigh: '--lab-surface-high',
  ink: '--lab-ink',
  dim: '--lab-ink-dim',
  line: '--lab-line',
  accent: '--lab-accent',
  success: '--lab-success',
  warn: '--lab-warn',
  danger: '--lab-danger',
} as const;

type Role = keyof typeof TOKENS;

/** Any CSS colour as `#rrggbb` (or `#rrggbbaa`), asked of a canvas so that `oklch()` or `color-mix()` come out right. Undefined where there is no canvas. */
export function cssToHex(value: string, canvas: () => HTMLCanvasElement | null = () => document.createElement('canvas')): string | undefined {
  const plain = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(plain)) return plain;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas()?.getContext('2d', { willReadFrequently: true }) ?? null;
  } catch {
    ctx = null;
  }
  if (!ctx) return undefined;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const h = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${a < 255 ? h(a) : ''}`;
}

const luminance = (hex: string): number => {
  const n = (i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return 0.2126 * n(0) + 0.7152 * n(1) + 0.0722 * n(2);
};

/** `#rrggbb` with an alpha, for the selection and the highlights. */
const withAlpha = (hex: string, alpha: number): string => `${hex.slice(0, 7)}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

/**
 * The theme for the page as it is now. `read` gives the value of a custom property; a colour that cannot be read (no canvas, as in a test)
 * is left out so that Monaco's own base theme colours it.
 */
export function themeFrom(read: (name: string) => string, toHex: (value: string) => string | undefined = (v) => cssToHex(v)): MonacoThemeData {
  const hex = (role: Role): string | undefined => {
    const raw = read(TOKENS[role]);
    return raw ? toHex(raw) : undefined;
  };
  const surface = hex('surface');
  const dark = surface ? luminance(surface) < 0.5 : true;
  const ink = hex('ink');
  const dim = hex('dim');
  const line = hex('line');
  const accent = hex('accent');
  const success = hex('success');
  const warn = hex('warn');
  const colors: Record<string, string> = {};
  const set = (key: string, value: string | undefined): void => {
    if (value) colors[key] = value;
  };
  set('editor.background', surface);
  set('editor.foreground', ink);
  set('editorLineNumber.foreground', dim);
  set('editorLineNumber.activeForeground', ink);
  set('editorCursor.foreground', accent);
  set('editor.selectionBackground', accent && withAlpha(accent, 0.3));
  set('editor.inactiveSelectionBackground', accent && withAlpha(accent, 0.15));
  set('editor.lineHighlightBackground', hex('surfaceHigh'));
  set('editorGutter.background', surface);
  set('editorWidget.background', hex('surfaceHigh'));
  set('editorWidget.border', line);
  set('editorSuggestWidget.background', hex('surfaceHigh'));
  set('editorSuggestWidget.border', line);
  set('editorSuggestWidget.selectedBackground', accent && withAlpha(accent, 0.25));
  set('editorHoverWidget.background', hex('surfaceHigh'));
  set('editorHoverWidget.border', line);
  set('editorIndentGuide.background1', line);
  set('editorError.foreground', hex('danger'));
  set('editorWarning.foreground', warn);
  set('focusBorder', accent);
  const rule = (token: string, foreground: string | undefined, fontStyle?: string): { token: string; foreground?: string; fontStyle?: string } => ({
    token,
    ...(foreground ? { foreground: foreground.slice(1, 7) } : {}),
    ...(fontStyle ? { fontStyle } : {}),
  });
  return {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [rule('keyword', accent, 'bold'), rule('string', success), rule('number', warn), rule('comment', dim, 'italic'), rule('delimiter', dim)],
    colors,
  };
}
