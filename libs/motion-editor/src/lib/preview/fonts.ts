/** The CSS stacks of the six font names a design may use: system fonts, nothing to load. The twin of the server's `Fonts`. */
export const FONT_STACKS: Readonly<Record<string, string>> = {
  grotesk: '"Helvetica Neue", Arial, "Liberation Sans", sans-serif',
  heavy: '"Arial Black", "Helvetica Neue", Impact, sans-serif',
  mono: '"DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace',
  serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
  condensed: '"Arial Narrow", "Liberation Sans Narrow", Impact, sans-serif',
};

/** Whether the name is one of the six the server knows. */
export const knownFont = (name: string): boolean => Object.prototype.hasOwnProperty.call(FONT_STACKS, name);

/**
 * The CSS of a font name: the stack the server gave in its catalog, else the one of the six this library knows, else the name itself with a
 * generic family (a font the machine may not have).
 */
export function fontCss(name: string, stacks?: Readonly<Record<string, string>>): string {
  if (stacks && Object.prototype.hasOwnProperty.call(stacks, name)) return stacks[name];
  return knownFont(name) ? FONT_STACKS[name] : `${JSON.stringify(name)}, sans-serif`;
}

/** Whether the page can say what a font name draws with: the server's stack or one of the six. */
export const fontKnown = (name: string, stacks?: Readonly<Record<string, string>>): boolean => knownFont(name) || (stacks !== undefined && Object.prototype.hasOwnProperty.call(stacks, name));
