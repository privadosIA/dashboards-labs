import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { fmtPct } from '../chart-math';

export interface RatioPart {
  label: string;
  value: number;
  /** `solid` or `hatch`: two parts never differ by colour alone. */
  kind: 'solid' | 'hatch';
}

/** A single 100 % bar split into parts, with each part's share written out. */
@Component({
  selector: 'mo-ratio-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ratio-bar.component.html',
  styleUrl: './ratio-bar.component.scss',
})
export class RatioBarComponent {
  readonly parts = input.required<RatioPart[]>();
  readonly ariaLabel = input.required<string>();

  private readonly total = computed(() => this.parts().reduce((t, p) => t + p.value, 0));
  protected readonly shares = computed(() =>
    this.parts().map((p) => ({ ...p, pct: this.total() > 0 ? (100 * p.value) / this.total() : 0 })),
  );
  protected readonly summary = computed(() =>
    this.shares()
      .map((p) => `${p.label}: ${p.value} (${fmtPct(p.pct)})`)
      .join(' · '),
  );
}
