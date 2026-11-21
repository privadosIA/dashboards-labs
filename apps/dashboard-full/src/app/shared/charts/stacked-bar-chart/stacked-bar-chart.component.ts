import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { fmtNumber, linear, niceCeil, ticks, uid } from '../chart-math';

/** ok = solid green, bad = hatched red, dim = dotted grey: never colour alone. */
export type StackKind = 'ok' | 'bad' | 'dim';

export interface StackSeries {
  name: string;
  kind: StackKind;
  values: number[];
}

const W = 420;
const H = 220;
const L = 36;
const R = 8;
const T = 10;
const B = 30;

/** Vertical stacked bars: one column per category, one segment per series. */
@Component({
  selector: 'mo-stacked-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stacked-bar-chart.component.html',
  styleUrl: './stacked-bar-chart.component.scss',
})
export class StackedBarChartComponent {
  readonly categories = input.required<string[]>();
  readonly series = input.required<StackSeries[]>();
  /** Short axis label of a category (defaults to the category). */
  readonly shortLabel = input<(c: string) => string>((c) => c);
  readonly ariaLabel = input.required<string>();

  protected readonly W = W;
  protected readonly H = H;
  protected readonly L = L;
  protected readonly R = R;
  protected readonly B = B;
  protected readonly active = signal<number | null>(null);
  protected readonly patId = uid('stack');

  private readonly totals = computed(() =>
    this.categories().map((_, i) => this.series().reduce((t, s) => t + (s.values[i] ?? 0), 0)),
  );
  protected readonly yMax = computed(() => niceCeil(Math.max(0, ...this.totals())));
  protected readonly grid = computed(() => {
    const y = linear(0, this.yMax(), H - B, T);
    return ticks(this.yMax(), Math.min(4, this.yMax())).map((v) => ({ v, y: y(v), text: fmtNumber(v) }));
  });

  protected readonly columns = computed(() => {
    const cats = this.categories();
    const n = Math.max(1, cats.length);
    const step = (W - L - R) / n;
    const bw = Math.min(34, step * 0.7);
    const y = linear(0, this.yMax(), H - B, T);
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - L - R) / 46))));
    return cats.map((c, i) => {
      let acc = 0;
      const segs = this.series().map((s) => {
        const v = s.values[i] ?? 0;
        const y1 = y(acc + v);
        const y0 = y(acc);
        acc += v;
        return { kind: s.kind, name: s.name, value: v, y: y1, h: Math.max(0, y0 - y1) };
      });
      return {
        category: c,
        x: L + i * step + (step - bw) / 2,
        w: bw,
        cx: L + i * step + step / 2,
        segs,
        total: acc,
        label: i % every === 0 ? this.shortLabel()(c) : '',
      };
    });
  });

  protected readonly readout = computed(() => {
    const i = this.active();
    const col = i === null ? undefined : this.columns()[i];
    return col ? this.textOf(col) : '';
  });

  protected textOf(col: { category: string; segs: { name: string; value: number }[] }): string {
    return `${col.category}: ${col.segs.map((s) => `${fmtNumber(s.value)} ${s.name}`).join(' · ')}`;
  }
}
