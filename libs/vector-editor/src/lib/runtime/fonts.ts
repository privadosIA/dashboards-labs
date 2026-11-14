/**
 * The CSS stacks of the six font names a design may use: system fonts, nothing to load (a part runs under a CSP with no `font-src` but `data:`).
 * A copy of `@lab/motion-editor/preview/fonts.ts`, by the rule that a library never imports another's internals; the server's `Fonts` is the origin.
 */
export const FONT_STACKS: Readonly<Record<string, string>> = {
  grotesk: '"Helvetica Neue", Arial, "Liberation Sans", sans-serif',
  heavy: '"Arial Black", "Helvetica Neue", Impact, sans-serif',
  mono: '"DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace',
  serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
  condensed: '"Arial Narrow", "Liberation Sans Narrow", Impact, sans-serif',
};

/** What `--display` and `--body` fall back to where no page defines them (the studio's canvas, a still SVG). */
const FALLBACK: Readonly<Record<'display' | 'body', string>> = { display: FONT_STACKS['heavy'], body: FONT_STACKS['grotesk'] };

/** The `font-family` of a text node: `display`/`body` follow the page's variables, a known name is its stack, anything else is the name itself. */
export function fontFamily(font: string): string {
  if (font === 'display' || font === 'body') return `var(--${font}, ${FALLBACK[font]})`;
  return Object.prototype.hasOwnProperty.call(FONT_STACKS, font) ? FONT_STACKS[font] : `${JSON.stringify(font)}, sans-serif`;
}
