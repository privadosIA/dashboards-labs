import { AutoAnimateDirective } from '@lab/motion-ui';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { DfCellDirective, DfTableActionEvent, DfTableNavigateEvent, DfTableSelectEvent, DynamicFormComponent } from '@core/dynamic-forms';
import { firstValueFrom } from 'rxjs';

import { CacheReport, FINISHED_RUN_STATES, Run, RunRequest, RunsDeleteRequest, Scene } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { ModeFilterStore, hiddenRunModes, visibleProjects, visibleRuns } from '../../core/mode-filter.store';
import { ProjectsStore } from '../../core/projects.store';
import { openConfirmWithOption } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModeSelectComponent } from '../../shared/mode-select/mode-select.component';
import { schemaFor } from '../../shared/dynamic/schema-loader';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { videoPhases } from '../phase-strip/strip-model';
import { ResultLink, resultLink } from '../result-link';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { GpuWarningsComponent } from '../../shared/gpu-warnings/gpu-warnings.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import tablesEn from './dynamic/tables.en.json';
import tablesEs from './dynamic/tables.es.json';

/** A run as the history table shows it: the facts it sorts and filters by are worked out once. */
export interface RunRow extends Run {
  finished: boolean;
  options: string;
  durationMs: number | null;
}

/**
 * Run surface: launch form (CLI-equivalent options, GPU list with the
 * Ollama caveat at the point of selection, cold-run warning), the
 * per-scene cache report with targeted re-render, and the run history.
 */
@Component({
  selector: 'app-runs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutoAnimateDirective,
    ModeSelectComponent,
    PageHeaderComponent,
    PanelComponent,
    EmptyStateComponent,
    GpuWarningsComponent,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    DynamicFormComponent,
    DfCellDirective,
    BytesPipe,
    RouterLink,
  ],
  templateUrl: './runs-page.component.html',
  styleUrl: './runs-page.component.scss',
})
export class RunsPageComponent implements OnInit {
  /** Optional project preselection (?project=). */
  readonly project = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  protected readonly projects = inject(ProjectsStore);
  protected readonly modes = inject(ModeFilterStore);
  protected readonly env = inject(EnvironmentStore);

  protected readonly selectedProject = signal<string>('');
  protected readonly scenes = signal<Scene[]>([]);
  protected readonly cache = signal<CacheReport | null>(null);
  protected readonly history = signal<Run[]>([]);
  protected readonly launching = signal(false);

  // Launch options (CLI equivalents).
  /** Selected GPU indexes (as strings); empty = no GPU pinned. */
  protected readonly gpu = signal<string[]>([]);
  /** The value sent to the API: ascending indexes joined by commas, or undefined. */
  protected readonly gpuValue = computed(() => {
    const picked = this.gpu()
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
    return picked.length ? picked.join(',') : undefined;
  });
  protected readonly keepTmp = signal(true);
  protected readonly force = signal(false);
  protected readonly only = signal('');
  protected readonly vramWarnMb = signal(2048);
  protected readonly modeOverride = signal('');

  /** The history table: its columns, actions and selection rules live in `dynamic/tables.<lang>.json`. */
  protected readonly tables = schemaFor({ es: tablesEs, en: tablesEn });
  protected readonly table = viewChild(DynamicFormComponent);
  /** The runs of the list, with what the table needs to sort, filter and show them. */
  protected readonly rows = computed<RunRow[]>(() =>
    this.visibleHistory().map((r) => ({ ...r, finished: this.isFinished(r), options: this.optionsOf(r), durationMs: this.durationOf(r) })),
  );
  protected readonly tableModel = computed(() => ({ history: this.rows() }));
  /** What the table's conditions read: no run can be deleted while a deletion is under way. */
  protected readonly tableContext = computed(() => ({ deleting: this.deleting() }));

  // History deletion: only finished runs can be selected or deleted.
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly deleting = signal(false);
  /** What the last deletion did, shown until the next one. */
  protected readonly deleteResult = signal<string | null>(null);
  /**
   * The projects the launch form offers: those of the modes the user chose (the same choice as everywhere), so a long
   * list can be cut down to videos, pictures or songs. The project already picked stays, whatever its mode.
   */
  protected readonly launchProjects = computed(() => {
    const list = visibleProjects(this.projects.projects(), this.modes.modes(), this.modes.origins());
    const picked = this.selectedProject();
    const current = picked && !list.some((p) => p.id === picked) ? this.projects.projects().find((p) => p.id === picked) : undefined;
    return current ? [current, ...list] : list;
  });

