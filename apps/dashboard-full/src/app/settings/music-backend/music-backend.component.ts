import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';

import { BackendNeed, BackendStatus, HeartMulaSettings, InstallJob, MusicBackend } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnginesStore } from '../../core/engines.store';
import { formatBytes } from '../../shared/format';
import { SourceChipComponent } from '../../shared/source-chip/source-chip.component';
import { InstallDialogComponent, InstallDialogData } from './install-dialog/install-dialog.component';

export type MusicEngine = 'heartmula' | 'diffrhythm2';

/** What a need of a backend is, in words. */
export function needLabel(need: BackendNeed): string {
  switch (need) {
    case 'service':
      return $localize`:@@mb.needService:the .NET service`;
    case 'weights':
      return $localize`:@@mb.needWeights:the model weights`;
    case 'docker':
      return $localize`:@@mb.needDocker:Docker`;
    case 'image':
      return $localize`:@@mb.needImage:the Docker image`;
    case 'gpu_runtime':
      return $localize`:@@mb.needGpuRuntime:the NVIDIA runtime for Docker`;
  }
}

/** One of the two ways a generator runs, with what it has or lacks. */
export interface BackendOption {
  id: MusicBackend;
  label: string;
  status: BackendStatus | null;
  /** Docker cannot be used on this server: it is off, and nothing here can fix it. */
  blocked: boolean;
  /** Something that can be downloaded or built is missing. */
  installable: boolean;
}

/**
 * How a music generator (HeartMuLa or DiffRhythm2) runs on this machine: the .NET service or the Python container (Docker). It shows what each way has
 * or lacks, saves the choice at once, starts and stops what runs, and offers to download what is missing (the server plans it, the person confirms,
 * and the job is followed in a dialog). Drawn only for a server whose settings carry the backend; an address of another machine wins over it.
 */
@Component({
  selector: 'app-music-backend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatRadioModule, SourceChipComponent],
  templateUrl: './music-backend.component.html',
  styleUrl: './music-backend.component.scss',
})
export class MusicBackendComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  protected readonly engines = inject(EnginesStore);

  readonly engine = input.required<MusicEngine>();
  readonly settings = input.required<HeartMulaSettings>();
  /** The settings block after a change of the choice. */
  readonly changed = output<HeartMulaSettings>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The install of this engine that is running, if any (found when the card opens, and after the dialog). */
  protected readonly installing = signal<InstallJob | null>(null);

  protected readonly current = computed(() => this.settings().backend ?? 'dotnet');
  protected readonly isDefault = computed(() => this.settings().backend_source !== 'setting');
  /** An address is saved: the engine is an external service, and the choice does not apply. */
  protected readonly external = computed(() => !!this.settings().saved);
  private readonly entry = computed(() => this.engines.data()?.[this.engine()] ?? null);
  protected readonly container = computed(() => this.entry()?.container ?? null);
  protected readonly options = computed<BackendOption[]>(() => {
    const backends = this.entry()?.backends;
    return (['dotnet', 'docker'] as const).map((id) => {
      const status = backends?.[id] ?? null;
      const missing = status?.missing ?? [];
      const blocked = missing.includes('docker');
      return {
        id,
        label: id === 'dotnet' ? $localize`:@@mb.dotnet:.NET service` : $localize`:@@mb.docker:Python container (Docker)`,
        status,
        blocked,
        installable: !blocked && missing.some((m) => m === 'service' || m === 'image' || m === 'weights'),
      };
    });
  });
  /** The backend in use has everything: it can be started. */
  protected readonly ready = computed(() => this.options().find((o) => o.id === this.current())?.status?.available === true);
  protected readonly running = computed(() => this.container()?.state === 'running' || this.container()?.state === 'starting');

  constructor() {
    // A container that is starting is read again until it is up.
    effect((onCleanup) => {
      if (this.container()?.state !== 'starting') return;
      const timer = setInterval(() => void this.engines.refresh(), 2000);
      onCleanup(() => clearInterval(timer));
    });
    // An install that runs is read again until it ends (the dialog may be closed), and what it brought is shown.
    effect((onCleanup) => {
      if (!this.installing()) return;
      const timer = setInterval(() => {
        void this.findInstall();
        void this.engines.refresh();
      }, 2000);
      onCleanup(() => clearInterval(timer));
    });
  }

  ngOnInit(): void {
    void this.engines.refresh();
    void this.findInstall();
  }

  /** What each backend lacks, in words, with the size to download. */
  protected lacking(o: BackendOption): string {
    const s = o.status;
    if (!s || s.available) return '';
    const what = (s.missing ?? []).map(needLabel).join(', ') || s.detail || '';
    return s.need_bytes ? `${what} (${formatBytes(s.need_bytes)})` : what;
  }

  protected async choose(value: MusicBackend): Promise<void> {
    if (value === this.current() || this.external() || this.saving()) return;
    await this.put(value);
  }

  /** Goes back to the default (the .NET service) by removing the saved choice. */
  protected async useDefault(): Promise<void> {
    await this.put('');
  }

  private async put(value: MusicBackend | ''): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.putMusicBackend(this.engine(), value));
      const block = res[this.engine()];
      if (block) this.changed.emit(block);
      await this.engines.refresh();
    } catch (e) {
      // The choice stays as it was: what is shown comes from the saved value.
      this.error.set((e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@mb.saveFailed:The choice could not be saved.`);
    } finally {
      this.saving.set(false);
    }
  }

  protected start(): Promise<void> {
    return this.engines.start(this.engine());
  }

  protected stop(): Promise<void> {
    return this.engines.stop(this.engine());
  }

  /** Opens the install dialog for a backend (it asks the server for the plan first), or follows the job that already runs. */
  protected install(backend: MusicBackend): void {
    this.openInstall({ engine: this.engine(), backend });
  }

  protected showProgress(): void {
    const job = this.installing();
    if (job) this.openInstall({ engine: job.engine, backend: job.backend, jobId: job.id });
  }

  private openInstall(data: InstallDialogData): void {
    this.dialog
      .open(InstallDialogComponent, { data, width: '640px', maxWidth: '95vw', disableClose: false })
      .afterClosed()
      .subscribe(() => {
        void this.engines.refresh();
        void this.findInstall();
      });
  }

  /** An install of this engine that is running (a reload does not lose it). */
  private async findInstall(): Promise<void> {
    try {
      const { installs } = await firstValueFrom(this.api.listInstalls());
      this.installing.set(installs.find((i) => i.engine === this.engine() && i.state === 'running') ?? null);
    } catch {
      this.installing.set(null);
    }
  }
}
