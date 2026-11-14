import type { Song } from '@lab/animation-core';
import { groupSongs } from './group';

const song = (project: string, trackId: string, variant: number): Song => ({ key: `${project}/${trackId}/${variant}`, project, trackId, variant, title: `${project} ${variant}`, seconds: 10, instrumental: false });

describe('groupSongs', () => {
  it('puts the versions of a track together, in order of version, and keeps the order the groups first appear in', () => {
    const groups = groupSongs([song('b', 't', 1), song('a', 't', 0), song('b', 't', 0), song('a', 'u', 0)]);
    expect(groups.map((g) => g.id)).toEqual(['b/t', 'a/t', 'a/u']);
    expect(groups[0].versions.map((v) => v.variant)).toEqual([0, 1]);
    expect(groups[1].versions).toHaveLength(1);
  });

  it('gives nothing for no songs', () => {
    expect(groupSongs([])).toEqual([]);
  });
});