  /** The runs of the modes the user chose (the same choice as the projects list and the gallery). */
  protected readonly visibleHistory = computed(() => visibleRuns(this.history(), this.projects.projects(), this.modes.modes(), this.modes.origins()));
  /** The modes with runs that are not chosen. */
  protected readonly hiddenModes = computed(() => hiddenRunModes(this.history(), this.projects.projects(), this.modes.modes(), this.modes.origins()));
  protected readonly finished = computed(() => this.visibleHistory().filter((r) => this.isFinished(r)));

  protected modeLabel(mode: string): string {
    return mode === 'video' ? $localize`:@@modes.video:Video` : mode === 'images' ? $localize`:@@modes.images:Images` : $localize`:@@modes.music:Music`;
  }

  /** The selected GPUs, by index. */
  protected readonly selectedGpus = computed(() => {
    const picked = new Set(this.gpu());
    return this.env
      .gpus()
      .filter((g) => picked.has(String(g.index)))
      .sort((a, b) => a.index - b.index);
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.projects.load(), this.env.ensureLoaded()]);
    const pre = this.project();
    if (pre && this.projects.projects().some((p) => p.id === pre)) {
      await this.selectProject(pre);
    } else {
      await this.reloadHistory();
    }
  }

  protected async selectProject(id: string): Promise<void> {
    this.selectedProject.set(id);
    this.only.set('');
    this.cache.set(null);
    this.scenes.set([]);
    await this.reloadHistory();
    if (!id) return;
    const [cfg, cache] = await Promise.all([
      firstValueFrom(this.api.getConfig(id)),
      firstValueFrom(this.api.getCache(id)).catch(() => null),
    ]);
    this.scenes.set(cfg.parsed?.scenes ?? []);
    this.cache.set(cache);
  }

  protected async reloadHistory(): Promise<void> {
    const runs = await firstValueFrom(this.api.listRuns(this.selectedProject() || undefined));
    this.history.set(runs);
    // A selection never keeps runs that left the list (deleted, or another project).
    const present = new Set(runs.map((r) => r.id));
    this.selected.update((sel) => new Set([...sel].filter((id) => present.has(id))));
  }

  protected isFinished(r: Run): boolean {
    return FINISHED_RUN_STATES.includes(r.state);
  }

  /** The table says which runs are ticked; the page only needs their ids. */
  protected onTableSelect(e: DfTableSelectEvent): void {
    this.selected.set(new Set(e.rows.map((r) => String(r['id']))));
  }

  protected onTableAction(e: DfTableActionEvent): void {
    if (e.action === 'delete') void this.deleteOne(e.row as unknown as RunRow);
  }

  /** A link to a run stays inside the app. */
  protected onTableNavigate(e: DfTableNavigateEvent): void {
    e.originalEvent.preventDefault();
    void this.router.navigateByUrl(e.href);
  }

  /** Resolves to null when cancelled, else whether to delete the output files too. */
  private async confirmDelete(count: number): Promise<{ deleteFiles: boolean } | null> {
    const res = await firstValueFrom(
      openConfirmWithOption(this.dialog, {
        title: $localize`:@@runs.deleteTitle:Delete from the history`,
        message: $localize`:@@runs.deleteMessage:${count}:count: run(s) will be deleted from the history, with all their events. This cannot be undone. By default the files they generated (videos, images) are kept.`,
        option: $localize`:@@runs.deleteFilesOption:Also delete the generated files (each run's out/ folder, the clips kept for each scene and the project's tmp/ cache: the editor thumbnails disappear too and the next run will start from scratch)`,
        confirmLabel: $localize`:@@runs.deleteAction:Delete from the history`,
        destructive: true,
      }),
    );
    return res.confirmed ? { deleteFiles: res.option } : null;
  }

  /** Reports what a deletion did and reloads the list with an empty selection. */
  private async finishDelete(deleted: number, skipped: number, files?: number): Promise<void> {
    let msg =
      skipped > 0
        ? $localize`:@@runs.deletedSkipped:Deleted: ${deleted}:deleted:. ${skipped}:skipped: were not deleted because they are active.`
        : $localize`:@@runs.deleted:Deleted: ${deleted}:deleted:.`;
    if (files !== undefined) {
      msg += ' ' + $localize`:@@runs.filesRemoved:Folders deleted: ${files}:files:.`;
    }
    this.deleteResult.set(msg);
    this.table()?.clearSelection();
    this.selected.set(new Set());
    await this.reloadHistory();
  }

  protected async deleteOne(r: Run): Promise<void> {
    if (this.deleting()) return;
    const choice = await this.confirmDelete(1);
    if (!choice) return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.deleteRun(r.id, choice.deleteFiles));
      await this.finishDelete(1, 0);
    } catch {
      // the error interceptor explains it (e.g. the run became active)
      await this.reloadHistory();
    } finally {
      this.deleting.set(false);
    }
  }

  protected async deleteSelected(): Promise<void> {
    const ids = [...this.selected()];
    if (ids.length === 0 || this.deleting()) return;
    const choice = await this.confirmDelete(ids.length);
    if (!choice) return;
    await this.runBatch({ ids, ...(choice.deleteFiles ? { delete_files: true } : {}) });
  }

  /** "Borrar todos los terminados": the finished runs of the project filter in the list. */
  protected async deleteAllFinished(): Promise<void> {
    const n = this.finished().length;
    if (n === 0 || this.deleting()) return;
    const choice = await this.confirmDelete(n);
    if (!choice) return;
    const project = this.selectedProject();
    // With modes hidden the filter would also reach the runs the user cannot see: only the ones in the list go.
    const hiding = this.visibleHistory().length !== this.history().length;
    await this.runBatch({
      ...(hiding ? { ids: this.finished().map((r) => r.id) } : { ...(project ? { project } : {}), states: [...FINISHED_RUN_STATES] }),
      ...(choice.deleteFiles ? { delete_files: true } : {}),
    });
  }

  private async runBatch(req: RunsDeleteRequest): Promise<void> {
    this.deleting.set(true);
    try {
      const res = await firstValueFrom(this.api.deleteRuns(req));
      await this.finishDelete(
        res.deleted,
        res.skipped_active.length,
        req.delete_files ? (res.files_removed ?? 0) : undefined,
      );
    } catch {
      // surfaced by the interceptor; the selection stays
    } finally {
      this.deleting.set(false);
    }
  }

  protected async launch(extra: Partial<RunRequest> = {}): Promise<void> {
    const project = this.selectedProject();
    if (!project || this.launching()) return;
    this.launching.set(true);
    try {
      const req: RunRequest = {
        gpu: this.gpuValue(),
        keep_tmp: this.keepTmp(),
        force: this.force(),
        only: this.only() || undefined,
        vram_warn_mb: this.vramWarnMb(),
        mode: this.modeOverride() || undefined,
        ...extra,
      };
      const res = await firstValueFrom(this.api.launchRun(project, req));
      await this.router.navigate(['/runs', res.run.id]);
    } finally {
      this.launching.set(false);
    }
  }

  /** "Re-renderizar solo esta escena" (= --only, spec run-monitor). */
  protected async relaunchScene(sceneId: string): Promise<void> {
    await this.launch({ only: sceneId });
  }

  protected durationOf(r: Run): number | null {
    if (!r.started_at || !r.finished_at) return null;
    return new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
  }

  /** "3 s", "4 min 12 s", "1 h 02 min": the same shape in every row, unlike the clock time. */
  protected readableDuration(ms: number | null | undefined): string {
    if (ms == null || !isFinite(ms) || ms < 0) return '—';
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
    if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
    return ms < 1000 ? '< 1 s' : `${s} s`;
  }

  protected resultOf(r: Run): ResultLink | null {
    return resultLink(r, r.artifact, r.state, this.projects.projects().find((p) => p.id === r.project)?.mode);
  }

  protected videoUrl(r: Run, link: ResultLink & { kind: 'video' }): string {
    return this.api.artifactUrl(r.project, link.artifact);
  }

  protected optionsOf(r: Run): string {
    const bits: string[] = [];
    if (r.gpu) bits.push(`gpu ${r.gpu}`);
    if (r.keep_tmp) bits.push('keep-tmp');
    if (r.force) bits.push('force');
    if (r.only) bits.push(`only ${r.only}`);
    if (r.mode) bits.push(r.mode);
    return bits.join(' · ');
  }

  /**
   * Columns of the cache table. The video columns gain `animate` (between
   * render and clip) only when the report carries that phase for some scene.
   */
  protected cachePhases(report: CacheReport): string[] {
    if (report.mode === 'images') {
      return ['render', 'export'];
    }
    return videoPhases(
      report.scenes.flatMap((sc) => Object.keys(sc.phases).map((phase) => ({ phase }))),
    );
  }
}
