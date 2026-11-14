import { FadeUpDirective } from '@lab/motion-ui';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { DfCellDirective, DfTableNavigateEvent, DynamicFormComponent } from '@core/dynamic-forms';
import { firstValueFrom } from 'rxjs';

import { StatsResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ModeFilterStore, PROJECT_ORIGINS } from '../../core/mode-filter.store';
import { ProjectsStore } from '../../core/projects.store';
import { ModeSelectComponent } from '../../shared/mode-select/mode-select.component';
import { BarChartComponent, BarDatum } from '../../shared/charts/bar-chart/bar-chart.component';
import { fmtNumber, fmtPct, fmtSeconds, fmtSecondsAxis, niceCeil } from '../../shared/charts/chart-math';
import { ChartFrameComponent, ChartTable } from '../../shared/charts/chart-frame/chart-frame.component';
import { LineChartComponent, LineSeries } from '../../shared/charts/line-chart/line-chart.component';
import { RatioBarComponent, RatioPart } from '../../shared/charts/ratio-bar/ratio-bar.component';
import { StackedBarChartComponent, StackSeries } from '../../shared/charts/stacked-bar-chart/stacked-bar-chart.component';
import { schemaFor } from '../../shared/dynamic/schema-loader';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { MatButtonModule } from '@angular/material/button';
import tablesEn from './dynamic/tables.en.json';
import tablesEs from './dynamic/tables.es.json';

/** Periods the page offers; `0` means the whole history. */
export const PERIODS: readonly { days: number; label: string }[] = [
  { days: 7, label: $localize`:@@stats.p7:7 days` },
  { days: 30, label: $localize`:@@stats.p30:30 days` },
  { days: 90, label: $localize`:@@stats.p90:90 days` },
  { days: 0, label: $localize`:@@stats.pAll:All` },
];

const DAY_MS = 24 * 3600 * 1000;

/** The kinds of project the statistics tell apart. */
export const MODES: readonly { id: string; label: string }[] = [
  { id: '', label: $localize`:@@stats.modeAll:All` },
  { id: 'video', label: $localize`:@@modes.video:Video` },
  { id: 'images', label: $localize`:@@modes.images:Images` },
  { id: 'music', label: $localize`:@@modes.music:Music` },
];

/** The name of a kind of project; the runs of a project that is gone have none. */
export function modeName(mode: string | undefined): string {
  return MODES.find((m) => m.id === mode && m.id !== '')?.label ?? $localize`:@@stats.modeGone:Deleted project`;
}

/**
 * Statistics: figures and charts computed by the server from the run history
 * (durations, time per phase, cache, per-GPU use). Everything shown is also
 * available as a table, and the page never invents data the server did not send.
 */
