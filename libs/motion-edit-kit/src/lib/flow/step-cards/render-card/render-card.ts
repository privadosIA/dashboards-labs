import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ANIMATION } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import { Subscription } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { execute } from '../../execute';
import { FlowStore } from '../../flow.store';
import { reasonText } from '../../shared/reason-text';
import { type RenderEstimate, drawPiece, followRender, readEstimate } from '../../steps/render';

/**
 * The Render step: the piece's estimate is shown as an estimate with the frame rate and size, and drawing starts only when the person presses Draw (there is no switch for it). While it
 * draws, the card follows the server's progress; when it is done the video plays and Finish goes on to Done. A failure shows the reason with Retry.
 */
@Component({
  selector: 'app-render-card',
  templateUrl: './render-card.html',
  styleUrl: './render-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderCard implements OnInit {
  private readonly store = inject(FlowStore);
  private readonly animation = inject(ANIMATION);
  private readonly tickets = inject(TicketService);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).flow.render;
  protected readonly why = (reason?: string) => reasonText(this.lang, reason);

  protected readonly flow = this.store.flow;
  protected readonly step = computed(() => this.flow()?.steps.render);
  protected readonly estimate = signal<RenderEstimate | null>(null);
  protected readonly progress = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  protected readonly result = computed(() => this.step()?.result as { video?: string } | undefined);
  protected readonly video = computed(() => (this.result()?.video ? this.tickets.withTicket(this.result()!.video!) : null));
  protected readonly estimateText = computed(() => {
    const e = this.estimate();
    return e ? this.t.estimate(Math.round(e.seconds), e.frames, e.fps, `${e.width}×${e.height}`) : '';
  });
  protected readonly percent = computed(() => Math.round(Number(this.progress()['progress'] ?? 0)));
  protected readonly queued = computed(() => this.progress()['state'] === 'queued');
  private running: Subscription | undefined;

  ngOnInit(): void {
    const id = this.flow()?.refs.pieceId;
    if (id) {
      readEstimate(this.animation, id)
        .pipe(takeUntilDestroyed(this.destroyed))
        .subscribe({ next: (e) => this.estimate.set(e), error: () => undefined });
    }
    // reopened while the server was drawing: the card follows it from where it is
    if (this.step()?.status === 'running' && id) this.attach(id);
    this.destroyed.onDestroy(() => this.running?.unsubscribe());
  }

  private attach(id: string): void {
    this.running = execute(this.store, 'render', () => followRender(this.animation, id), { onProgress: (i) => this.progress.set(i), onBusy: (b) => this.busy.set(b) });
  }

  /** Asks the server to draw. It is a button, never automatic. */
  protected draw(): void {
    const id = this.flow()?.refs.pieceId;
    if (!id) return;
    this.running?.unsubscribe();
    this.progress.set({});
    this.running = execute(this.store, 'render', () => drawPiece(this.animation, id), { onProgress: (i) => this.progress.set(i), onBusy: (b) => this.busy.set(b) });
  }

  protected continue(): void {
    this.store.continue();
  }
}
