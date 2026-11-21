import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { InstallJob, InstallPart, InstallPartName, InstallPlan, MusicBackend } from '../../../core/api.models';
import { ApiService } from '../../../core/api.service';
import { EnginesStore } from '../../../core/engines.store';
import { InstallStreamService } from '../../../core/install-stream.service';
import { formatBytes } from '../../../shared/format';

export interface InstallDialogData {
  engine: string;
  backend: MusicBackend;
  /** A job that already runs: it is followed, no plan is asked for. */
  jobId?: string;
}

/** The most log lines kept on the screen. */
const MAX_LOG = 200;

/** What a part of an install is, in words. */
export function partLabel(part: InstallPartName): string {
  switch (part) {
    case 'service':
      return $localize`:@@mbi.partService:.NET service`;
    case 'image':
      return $localize`:@@mbi.partImage:Docker image (Python)`;
    case 'weights':
      return $localize`:@@mbi.partWeights:Model weights`;
  }
}

/**
 * Installs what a generator lacks: it shows the server's plan (the parts and their sizes, the free disk, the licences to accept) and starts nothing until the
 * person confirms; then it follows the job (the parts and their state, the log as it comes) and can cancel it. Closing the dialog leaves the job running.
 */
@Component({
  selector: 'app-music-install-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  templateUrl: './install-dialog.component.html',
  styleUrl: './install-dialog.component.scss',
})
export class InstallDialogComponent implements OnInit, OnDestroy {
  protected readonly data = inject<InstallDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly stream = inject(InstallStreamService);
  private readonly engines = inject(EnginesStore);

  protected readonly loading = signal(true);
  protected readonly plan = signal<InstallPlan | null>(null);
  protected readonly job = signal<InstallJob | null>(null);
  protected readonly log = signal<string[]>([]);
  protected readonly accepted = signal(false);
  protected readonly starting = signal(false);
  protected readonly cancelling = signal(false);
  /** Why a call did not work, in the server's words. */
  protected readonly error = signal<string | null>(null);

  private conn: { close(): void } | null = null;

  protected readonly label = partLabel;
  protected readonly bytes = formatBytes;
  /** The licences of the plan, each once. */
  protected readonly licenses = computed(() => [...new Set((this.plan()?.parts ?? []).flatMap((p) => p.licenses ?? []))]);
  /** The disk does not hold what the plan needs: it cannot start. */
  protected readonly short = computed(() => (this.plan()?.disk ?? []).find((d) => !d.sufficient) ?? null);
  protected readonly canStart = computed(() => {
    const p = this.plan();
    return !!p && p.confirm_required && !this.short() && (this.licenses().length === 0 || this.accepted()) && !this.starting();
  });
  protected readonly running = computed(() => this.job()?.state === 'running');
  /** The part that failed, if one did. */
  protected readonly failedPart = computed(() => this.job()?.parts.find((p) => p.state === 'failed') ?? null);

  ngOnInit(): void {
    if (this.data.jobId) void this.follow(this.data.jobId);
    else void this.loadPlan();
  }

  ngOnDestroy(): void {
    // Closing the dialog does not stop the job: only the reading of it.
    this.conn?.close();
  }

  protected async loadPlan(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.job.set(null);
    this.log.set([]);
    try {
      this.plan.set(await firstValueFrom(this.api.planInstall(this.data.engine, { backend: this.data.backend })));
    } catch (e) {
      this.plan.set(null);
      this.error.set(reason(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async confirm(): Promise<void> {
    if (!this.canStart()) return;
    this.starting.set(true);
    this.error.set(null);
    try {
      const { install } = await firstValueFrom(this.api.startInstall(this.data.engine, { backend: this.data.backend }));
      this.job.set(install);
      this.log.set([]);
      this.watch(install.id);
    } catch (e) {
      this.error.set(reason(e));
    } finally {
      this.starting.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const job = this.job();
    if (!job || this.cancelling()) return;
    this.cancelling.set(true);
    this.error.set(null);
    try {
      this.job.set((await firstValueFrom(this.api.cancelInstall(job.id))).install);
    } catch (e) {
      this.error.set(reason(e));
    } finally {
      this.cancelling.set(false);
    }
  }

  /** Reads a job that already runs and follows it. */
  private async follow(id: string): Promise<void> {
    try {
      this.job.set((await firstValueFrom(this.api.getInstall(id))).install);
      this.watch(id);
    } catch (e) {
      this.error.set(reason(e));
    } finally {
      this.loading.set(false);
    }
  }

  private watch(id: string): void {
    this.conn?.close();
    this.conn = this.stream.connect(id, {
      onState: (job) => this.job.set(job),
      onLog: (line) => this.log.update((l) => [...l, line].slice(-MAX_LOG)),
      onEnd: () => void this.engines.refresh(),
    });
  }

  protected partState(p: InstallPart): string {
    switch (p.state) {
      case 'running':
        return $localize`:@@mbi.running:Running`;
      case 'done':
        return $localize`:@@mbi.done:Done`;
      case 'skipped':
        return $localize`:@@mbi.skipped:Already there`;
      case 'failed':
        return $localize`:@@mbi.failed:Failed`;
      case 'cancelled':
        return $localize`:@@mbi.cancelled:Cancelled`;
      default:
        return $localize`:@@mbi.pending:Waiting`;
    }
  }

  protected partIcon(p: InstallPart): string {
    switch (p.state) {
      case 'running':
        return 'hourglass_top';
      case 'done':
      case 'skipped':
        return 'check_circle';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'cancel';
      default:
        return 'radio_button_unchecked';
    }
  }
}

function reason(e: unknown): string {
  return (e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@mbi.callFailed:The server could not do it.`;
}
