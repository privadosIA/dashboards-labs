import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { EngineAvailability, EngineReason } from '../../core/api.models';
import { EnginesStore } from '../../core/engines.store';
import { EnvironmentStore } from '../../core/environment.store';

const POLL_MS = 2000;

/** The reasons a container cannot be started yet, and where they are fixed. */
const FIXABLE_IN_MODELS: readonly EngineReason[] = ['no_weights'];

interface Row {
  id: 'heartmula' | 'diffrhythm2' | 'clap';
  name: string;
  engine: EngineAvailability;
}

/**
 * The containers of the music generators that run in one (HeartMuLa, DiffRhythm2) and the LAION-CLAP experiment: whether each is up, on which
 * card, the memory it uses, and the buttons that start and stop it. They stay up between songs; only the user stops
 * them (or the service does).
 */
@Component({
  selector: 'app-music-containers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink],
  templateUrl: './music-containers.component.html',
  styleUrl: './music-containers.component.scss',
})
export class MusicContainersComponent implements OnInit {
  protected readonly engines = inject(EnginesStore);
  protected readonly env = inject(EnvironmentStore);
  private readonly destroyRef = inject(DestroyRef);

  /** The card chosen for each generator; absent means the one with most free memory. */
  protected readonly gpuFor = signal<Record<string, number | undefined>>({});
  protected readonly busy = signal<Record<string, boolean>>({});

  /** One row per generator that runs in a container on this machine. */
  protected readonly rows = computed<Row[]>(() => {
    const d = this.engines.data();
    if (!d) return [];
    const out: Row[] = [];
    for (const [id, name] of [
      ['heartmula', 'HeartMuLa'],
      ['diffrhythm2', 'DiffRhythm2'],
      ['clap', 'LAION-CLAP'],
    ] as const) {
      const engine = d[id];
      if (engine) out.push({ id, name, engine });
    }
    return out;
  });

  ngOnInit(): void {
    void this.engines.refresh(true);
    const timer = setInterval(() => {
      if (this.engines.starting()) void this.engines.refresh(true);
    }, POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected state(r: Row): 'stopped' | 'starting' | 'running' {
    return r.engine.container?.state ?? 'stopped';
  }

  /** Why the container cannot be started now, when it cannot (not_running itself is what a start fixes). */
  protected blocked(r: Row): EngineReason | null {
    const reason = r.engine.reason;
    return reason && reason !== 'not_running' && r.engine.mode === 'local' ? reason : null;
  }

  protected inModels(reason: EngineReason): boolean {
    return FIXABLE_IN_MODELS.includes(reason);
  }

  protected reasonText(reason: EngineReason): string {
    switch (reason) {
      case 'no_service':
        return $localize`:@@env.containers.noService:Its service is not installed (bash scripts/get-services.sh) or .NET is missing.`;
      case 'no_weights':
        return $localize`:@@env.containers.noWeights:Its weights are missing.`;
      case 'no_gpu':
        return $localize`:@@env.containers.noGpu:No card has enough free memory.`;
      default:
        return $localize`:@@env.containers.other:It cannot be used now.`;
    }
  }

  protected pickGpu(id: string, value: string): void {
    this.gpuFor.update((m) => ({ ...m, [id]: value === '' ? undefined : +value }));
  }

  protected async start(r: Row): Promise<void> {
    this.busy.update((b) => ({ ...b, [r.id]: true }));
    try {
      await this.engines.start(r.id, this.gpuFor()[r.id]);
    } finally {
      this.busy.update((b) => ({ ...b, [r.id]: false }));
    }
  }

  protected async stop(r: Row): Promise<void> {
    this.busy.update((b) => ({ ...b, [r.id]: true }));
    try {
      await this.engines.stop(r.id);
    } finally {
      this.busy.update((b) => ({ ...b, [r.id]: false }));
    }
  }

  protected memory(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }
}
