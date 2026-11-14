import { DestroyRef, Directive, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { AssistModels } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';
import { type Subscription, catchError, of } from 'rxjs';

import { LanguageService } from '../../core/language';
import { MOTION_EDIT_BASE } from '../../core/options';
import { textsFor } from '../../core/texts';
import { execute } from '../execute';
import { FlowStore } from '../flow.store';
import type { ProposalSummary } from '../steps/propose';
import { reasonText } from './reason-text';
import { proposeDesign } from '../steps/design';
import { proposeScript } from '../steps/script';

/**
 * What the Design and Script cards share: the proposal is asked with the plan's prompt and model, the review says what was sent and who wrote it, Propose again takes
 * another prompt and model, and Edit in the editor opens the piece with the Flow bar. Each card has its own template.
 */
@Directive()
export abstract class ProposalCardBase implements OnInit {
  protected abstract readonly what: 'design' | 'script';
  protected readonly store = inject(FlowStore);
  protected readonly animation = inject(ANIMATION);
  protected readonly destroyed = inject(DestroyRef);
  private readonly base = inject(MOTION_EDIT_BASE);
  protected readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.flow.propose;
  private readonly language = inject(LanguageService).lang;
  protected readonly why = (reason?: string) => reasonText(this.language, reason);

  protected readonly flow = this.store.flow;
  protected readonly step = computed(() => this.flow()?.steps[this.what]);
  protected readonly summary = computed(() => this.step()?.result as ProposalSummary | undefined);
  /** The editor, with the Flow bar: `?flow=` says which flow and `step=` which step the bar belongs to. */
  protected readonly editorLink = computed(() => [`${this.base}/pieces`, this.flow()?.refs.pieceId ?? '']);
  protected readonly editorQuery = computed(() => ({ flow: this.flow()?.id ?? '', step: this.what }));
  protected readonly again = signal(false);
  protected readonly models = signal<AssistModels | null>(null);
  protected readonly busy = signal(false);
  private running: Subscription | undefined;

  ngOnInit(): void {
    this.animation
      .assistModels()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((m) => this.models.set(m));
    if (this.step()?.status === 'pending') this.run();
    this.destroyed.onDestroy(() => this.running?.unsubscribe());
  }

  /** Asks for the proposal: with the plan's prompt and model, or with the ones given (Propose again). */
  protected run(prompt?: string, model?: string, provider?: string): void {
    const flow = this.flow();
    const pieceId = flow?.refs.pieceId;
    if (!flow || !pieceId) {
      this.store.run(this.what);
      this.store.fail(this.what, 'the piece is not made');
      return;
    }
    const p = prompt ?? (flow.plan.animation.choices.prompt || flow.prompt);
    const m = model ?? flow.plan.animation.model ?? '';
    const pr = provider ?? flow.plan.animation.provider ?? '';
    const work = () => (this.what === 'design' ? proposeDesign(this.animation, pieceId, p, m, pr) : proposeScript(this.animation, pieceId, p, m, pr));
    this.again.set(false);
    this.running?.unsubscribe();
    this.running = execute(this.store, this.what, work, { onBusy: (b) => this.busy.set(b) });
  }

  protected openAgain(): void {
    this.again.set(true);
  }

  /** Propose again with another prompt and model (for this call only). */
  protected proposeAgain(e: { prompt: string; model: string; provider: string }): void {
    this.run(e.prompt, e.model, e.provider);
  }

  protected continue(): void {
    this.store.continue();
  }

  protected keep(): void {
    this.store.keep(this.what);
  }
}
