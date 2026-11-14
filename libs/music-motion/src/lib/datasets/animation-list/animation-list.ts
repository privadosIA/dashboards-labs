import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PagedList } from '@lab/paged-list';
import { combineLatest } from 'rxjs';

import type { Piece, Song } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { ExportDataset } from '../../shared/export-dataset/export-dataset';
import { failureText } from '../../shared/failure-text';

/** The animations of this server, newest first, each with the Export of its dataset: a dataset is one animation, never the whole server. */
@Component({
  selector: 'app-animation-list',
  imports: [ExportDataset, PagedList],
  templateUrl: './animation-list.html',
  styleUrl: './animation-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimationList implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  protected readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.datasets.export;
  protected readonly states = this.texts.pieces.states;

  /** `null` while they load. */
  protected readonly pieces = signal<readonly Piece[] | null>(null);
  private readonly songs = signal<readonly Song[]>([]);
  protected readonly refused = signal('');

  /** The song of a piece by its title in the library; the piece's own title when the library does not have it any more. */
  protected readonly songTitle = computed(() => {
    const songs = this.songs();
    return (p: Piece): string => songs.find((s) => s.project === p.source.project && s.trackId === p.source.trackId && s.variant === p.source.variant)?.title ?? p.title;
  });

  protected stateText(p: Piece): string {
    return this.states[p.state];
  }

  ngOnInit(): void {
    combineLatest([this.port.pieces(), this.port.songs()])
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: ([pieces, songs]) => {
          this.songs.set(songs);
          this.pieces.set(pieces);
        },
        error: (e) => {
          this.pieces.set([]);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
