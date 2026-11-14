import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { isBusy, isProposing, type PieceDetail, type SongMap } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { formatWait } from '../../shared/format';
import { BAND, HEIGHT, WIDTH, geometryOf } from './geometry';

/** The song map, read only: sections, beats, words and loudness on a timeline, and the span of the piece being looked at. */
@Component({
  selector: 'app-song-map',
  templateUrl: './song-map.html',
  styleUrl: './song-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongMapView {
  readonly map = input.required<SongMap>();
  /** The span of the piece of the script being looked at, in seconds. */
  readonly span = input<{ start: number; end: number } | null>(null);
  /** Beats per bar, to draw only the bar lines of a long song. */
  readonly beatBase = input(4);

  /** The piece the map belongs to: with it the map offers to hear the words. Without it the map is only shown. */
  readonly piece = input<PieceDetail | null>(null);
  /** The piece as the server answers after the words were heard. */
  readonly heard = output<PieceDetail>();

  private readonly port = inject(ANIMATION, { optional: true });
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.songMap;
  protected readonly listening = signal(false);
  protected readonly refused = signal('');
  protected readonly notice = signal('');
  protected readonly warning = signal('');
  protected readonly done = signal(false);
  protected readonly canSync = computed(() => this.port !== null && this.piece() !== null);
  protected readonly locked = computed(() => this.listening() || isBusy(this.piece() ?? ({ state: 'draft' } as PieceDetail)) || isProposing(this.piece() ?? {}));
  protected readonly wait = computed(() => this.t.syncWait.replace('{time}', formatWait(this.map().duration / 3)));
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly band = BAND;
  protected readonly geometry = computed(() => geometryOf(this.map(), this.beatBase()));
  protected readonly marked = computed(() => this.geometry().span(this.span()));
  protected readonly tempo = computed(() => this.t.tempo.replace('{bpm}', String(Math.round(this.map().bpm))));
  protected readonly summary = computed(() => {
    const m = this.map();
    return this.t.summary.replace('{sections}', String(m.sections.length)).replace('{beats}', String(m.beats.length)).replace('{words}', String(m.words.length));
  });

  /** Asks the server to hear the words; the call stays open for as long as it takes and its answer is the piece. */
  protected sync(): void {
    const piece = this.piece();
    if (!piece || !this.port || this.locked()) return;
    this.listening.set(true);
    this.refused.set('');
    this.notice.set('');
    this.warning.set('');
    this.done.set(false);
    this.port
      .transcribe(piece.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (answer) => {
          this.listening.set(false);
          if (answer.notice) this.notice.set(answer.notice);
          else this.done.set(true);
          if (answer.scriptWarning) this.warning.set(answer.scriptWarning);
          this.heard.emit(answer);
        },
        error: (e) => {
          this.listening.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
