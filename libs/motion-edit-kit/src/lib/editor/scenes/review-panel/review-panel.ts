import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnimationFailure, verdictOf, type PieceReview, type ReviewScene, type Verdict } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';
import type { Subscription } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { sceneTextsFor } from '../texts';

/**
 * Review piece: the server's vision model grades each scene and the piece as a whole, in the background. The grades come back as marks on the blocks (the page draws them from the review this
 * panel reports), and here are the overall score and notes, the scenes that repeat a metaphor and every block's notes; choosing a note selects its block.
 */
@Component({
  selector: 'app-review-panel',
  templateUrl: './review-panel.html',
  styleUrl: './review-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPanel {
  /** The piece (its id). */
  readonly piece = input.required<string>();
  /** The last review the piece remembers, or the one this panel is following. */
  readonly review = input<PieceReview | null | undefined>(null);
  /** The piece is being drawn or proposed: nothing is started over it. */
  readonly locked = input(false);
  /** The review changed (it started, advanced or ended). */
  readonly changed = output<PieceReview>();
  /** A note was chosen: the script piece it is about. */
  readonly select = output<string>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  protected readonly t = sceneTextsFor(inject(LanguageService).lang).review;
  protected readonly shown = signal(false);
  protected readonly starting = signal(false);
  protected readonly refused = signal('');

  private following?: Subscription;

  constructor() {
    effect(() => {
      const r = this.review();
      untracked(() => {
        // a review that is still running when the piece opens is followed
        if (r?.state === 'running' && !this.following) this.follow();
      });
    });
    this.destroyed.onDestroy(() => this.following?.unsubscribe());
  }

  private reasonOf(e: unknown): string {
    return e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e);
  }

  private follow(): void {
    this.following?.unsubscribe();
    this.following = this.port
      .followReview(this.piece())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (r) => this.changed.emit(r),
        error: (e) => this.refused.set(this.t.failed(this.reasonOf(e))),
        complete: () => (this.following = undefined),
      });
  }

  protected start(): void {
    if (this.starting() || this.locked() || this.review()?.state === 'running') return;
    this.starting.set(true);
    this.refused.set('');
    this.port
      .reviewPiece(this.piece())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (r) => {
          this.starting.set(false);
          this.shown.set(true);
          this.changed.emit(r);
          if (r.state === 'running') this.follow();
        },
        error: (e) => {
          this.starting.set(false);
          this.refused.set(this.t.failed(this.reasonOf(e)));
        },
      });
  }

  protected verdict(s: ReviewScene): Verdict {
    return s.verdict ?? verdictOf(s.score);
  }

  protected repeated(group: readonly string[]): string {
    return this.t.repeated(group.join(', '));
  }
}
