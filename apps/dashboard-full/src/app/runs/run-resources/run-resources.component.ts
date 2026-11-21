import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { RunResources } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { fmtNumber, fmtPct, fmtSeconds, fmtSecondsAxis } from '../../shared/charts/chart-math';
import { ChartFrameComponent, ChartTable } from '../../shared/charts/chart-frame/chart-frame.component';
import { LineChartComponent, LineSeries } from '../../shared/charts/line-chart/line-chart.component';

/**
 * Resources a run used while active: the VRAM and utilization of each GPU it
 * occupied and the machine's RAM, as curves with their peaks. The VRAM is that
 * of the whole GPU during the run (anything else using the card shows up too).
 * Runs recorded before sampling existed have no data and the section says so.
 */
@Component({
  selector: 'app-run-resources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, ChartFrameComponent, LineChartComponent],
  templateUrl: './run-resources.component.html',
  styleUrl: './run-resources.component.scss',
})
export class RunResourcesComponent {
  private readonly api = inject(ApiService);

  readonly runId = input.required<string>();
  /** The run's state: a change (e.g. it finished) reloads what was sampled so far. */
  readonly state = input<string>();

  protected readonly data = signal<RunResources | null>(null);
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      this.state();
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.data.set(await firstValueFrom(this.api.getRunResources(this.runId())));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Compact x-axis ticks; the readouts keep the long form. */
  protected readonly seconds = (ms: number): string => fmtSecondsAxis(ms / 1000);
  protected readonly pct = (v: number): string => fmtPct(v);

  protected readonly hasData = computed(() => {
    const d = this.data();
    return !!d && (d.gpus.length > 0 || d.ram.samples.length > 0);
  });

  /** One chart per GPU: VRAM as a percentage of its total, plus its utilization. */
  protected readonly gpuCharts = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.gpus
      .filter((g) => g.total_mb > 0)
      .map((g) => {
        const peak = d.peaks.vram.find((p) => p.gpu === g.index);
        const series: LineSeries[] = [
          {
            name: $localize`:@@res.vram:VRAM used`,
            kind: 'amber',
            points: g.samples.map((s) => ({
              x: s.t_ms,
              y: (100 * s.used_mb) / g.total_mb,
              label: $localize`:@@res.vramPoint:${fmtNumber(s.used_mb)}:mb: MB (${fmtPct((100 * s.used_mb) / g.total_mb, 1)}:pct:) at ${fmtSeconds(s.t_ms / 1000)}:t:`,
            })),
          },
        ];
        if (g.samples.some((s) => s.util_pct !== undefined)) {
          series.push({
            name: $localize`:@@res.util:GPU utilization`,
            kind: 'green',
            points: g.samples.map((s) => ({
              x: s.t_ms,
              y: s.util_pct ?? 0,
              label: $localize`:@@res.utilPoint:${s.util_pct ?? 0}:u: % at ${fmtSeconds(s.t_ms / 1000)}:t:`,
            })),
          });
        }
        const table: ChartTable = {
          columns: [$localize`:@@res.colTime:Time`, $localize`:@@res.colVramMb:VRAM (MB)`, $localize`:@@res.colVramPct:VRAM (%)`, $localize`:@@res.colUtil:Utilization (%)`],
          rows: g.samples.map((s) => [
            fmtSeconds(s.t_ms / 1000),
            s.used_mb,
            fmtNumber((100 * s.used_mb) / g.total_mb, 1),
            s.util_pct ?? '—',
          ]),
        };
        return {
          index: g.index,
          title: `GPU ${g.index}`,
          description: $localize`:@@res.gpuDesc:Memory of the whole GPU during the run, as a percentage of its ${fmtNumber(g.total_mb)}:mb: MB: it includes any other process that was using it. Peak: ${peak ? fmtNumber(peak.mb) + ' MB (' + fmtPct(peak.pct, 1) + ')' : '—'}:peak:.`,
          series,
          table,
        };
      });
  });

  protected readonly ramChart = computed(() => {
    const d = this.data();
    if (!d || d.ram.total_mb <= 0 || d.ram.samples.length === 0) return null;
    const total = d.ram.total_mb;
    const peak = d.peaks.ram;
    const series: LineSeries[] = [
      {
        name: $localize`:@@res.ram:RAM used`,
        kind: 'amber',
        points: d.ram.samples.map((s) => ({
          x: s.t_ms,
          y: (100 * s.used_mb) / total,
          label: $localize`:@@res.ramPoint:${fmtNumber(s.used_mb)}:mb: MB (${fmtPct((100 * s.used_mb) / total, 1)}:pct:) at ${fmtSeconds(s.t_ms / 1000)}:t:`,
        })),
      },
    ];
    const table: ChartTable = {
      columns: [$localize`:@@res.colTime:Time`, $localize`:@@res.colRamMb:RAM (MB)`, $localize`:@@res.colRamPct:RAM (%)`],
      rows: d.ram.samples.map((s) => [fmtSeconds(s.t_ms / 1000), s.used_mb, fmtNumber((100 * s.used_mb) / total, 1)]),
    };
    return {
      series,
      table,
      description: $localize`:@@res.ramDesc:The machine's RAM during the run, as a percentage of its ${fmtNumber(total)}:mb: MB. Peak: ${peak ? fmtNumber(peak.mb) + ' MB (' + fmtPct(peak.pct, 1) + ')' : '—'}:peak:.`,
    };
  });
}
