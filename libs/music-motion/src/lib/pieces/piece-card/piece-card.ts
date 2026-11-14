import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { isBusy, type Piece } from '@lab/animation-core';
import { MUSIC_MOTION_LINKS } from '../../core/external-links';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { ExportDataset } from '../../shared/export-dataset/export-dataset';
import { formatBytes, formatWait } from '../../shared/format';

/** One piece in the list: its title, state, progress while it draws, what it was made with, and open, export its dataset and delete. */
@Component({
  selector: 'app-piece-card',
  imports: [ExportDataset, RouterLink],
  templateUrl: './piece-card.html',
  styleUrl: './piece-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PieceCard {
  readonly piece = input.required<Piece>();
  readonly open = output<Piece>();
  readonly remove = output<Piece>();

  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.pieces;
  protected readonly links = this.texts.links;
  private readonly places = inject(MUSIC_MOTION_LINKS);
  /** Where the host edits this piece, when it said (the link is drawn only then). */
  protected readonly editor = computed(() => this.places.pieceEditor?.(this.piece().id));
  protected readonly busy = computed(() => isBusy(this.piece()));
  protected readonly spec = computed(() => {
    const p = this.piece();
    const text = this.texts.newPiece;
    return this.t.spec.replace('{style}', text.styles[p.style]).replace('{level}', text.levels[p.level]).replace('{fps}', String(p.fps)).replace('{size}', `${p.width}×${p.height}`);
  });
  protected readonly forecast = computed(() => this.t.forecast.replace('{time}', formatWait(this.piece().estimate.seconds)));
  protected readonly size = computed(() => formatBytes(this.piece().sizeBytes));
}
