import type { VideoEdit } from '../video-edit/model';
import type { Generation } from '../video/model';

/** One card of the history: a generation or a video edit. */
export type HistoryItem = { kind: 'generation'; id: string; generation: Generation } | { kind: 'edit'; id: string; edit: VideoEdit };

const time = (iso: string | undefined): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? -Infinity : ms;
};

/**
 * The generations and the edits as one list, newest first. Both lists come newest first already, so this merges them
 * and keeps each one's own order; a generation without a date (a history saved before dates were kept) counts as older
 * than everything, and on a tie the generation comes first.
 */
export function mergeHistory(generations: readonly Generation[], edits: readonly VideoEdit[]): HistoryItem[] {
  const out: HistoryItem[] = [];
  let g = 0;
  let e = 0;
  while (g < generations.length || e < edits.length) {
    const takeGeneration = e >= edits.length || (g < generations.length && time(generations[g].createdAt) >= time(edits[e].createdAt));
    if (takeGeneration) out.push({ kind: 'generation', id: generations[g].id, generation: generations[g++] });
    else out.push({ kind: 'edit', id: edits[e].id, edit: edits[e++] });
  }
  return out;
}
