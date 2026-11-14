import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PagedList } from '@lab/paged-list';

import type { Song } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { formatClock } from '../../shared/format';
import { groupSongs } from '../../songs/group';
import { SongCard } from '../../songs/song-card/song-card';

/** The second step of a new animation: the song of the library it follows, picked from the same cards as the Songs screen. */
@Component({
  selector: 'app-song-step',
  imports: [SongCard, PagedList],
  templateUrl: './song-step.html',
  styleUrl: './song-step.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongStep {
  /** The library's songs; `null` while they are being read. */
  readonly songs = input<readonly Song[] | null>(null);
  /** Why the library could not be read, in the server's words. */
  readonly error = input('');
  /** The song chosen so far. */
  readonly chosen = input<Song | null>(null);
  readonly picked = output<Song>();

  protected readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).newAnimation.song;
  protected readonly clock = formatClock;
  protected readonly groups = computed(() => groupSongs(this.songs() ?? []));
}
