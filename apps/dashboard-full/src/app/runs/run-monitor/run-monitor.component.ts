import { HttpErrorResponse } from '@angular/common/http';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Run } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { RunStream, RunStreamService } from '../../core/run-stream.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { RunResourcesComponent } from '../run-resources/run-resources.component';
import { PhaseStripComponent } from '../phase-strip/phase-strip.component';
import { buildStrip } from '../phase-strip/strip-model';
import { resultLink } from '../result-link';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

/**
 * Run monitor: the strip fed by the SSE stream (live or stored replay —
 * one renderer for both, spec run-monitor), cancellation, the raw event
 * log, and the final artifact player once the run succeeds.
 */
@Component({
  selector: 'app-run-monitor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PhaseStripComponent,
    ScrollingModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressBarModule,
    RouterLink,
    RunResourcesComponent,
    PageHeaderComponent,
    DurationPipe,
  ],
  templateUrl: './run-monitor.component.html',
  styleUrl: './run-monitor.component.scss',
})
export class RunMonitorComponent implements OnInit, OnDestroy {
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly streams = inject(RunStreamService);
  private readonly dialog = inject(MatDialog);
  private readonly projects = inject(ProjectsStore);

  protected readonly run = signal<Run | null>(null);
  protected readonly queuePosition = signal<number | undefined>(undefined);
  protected stream!: RunStream;
  private ticker: ReturnType<typeof setInterval> | undefined;
  protected readonly nowMs = signal(Date.now());

  protected readonly state = computed(
    () => this.stream?.state()?.state ?? this.run()?.state ?? 'queued',
  );
  protected readonly active = computed(
    () => this.state() === 'queued' || this.state() === 'running',
  );
  protected readonly model = computed(() => buildStrip(this.stream?.events() ?? []));

  /** Elapsed: live ticking while running, the pipeline's total when done. */
  protected readonly elapsedMs = computed(() => {
    const m = this.model();
    if (m.totalDurationMs != null) {
      return m.totalDurationMs;
    }
    if (!m.startedAt) {
      return null;
    }
    return this.nowMs() - new Date(m.startedAt).getTime();
  });

  protected readonly finalArtifactUrl = computed(() => {
    const run = this.run();
    const artifact = this.model().finalArtifact ?? this.stream?.state()?.artifact;
    return run && artifact ? this.api.artifactUrl(run.project, artifact) : null;
  });

  /** Where the finished run's result lives; null until it succeeded. */
  protected readonly result = computed(() => {
    const run = this.run();
    if (!run) return null;
    const artifact = this.model().finalArtifact ?? this.stream?.state()?.artifact ?? run.artifact;
    const mode = this.projects.projects().find((p) => p.id === run.project)?.mode;
    return resultLink(run, artifact, this.state(), mode);
  });

  /** The run no longer exists: it was deleted from the history. */
  protected readonly gone = signal(false);

  async ngOnInit(): Promise<void> {
    void this.projects.load(); // the project's mode tells the music studio from the gallery
    this.stream = this.streams.connect(this.id());
    this.ticker = setInterval(() => this.nowMs.set(Date.now()), 1000);
    try {
      const res = await firstValueFrom(this.api.getRun(this.id(), true));
      this.run.set(res.run);
      this.queuePosition.set(res.queue_position);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        // Deleted from the history (e.g. a stale link): say so instead of a generic error.
        this.stream?.close();
        this.gone.set(true);
        return;
      }
      throw err;
    }
  }

  ngOnDestroy(): void {
    this.stream?.close();
    clearInterval(this.ticker);
  }

  protected async cancel(): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@monitor.cancelTitle:Cancel run`,
        message: $localize`:@@monitor.cancelMessage:Run ${this.id()}:run: and its subprocesses will be stopped. Phases already cached are kept.`,
        confirmLabel: $localize`:@@monitor.cancelAction:Cancel run`,
        destructive: true,
      }),
    );
    if (ok) {
      await firstValueFrom(this.api.cancelRun(this.id()));
    }
  }
}
