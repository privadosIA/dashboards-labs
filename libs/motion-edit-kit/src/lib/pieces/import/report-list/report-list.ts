import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ImportPlan, ItemResult, PlanItem } from '@lab/animation-dataset';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';

/** The key of an item in the file: what a result is matched to. */
const keyOf = (i: { kind: string; index: number }): string => `${i.kind}:${i.index}`;

/**
 * The report of an import as a table: before confirming, what will happen to each item and why; while importing and after it, what became
 * of each one (the server's own words when it failed).
 */
@Component({
  selector: 'app-report-list',
  templateUrl: './report-list.html',
  styleUrl: './report-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportList {
  readonly plan = input.required<ImportPlan>();
  /** `false` shows what will happen; `true` shows what has become of each item so far. */
  readonly outcomes = input(false);
  readonly results = input<readonly ItemResult[]>([]);

  protected readonly t = textsFor(inject(LanguageService).lang).importer;
  private readonly byKey = computed(() => new Map(this.results().map((r) => [keyOf(r), r])));

  protected reason(item: PlanItem): string {
    return item.reason ? this.t.reasons[item.reason](item.detail?.join(', ') ?? '') : '';
  }

  protected outcome(item: PlanItem): { state: string; why: string; failed: boolean } {
    const r = this.byKey().get(keyOf(item));
    if (!r) return { state: this.t.pending, why: '', failed: false };
    return { state: this.t.states[r.state], why: r.reason ?? (r.code ? this.t.reasons[r.code](item.detail?.join(', ') ?? '') : ''), failed: r.state === 'failed' };
  }
}
