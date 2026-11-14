import type { Song } from '@lab/animation-core';

/** The versions of one track of one project, which the library lists as separate songs. */
export interface SongGroup {
  readonly id: string;
  readonly project: string;
  readonly trackId: string;
  /** Versions in order, the first being the lowest `variant`. */
  readonly versions: readonly Song[];
}

/** The songs grouped by project and track, in the order their first version appears (the library lists the newest first). */
export function groupSongs(songs: readonly Song[]): SongGroup[] {
  const groups = new Map<string, Song[]>();
  for (const s of songs) {
    const id = `${s.project}/${s.trackId}`;
    groups.set(id, [...(groups.get(id) ?? []), s]);
  }
  return [...groups].map(([id, versions]) => {
    const sorted = [...versions].sort((a, b) => a.variant - b.variant);
    return { id, project: sorted[0].project, trackId: sorted[0].trackId, versions: sorted };
  });
}
