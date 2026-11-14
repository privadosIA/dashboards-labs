import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { verdictOf, type Draft, type SceneBatchDraft, type Verdict } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';

import { LanguageService } from '../../../core/language';
import { sceneTextsFor } from '../texts';

/**
 * The card of one scene of a batch, under its block: how it stands, the score of its review and the first note, and Open to see it in the draft view. The draft is read once when it
 * is ready (the batch only lists its id and state).
 */
@Component({
  selector: 'app-scene-card',
  templateUrl: './scene-card.html',
  styleUrl: './scene-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneCard {
  readonly entry = input.required<SceneBatchDraft>();
  readonly open = output<SceneBatchDraft>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  protected readonly t = sceneTextsFor(inject(LanguageService).lang).batch;
  protected readonly draft = signal<Draft | null>(null);

  constructor() {
    effect(() => {
      const e = this.entry();
      untracked(() => {
        if (e.draftId && (e.state === 'ready' || e.state === 'approved')) {
          this.port
            .draft(e.draftId)
            .pipe(takeUntilDestroyed(this.destroyed))
            .subscribe({ next: (d) => this.draft.set(d), error: () => this.draft.set(null) });
        } else this.draft.set(null);
      });
    });
  }

  protected score(): number | undefined {
    return this.draft()?.review?.score;
  }

  protected verdict(): Verdict | null {
    const r = this.draft()?.review;
    return r?.verdict ?? (r?.score !== undefined ? verdictOf(r.score) : null);
  }

  protected note(): string {
    return this.draft()?.review?.notes[0] ?? '';
  }
}
