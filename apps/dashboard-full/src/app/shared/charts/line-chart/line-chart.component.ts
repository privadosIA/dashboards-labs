import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { fmtNumber, linear, niceCeil, ticks } from '../chart-math';

/** Each kind has its own colour and dash, so series differ without colour. */
export type LineKind = 'amber' | 'green' | 'red' | 'dim';

export interface LinePoint {
  x: number;
  y: number;
  /** Readout text of this point; defaults to "x: y". */
  label?: string;
}

export interface LineSeries {
  name: string;
  kind: LineKind;
  points: LinePoint[];
}

export interface LineReference {
  y: number;
  label: string;
}

const W = 420;
const H = 200;
const L = 68;
const R = 12;
const T = 10;
const B = 28;
/** Up to this many points per series are keyboard-focusable. */
const FOCUSABLE = 40;

const DASH: Record<LineKind, string | null> = { amber: null, green: '6 3', red: '2 3', dim: '10 4' };

/** Lines over a numeric x axis, with an optional horizontal reference line. */
@Component({
  selector: 'mo-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-chart.component.html',
  styleUrl: './line-chart.component.scss',
})
export class LineChartComponent {
  readonly series = input.required<LineSeries[]>();
  /** Fixed y maximum (e.g. 100 for percentages); defaults to a rounded-up data maximum. */
  readonly yMax = input<number>();
  readonly yFormat = input<(v: number) => string>((v) => fmtNumber(v));
  readonly xFormat = input<(v: number) => string>((v) => fmtNumber(v));
  readonly reference = input<LineReference>();
  readonly ariaLabel = input.required<string>();

  protected readonly W = W;
  protected readonly H = H;
  protected readonly L = L;
  protected readonly R = R;
  protected readonly B = B;
  protected readonly active = signal<{ s: number; p: number } | null>(null);

  private readonly all = computed(() => this.series().flatMap((s) => s.points));
  protected readonly top = computed(
    () => this.yMax() ?? niceCeil(Math.max(0, ...this.all().map((p) => p.y), this.reference()?.y ?? 0)),
  );
  private readonly xs = computed(() => {
    const x = this.all().map((p) => p.x);
    return { min: Math.min(...x), max: Math.max(...x) };
  });
  private readonly sx = computed(() => {
    const { min, max } = this.xs();
    return min === max ? () => (L + W - R) / 2 : linear(min, max, L, W - R);
  });
  private readonly sy = computed(() => linear(0, this.top(), H - B, T));

  protected readonly yTicks = computed(() => ticks(this.top(), 4).map((v) => ({ y: this.sy()(v), text: this.yFormat()(v) })));
  protected readonly xTicks = computed(() => {
    if (this.all().length === 0) return [];
    const { min, max } = this.xs();
    const t = ticks(max - min, 4);
    // the last label ends at the plot's right edge so it is never clipped
    return t.map((d, i) => ({ x: this.sx()(min + d), text: this.xFormat()(min + d), anchor: i === t.length - 1 && t.length > 1 ? 'end' : 'middle' }));
  });
  protected readonly refY = computed(() => (this.reference() ? this.sy()(this.reference()!.y) : null));

  protected readonly lines = computed(() =>
    this.series().map((s, si) => {
      const pts = s.points.map((p, pi) => ({ cx: this.sx()(p.x), cy: this.sy()(p.y), si, pi, p }));
      return {
        name: s.name,
        kind: s.kind,
        dash: DASH[s.kind],
        d: pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.cx.toFixed(1)} ${q.cy.toFixed(1)}`).join(' '),
        pts,
        focusable: pts.length <= FOCUSABLE,
      };
    }),
  );

  protected textOf(si: number, pi: number): string {
    const s = this.series()[si];
    const p = s?.points[pi];
    if (!p) return '';
    return `${s.name}: ${p.label ?? `${this.xFormat()(p.x)} → ${this.yFormat()(p.y)}`}`;
  }

  protected readonly readout = computed(() => {
    const a = this.active();
    return a ? this.textOf(a.s, a.p) : '';
  });

  /** Mouse/touch over the plot: highlight the point nearest in x. */
  protected onMove(ev: PointerEvent): void {
    const el = ev.currentTarget as SVGElement;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const x = ((ev.clientX - r.left) / r.width) * W;
    let best: { s: number; p: number } | null = null;
    let bestD = Infinity;
    for (const l of this.lines()) {
      for (const q of l.pts) {
        const d = Math.abs(q.cx - x);
        if (d < bestD) {
          bestD = d;
          best = { s: q.si, p: q.pi };
        }
      }
    }
    this.active.set(best);
  }
}
