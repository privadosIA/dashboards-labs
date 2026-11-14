import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TicketService } from '@lab/server-connection';

import type { Song } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { formatClock } from '../../shared/format';
import type { SongGroup } from '../group';

/** One track with the versions it has: a version to choose, a way to listen and the button that makes a piece from it. */
@Component({
  selector: 'app-song-card',
  templateUrl: './song-card.html',
  styleUrl: './song-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongCard {
  readonly group = input.required<SongGroup>();
  readonly animate = output<Song>();

  private readonly ticket = inject(TicketService);
  protected readonly t = textsFor(inject(LanguageService).lang).songs;
  protected readonly clock = formatClock;
  private readonly picked = signal(0);
  protected readonly song = computed(() => this.group().versions[Math.min(this.picked(), this.group().versions.length - 1)]);
  /** The audio with the ticket the server asks for when it has a token (an `<audio>` cannot send one). */
  protected readonly audio = computed(() => {
    const url = this.song().audio;
    return url ? this.ticket.withTicket(url) : null;
  });
  protected readonly cover = computed(() => {
    const url = this.song().cover;
    return url ? this.ticket.withTicket(url) : null;
  });

  protected versionLabel(i: number): string {
    const v = this.group().versions[i];
    return `${this.t.versionOf.replace('{n}', String(v.variant + 1))} · ${formatClock(v.seconds)}${v.instrumental ? ` · ${this.t.instrumental}` : ''}`;
  }

  protected choose(event: Event): void {
    this.picked.set(Number((event.target as HTMLSelectElement).value));
  }
}
