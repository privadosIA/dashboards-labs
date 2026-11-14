/** How a catalog name is written in code and back: `glass-card` is `glassCard`, `verse_style` is `verseStyle`. */

export const camelName = (name: string): string => name.replace(/[-_]([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export const snakeName = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The keys of a piece in the script JSON, and the ones only the code has: an `extra` key cannot be any of them. */
export const PIECE_JSON_KEYS = ['id', 'start', 'end', 'section', 'part', 'params', 'mode', 'lines', 'hit', 'stage', 'with', 'design', 'animate'] as const;
export const PIECE_CODE_KEYS = ['id', 'from', 'to', 'part', 'mode', 'section', 'with', 'lines', 'hit', 'stage', 'design', 'extra'] as const;
export const RESERVED_EXTRA_KEYS: readonly string[] = [...new Set<string>([...PIECE_JSON_KEYS, ...PIECE_CODE_KEYS])];
