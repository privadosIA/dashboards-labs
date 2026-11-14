import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { Piece } from '@lab/animation-core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** One piece of the list: its title and song, state (with progress while it is drawn), format, when it was made, and Open. */
@Component({
  selector: 'app-piece-row',
  templateUrl: './piece-row.html',
  styleUrl: './piece-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PieceRow {
  readonly piece = input.required<Piece>();
  readonly open = output<Piece>();

  protected readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).pieces;
  protected readonly busy = computed(() => this.piece().state === 'queued' || this.piece().state === 'running');
  protected readonly state = computed(() => (this.busy() ? this.t.drawing(Math.round(this.piece().progress)) : this.t.states[this.piece().state]));
  /** The moment it was made, in the dashboard's language. `Intl` needs no locale data loaded, unlike Angular's date pipe. */
  protected readonly created = computed(() => new Intl.DateTimeFormat(this.lang, { dateStyle: 'short', timeStyle: 'short' }).format(this.piece().createdAt));
  protected readonly song = computed(() => {
    const s = this.piece().source;
    return `${s.project} · ${s.trackId} · v${s.variant}`;
  });
}
