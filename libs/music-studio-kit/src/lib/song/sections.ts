/** The section tags HeartMuLa and DiffRhythm2 read in the lyrics, in the order a song usually takes them. */
export const STRUCTURE_TAGS = ['intro', 'verse', 'chorus', 'bridge', 'outro', 'inst', 'solo', 'hook', 'break', 'end'] as const;
export type StructureTag = (typeof STRUCTURE_TAGS)[number];

/** The text after an edit and where the cursor goes. */
export interface Edit {
  text: string;
  cursor: number;
}

/**
 * Writes `[tag]` on a line of its own where the cursor is (or in place of the selection from `start` to `end`): a break
 * before it unless it starts a line, a break after it unless one is already there. The cursor ends at the start of the
 * line that follows the tag.
 */
export function insertSection(text: string, start: number, end: number, tag: StructureTag): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before !== '' && !before.endsWith('\n') ? '\n' : '';
  const trail = after.startsWith('\n') ? '' : '\n';
  const line = `[${tag}]`;
  return { text: before + lead + line + trail + after, cursor: before.length + lead.length + line.length + 1 };
}
