import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { formatClock } from '../../shared/format';
import { GENERATORS, GENERATOR_LABELS } from '../../song/generators';
import { isFinished, type Song } from '../../song/model';
import { parseTags } from '../../song/style';

/** One song of the history: what it is, where it is, and what can be done with it. It decides nothing: the panel listens. */
@Component({
  selector: 'app-song-card',
  templateUrl: './song-card.html',
  styleUrl: './song-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongCard {
  readonly song = input.required<Song>();
  readonly retry = output<Song>();
  readonly cancel = output<Song>();
  readonly remove = output<Song>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  private readonly tickets = inject(TicketService);

  protected readonly generator = computed(() => GENERATOR_LABELS[this.song().generator]);
  /** The style as chips when the generator reads tags, as the sentence it is when it does not. */
  protected readonly tags = computed(() => (GENERATORS[this.song().generator].style === 'tags' ? parseTags(this.song().style) : []));
  protected readonly state = computed(() => this.song().state);
  protected readonly finished = computed(() => isFinished(this.song()));
  protected readonly clock = computed(() => {
    const s = this.state();
    return s.phase === 'done' ? formatClock(s.seconds) : '';
  });
  protected readonly audio = computed(() => {
    const s = this.state();
    return s.phase === 'done' ? this.tickets.withTicket(s.url) : '';
  });
  protected readonly queue = computed(() => {
    const s = this.state();
    return s.phase === 'queued' && s.position ? this.t.songs.queuedAt.replace('{n}', String(s.position)) : this.t.songs.queued;
  });
}
