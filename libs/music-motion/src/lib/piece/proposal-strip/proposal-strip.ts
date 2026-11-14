import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';

import { isProposing, type PieceDetail, type ProposalSource } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { formatWait } from '../../shared/format';

/**
 * The proposal for design and script that the assistant writes in the background: while it waits or writes, what it is doing, with which model and for how
 * long; when it ends, for the design and for the script whether the assistant or the fixed rule wrote it and why not the assistant when it was the rule.
 */
@Component({
  selector: 'app-proposal-strip',
  templateUrl: './proposal-strip.html',
  styleUrl: './proposal-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposalStrip {
  readonly piece = input.required<PieceDetail>();

  protected readonly t = textsFor(inject(LanguageService).lang).proposal;
  private readonly now = signal(Date.now());
  protected readonly proposal = computed(() => this.piece().proposal);
  protected readonly running = computed(() => isProposing(this.piece()));
  protected readonly elapsed = computed(() => {
    const p = this.proposal();
    return p ? this.t.elapsed(formatWait(((p.finishedAt ?? this.now()) - p.startedAt) / 1000)) : '';
  });
  /** The two parts and who wrote each, once there is something to say. */
  protected readonly parts = computed(() => {
    const p = this.proposal();
    if (!p || p.state === 'waiting' || p.state === 'writing') return [];
    return [
      { key: 'design', label: this.t.design, source: p.design },
      { key: 'script', label: this.t.script, source: p.script },
    ].filter((x): x is { key: string; label: string; source: ProposalSource } => !!x.source);
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected who(source: ProposalSource): string {
    if (source.source === 'assistant') return this.t.assistant;
    return source.reason ? this.t.rule(source.reason) : this.t.ruleNoReason;
  }
}
