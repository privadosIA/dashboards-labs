import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PagedList } from '@lab/paged-list';

import { injectLink } from '../core/links';
import { ANIMATION } from '../animation/tokens';
import type { Song } from '@lab/animation-core';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { failureText } from '../shared/failure-text';
import { groupSongs } from './group';
import { SongCard } from './song-card/song-card';

/** The library's songs, to pick one and make a piece from it. Nothing here makes or changes a song. */
@Component({
  selector: 'app-songs-page',
  imports: [SongCard, PagedList],
  templateUrl: './songs.page.html',
  styleUrl: './songs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongsPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.songs;
  protected readonly common = this.texts;
  protected readonly lang = inject(LanguageService).lang;

  protected readonly songs = signal<readonly Song[] | null>(null);
  protected readonly error = signal('');
  protected readonly groups = computed(() => groupSongs(this.songs() ?? []));

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.songs.set(null);
    this.port
      .songs()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (songs) => this.songs.set(songs),
        error: (e) => {
          this.error.set(failureText(e, this.texts));
          this.songs.set([]);
        },
      });
  }

  protected animate(song: Song): void {
    void this.router.navigate([this.link('new')], { queryParams: { project: song.project, track: song.trackId, variant: song.variant } });
  }
}
