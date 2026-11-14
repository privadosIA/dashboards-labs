import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Piece } from '@lab/animation-core';
import { IN_MEMORY_ANIMATION, ANIMATION } from '@lab/music-motion';
import { PagedList } from '@lab/paged-list';

import { LanguageService } from '../core/language';
import { MOTION_EDIT_BASE } from '../core/options';
import { textsFor } from '../core/texts';
import { ImportDataset } from './import/import-dataset';
import { PieceRow } from './piece-row/piece-row';

/**
 * The server's pieces, newest first: a list to open from. It makes none and deletes none (that is done in `video-anim`). The port keeps
 * the list fresh while a piece is being drawn. In memory mode a button loads the example, which has no server to bring pieces.
 */
@Component({
  selector: 'app-pieces-page',
  imports: [PagedList, PieceRow, ImportDataset, RouterLink],
  templateUrl: './pieces.page.html',
  styleUrl: './pieces.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'motion-edit-kit' },
})
export class PiecesPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly memory = inject(IN_MEMORY_ANIMATION, { optional: true });
  private readonly router = inject(Router);
  private readonly base = inject(MOTION_EDIT_BASE);
  private readonly destroyed = inject(DestroyRef);
  protected readonly flowLink = `${this.base}/flow`;
  protected readonly lang = inject(LanguageService).lang;
  protected readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.pieces;

  protected readonly pieces = signal<readonly Piece[] | null>(null);
  protected readonly canLoadExample = this.memory !== null;
  protected readonly loaded = signal(false);
  protected readonly importing = signal(false);

  ngOnInit(): void {
    this.port
      .pieces()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((list) => this.pieces.set([...list].sort((a, b) => b.createdAt - a.createdAt)));
  }

  protected open(piece: Piece): void {
    void this.router.navigate([`${this.base}/pieces`, piece.id]);
  }

  protected loadExample(): void {
    this.memory?.loadSample().pipe(takeUntilDestroyed(this.destroyed)).subscribe(() => this.loaded.set(true));
  }
}
