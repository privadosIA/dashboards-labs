import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TicketService } from '@lab/server-connection';

import { isBusy, type PieceDetail } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { formatBytes, formatWait } from '../../shared/format';
import { Notifier } from '../../shared/notifier';

/** The forecast before the drawing, the button, the progress, and the video or the error at the end. */
@Component({
  selector: 'app-render-panel',
  templateUrl: './render-panel.html',
  styleUrl: './render-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderPanel {
  readonly piece = input.required<PieceDetail>();
  /** The drawing started: the page follows the piece from here. */
  readonly started = output<void>();

  private readonly port = inject(ANIMATION);
  private readonly ticket = inject(TicketService);
  private readonly notifier = inject(Notifier);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.render;

  protected readonly busy = computed(() => isBusy(this.piece()));
  protected readonly working = signal(false);
  /** Why the server did not start the drawing, in its own words. */
  protected readonly refused = signal('');
  protected readonly slow = computed(() => this.piece().level === 'advanced' && this.piece().fps === 60);
  protected readonly forecast = computed(() => this.t.forecast.replace('{time}', formatWait(this.piece().estimate.seconds)));
  protected readonly slowNote = this.texts.newPiece.slowNote;
  protected readonly size = computed(() => formatBytes(this.piece().sizeBytes));
  /** The video with the ticket the server asks for when it has a token (a `<video>` cannot send one). */
  protected readonly video = computed(() => {
    const url = this.piece().video;
    return url ? this.ticket.withTicket(url) : null;
  });

  protected draw(): void {
    if (this.working() || this.busy()) return;
    this.working.set(true);
    this.refused.set('');
    // Asking is the person's own action: the right moment to ask the browser for the permission to tell them when it is done.
    void this.notifier.allow();
    this.port
      .render(this.piece().id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.working.set(false);
          this.started.emit();
        },
        error: (e) => {
          this.working.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
