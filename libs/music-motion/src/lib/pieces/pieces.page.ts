import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { PagedList } from '@lab/paged-list';

import { injectLink } from '../core/links';
import type { Piece } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog, type ConfirmData } from '../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../shared/failure-text';
import { LoadExample } from './load-example/load-example';
import { PieceCard } from './piece-card/piece-card';

/** The pieces, newest first. The port refreshes them while any is being drawn, so progress moves by itself. */
@Component({
  selector: 'app-pieces-page',
  imports: [LoadExample, PieceCard, RouterLink, PagedList],
  templateUrl: './pieces.page.html',
  styleUrl: './pieces.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PiecesPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.pieces;
  protected readonly common = this.texts;
  protected readonly lang = inject(LanguageService).lang;

  protected readonly pieces = signal<readonly Piece[] | null>(null);
  /** Why the last deletion did not happen, in the server's words. */
  protected readonly refused = signal('');

  ngOnInit(): void {
    this.port
      .pieces()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((list) => this.pieces.set(list));
  }

  protected open(piece: Piece): void {
    void this.router.navigate([this.link('pieces', piece.id)]);
  }

  protected remove(piece: Piece): void {
    const data: ConfirmData = { title: this.t.removeTitle, message: `${piece.title}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.refused.set('');
        this.port
          .remove(piece.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ error: (e) => this.refused.set(failureText(e, this.texts)) });
      });
  }
}