@Component({
  selector: 'app-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FadeUpDirective,
    PageHeaderComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink,
    BarChartComponent,
    ChartFrameComponent,
    LineChartComponent,
    RatioBarComponent,
    StackedBarChartComponent,
    DynamicFormComponent,
    DfCellDirective,
    ModeSelectComponent,
  ],
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.scss',
})
export class StatsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly projects = inject(ProjectsStore);
  private readonly origins = inject(ModeFilterStore).origins;

  protected readonly periods = PERIODS;
  protected readonly project = signal('');
  /** The servers that have runs in the history, and the one the statistics are about ('' for all). */
  protected readonly servers = signal<string[]>([]);
  protected readonly server = signal('');
  /** Who asked for the runs (a generation panel, `unknown`, `embedded`): the ones seen in the history, and the one chosen ('' for all). */
  protected readonly clients = signal<string[]>([]);
  protected readonly client = signal('');
  protected readonly days = signal(30);
  /** The kind of project the statistics are about: video, images, music, or '' for all. */
  protected readonly mode = signal('');
  protected readonly stats = signal<StatsResult | null>(null);
  protected readonly loading = signal(false);
  /** The address of Grafana when one is saved in Settings (a link to it is offered); empty when not. */
  protected readonly grafana = signal('');
  protected readonly failed = signal<string | null>(null);

  protected readonly fmtSeconds = fmtSeconds;
  protected readonly fmtRuns = (v: number): string => fmtNumber(v);
  protected readonly fmtSecondsAxis = fmtSecondsAxis;
  /** The slowest-runs table: its columns live in `dynamic/tables.<lang>.json`. */
  protected readonly tables = schemaFor({ es: tablesEs, en: tablesEn });
  /** A run whose result is gone has no monitor to open: it gets no link. */
  protected readonly slowModel = computed(() => ({
    slowest: (this.stats()?.slowest ?? []).map((r) => ({ ...r, modeLabel: modeName(r.mode), runId: r.result_available === false ? null : r.id })),
  }));
  private readonly router = inject(Router);

  /** A link to a run stays inside the app. */
  protected onNavigate(e: DfTableNavigateEvent): void {
    e.originalEvent.preventDefault();
    void this.router.navigateByUrl(e.href);
  }

  async ngOnInit(): Promise<void> {
    void this.projects.load();
    // The servers of a shared history; with one (or when it cannot be read) the filter is not offered.
    firstValueFrom(this.api.getDatabase()).then((d) => this.servers.set(d.servers)).catch(() => undefined);
    firstValueFrom(this.api.getMonitoring()).then((m) => this.grafana.set(m.tools.find((t) => t.id === 'grafana')?.address ?? '')).catch(() => undefined);
    await this.reload();
    this.started = true;
  }

  /** The origins chosen in the shared selector, or nothing when both are (so the server does not filter). */
  private originParam(): string | undefined {
    const chosen = PROJECT_ORIGINS.filter((o) => this.origins().has(o));
    return chosen.length === PROJECT_ORIGINS.length ? undefined : chosen.join(',');
  }

  /** The origins chosen are none: there is nothing to count. */
  private readonly noOrigin = computed(() => PROJECT_ORIGINS.every((o) => !this.origins().has(o)));
  private started = false;

  constructor() {
    // Changing the origins in the shared selector counts the runs again.
    effect(() => {
      this.origins();
      untracked(() => {
        if (this.started) void this.reload();
      });
    });
  }

  protected async setProject(id: string): Promise<void> {
    this.project.set(id);
    await this.reload();
  }

  protected async setServer(name: string): Promise<void> {
    this.server.set(name);
    await this.reload();
  }

  protected async setClient(name: string): Promise<void> {
    this.client.set(name);
    await this.reload();
  }

  protected async setMode(m: string): Promise<void> {
    this.mode.set(m);
    await this.reload();
  }

  protected async setDays(d: number): Promise<void> {
    this.days.set(d);
    await this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.failed.set(null);
    if (this.noOrigin()) {
      this.stats.set(null);
      this.loading.set(false);
      return;
    }
    try {
      const d = this.days();
      const result = await firstValueFrom(
          this.api.getStats({
            project: this.project() || undefined,
            mode: this.mode() || undefined,
            origin: this.originParam(),
            server: this.server() || undefined,
            client: this.client() || undefined,
            since: d > 0 ? new Date(Date.now() - d * DAY_MS).toISOString() : '2000-01-01',
          }),
      );
      this.stats.set(result);
      // The clients are learned from a result that is not filtered by one: with one chosen the others would vanish.
      if (!this.client()) this.clients.set((result.by_client ?? []).map((g) => g.name));
    } catch {
      this.failed.set($localize`:@@stats.failed:Could not load the statistics.`);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly empty = computed(() => (this.stats()?.totals.runs ?? 0) === 0);

  // --- cards -----------------------------------------------------------------

  protected readonly cards = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const rate = s.totals.success_rate;
    const reuse = s.cache.reuse_share;
    return [
      { id: 'runs', label: $localize`:@@stats.cardRuns:Runs`, value: fmtNumber(s.totals.runs) },
      { id: 'success', label: $localize`:@@stats.cardSuccess:Success rate`, value: rate === undefined ? '—' : fmtPct(rate * 100) },
      { id: 'time', label: $localize`:@@stats.cardTime:Total time`, value: fmtSeconds(s.totals.total_seconds) },
      {
        id: 'median',
        label: $localize`:@@stats.cardMedian:Median duration`,
        value: s.duration.median_seconds === undefined ? '—' : fmtSeconds(s.duration.median_seconds),
      },
      { id: 'cache', label: $localize`:@@stats.cardCache:Reused phases`, value: reuse === undefined ? '—' : fmtPct(reuse * 100) },
    ];
  });

  // --- runs per day ------------------------------------------------------------

  protected readonly dayCategories = computed(() => this.stats()?.by_day.map((d) => d.date) ?? []);
  protected readonly daySeries = computed<StackSeries[]>(() => {
    const d = this.stats()?.by_day ?? [];
    return [
      { name: $localize`:@@stats.ok:successful`, kind: 'ok', values: d.map((x) => x.succeeded) },
      { name: $localize`:@@stats.bad:failed`, kind: 'bad', values: d.map((x) => x.failed) },
      { name: $localize`:@@stats.other:others`, kind: 'dim', values: d.map((x) => x.other) },
    ];
  });
  protected readonly dayTable = computed<ChartTable>(() => ({
    columns: [
      $localize`:@@stats.colDay:Day`,
      $localize`:@@stats.ok:successful`,
      $localize`:@@stats.bad:failed`,
      $localize`:@@stats.other:others`,
      $localize`:@@stats.colTime:Time`,
    ],
    rows: (this.stats()?.by_day ?? []).map((d) => [d.date, d.succeeded, d.failed, d.other, fmtSeconds(d.seconds)]),
  }));
  /** `2026-10-05` → `05/10`. */
  protected readonly shortDay = (c: string): string => `${c.slice(8, 10)}/${c.slice(5, 7)}`;

  // --- duration per run ----------------------------------------------------------

  protected readonly durationSeries = computed<LineSeries[]>(() => {
    const r = this.stats()?.run_durations ?? [];
    return [
      {
        name: $localize`:@@stats.duration:Duration`,
        kind: 'amber',
        points: r.map((x) => ({ x: Date.parse(x.created_at), y: x.seconds, label: `${x.id} (${x.state}): ${fmtSeconds(x.seconds)}` })),
      },
    ];
  });
  /**
   * The duration axis tops out at a round number of seconds, minutes or hours
   * (5, 10, 15, 20 min…) rather than a round number of seconds (16,7 min…).
   */
  protected readonly durationYMax = computed(() => {
    const top = Math.max(0, ...(this.stats()?.run_durations ?? []).map((r) => r.seconds), this.stats()?.duration.median_seconds ?? 0);
    const unit = top >= 3600 ? 3600 : top >= 60 ? 60 : 1;
    return niceCeil(top / unit) * unit;
  });
  protected readonly durationReference = computed(() => {
    const m = this.stats()?.duration.median_seconds;
    return m === undefined ? undefined : { y: m, label: $localize`:@@stats.median:median ${fmtSeconds(m)}:value:` };
  });
  protected readonly durationTable = computed<ChartTable>(() => ({
    columns: [$localize`:@@stats.colRun:Run`, $localize`:@@stats.colState:State`, $localize`:@@stats.colCreated:Created`, $localize`:@@stats.colDuration:Duration`],
    rows: (this.stats()?.run_durations ?? []).map((x) => [x.id, x.state, x.created_at, fmtSeconds(x.seconds)]),
  }));
  protected readonly shortDate = (ms: number): string => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // --- time per phase ---------------------------------------------------------------

  protected readonly phaseData = computed<BarDatum[]>(() =>
    (this.stats()?.phases ?? [])
      .filter((p) => p.executions > 0)
      .map((p) => ({
        label: p.phase,
        value: p.total_seconds,
        detail: $localize`:@@stats.phaseDetail:${p.executions}:n: executions · mean ${fmtSeconds(p.mean_seconds ?? 0)}:mean: · ${p.reused}:r: reused`,
      })),
  );
  protected readonly phaseTable = computed<ChartTable>(() => ({
    columns: [
      $localize`:@@stats.colPhase:Phase`,
      $localize`:@@stats.colExec:Executions`,
      $localize`:@@stats.colReused:Reused`,
      $localize`:@@stats.colTotal:Total`,
      $localize`:@@stats.colMean:Mean`,
      'p95',
    ],
    rows: (this.stats()?.phases ?? []).map((p) => [
      p.phase,
      p.executions,
      p.reused,
      fmtSeconds(p.total_seconds),
      p.mean_seconds === undefined ? '—' : fmtSeconds(p.mean_seconds),
      p.p95_seconds === undefined ? '—' : fmtSeconds(p.p95_seconds),
    ]),
  }));

  // --- cache -------------------------------------------------------------------------

  protected readonly cacheParts = computed<RatioPart[]>(() => {
    const c = this.stats()?.cache;
    return [
      { label: $localize`:@@stats.reused:reused`, value: c?.reused ?? 0, kind: 'solid' },
      { label: $localize`:@@stats.executed:executed`, value: c?.executed ?? 0, kind: 'hatch' },
    ];
  });
  protected readonly cacheTable = computed<ChartTable>(() => ({
    columns: [$localize`:@@stats.colKind:Phases`, $localize`:@@stats.colCount:Count`],
    rows: (this.stats()?.cache.executed ?? 0) + (this.stats()?.cache.reused ?? 0) === 0
      ? []
      : this.cacheParts().map((p) => [p.label, p.value]),
  }));
  protected readonly hasCache = computed(() => (this.stats()?.cache.executed ?? 0) + (this.stats()?.cache.reused ?? 0) > 0);

  // --- by kind of project ------------------------------------------------------------------

  protected readonly modes = MODES;
  protected readonly modeData = computed<BarDatum[]>(() =>
    (this.stats()?.by_mode ?? []).map((g) => ({
      label: modeName(g.name),
      value: g.runs,
      detail:
        $localize`:@@stats.modeDetail:${fmtSeconds(g.seconds)}:time: in total` +
        (g.success_rate === undefined ? '' : $localize`:@@stats.modeRate: · ${fmtPct(g.success_rate * 100)}:rate: success`),
    })),
  );
  protected readonly modeTable = computed<ChartTable>(() => ({
    columns: [$localize`:@@stats.colType:Type`, $localize`:@@stats.cardRuns:Runs`, $localize`:@@stats.colTime:Time`, $localize`:@@stats.cardSuccess:Success rate`],
    rows: (this.stats()?.by_mode ?? []).map((g) => [modeName(g.name), g.runs, fmtSeconds(g.seconds), g.success_rate === undefined ? '—' : fmtPct(g.success_rate * 100)]),
  }));

  // --- per GPU ---------------------------------------------------------------------------

  protected gpuName(name: string): string {
    return name === '' ? $localize`:@@stats.gpuNone:no GPU set` : `GPU ${name}`;
  }
  protected readonly gpuPeaks = computed<BarDatum[]>(() =>
    (this.stats()?.by_gpu ?? [])
      .filter((g) => g.peak_vram_pct !== undefined)
      .map((g) => ({
        label: this.gpuName(g.name),
        value: g.peak_vram_pct ?? 0,
        detail: $localize`:@@stats.gpuDetail:mean of peaks ${fmtPct(g.mean_peak_vram_pct ?? 0, 1)}:mean: over ${g.sampled_runs ?? 0}:n: runs`,
      })),
  );
  protected readonly gpuTable = computed<ChartTable>(() => ({
    columns: [
      'GPU',
      $localize`:@@stats.cardRuns:Runs`,
      $localize`:@@stats.colTime:Time`,
      $localize`:@@stats.cardSuccess:Success rate`,
      $localize`:@@stats.colPeak:Peak VRAM`,
    ],
    rows: (this.stats()?.by_gpu ?? []).map((g) => [
      this.gpuName(g.name),
      g.runs,
      fmtSeconds(g.seconds),
      g.success_rate === undefined ? '—' : fmtPct(g.success_rate * 100),
      g.peak_vram_pct === undefined ? '—' : fmtPct(g.peak_vram_pct, 1),
    ]),
  }));
  protected readonly pct = (v: number): string => fmtPct(v, 1);
}
