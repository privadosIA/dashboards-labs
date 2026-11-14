import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { fmtNumber } from '../chart-math';

export interface BarDatum {
  label: string;
  value: number;
  /** Extra text for the readout, e.g. "2 ejecuciones". */
  detail?: string;
}

const W = 420;
const ROW = 26;
const LEFT = 104;
const RIGHT = 100;

/** Horizontal bars, one per category, on a common scale starting at zero. */
@Component({
  selector: 'mo-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
})
export class BarChartComponent {
  readonly data = input.required<BarDatum[]>();
  /** Fixed scale maximum (e.g. 100 for percentages); defaults to the largest value. */
  readonly max = input<number>();
  readonly format = input<(v: number) => string>((v) => fmtNumber(v, 1));
  readonly ariaLabel = input.required<string>();

  protected readonly W = W;
  protected readonly LEFT = LEFT;
  protected readonly ROW = ROW;
  protected readonly active = signal<number | null>(null);

  protected readonly height = computed(() => this.data().length * ROW + 8);
  protected readonly bars = computed(() => {
    const d = this.data();
    const top = this.max() ?? Math.max(0, ...d.map((x) => x.value));
    const span = W - LEFT - RIGHT;
    return d.map((x, i) => ({
      ...x,
      y: 4 + i * ROW,
      w: top > 0 ? Math.max(x.value > 0 ? 2 : 0, (Math.min(x.value, top) / top) * span) : 0,
      text: this.format()(x.value),
    }));
  });

  protected readonly readout = computed(() => {
    const i = this.active();
    const b = i === null ? undefined : this.bars()[i];
    return b ? `${b.label}: ${b.text}${b.detail ? ' · ' + b.detail : ''}` : '';
  });

  protected ariaOf(b: { label: string; text: string; detail?: string }): string {
    return `${b.label}: ${b.text}${b.detail ? ', ' + b.detail : ''}`;
  }
}
