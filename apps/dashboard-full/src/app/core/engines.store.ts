import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EngineAvailability, EngineReason } from './api.models';
import { ApiService } from './api.service';

/** The reasons that are something to install on this machine: only those get an install notice. */
const INSTALLABLE: readonly EngineReason[] = ['no_weights'];

/**
 * The optional music engines (HeartMuLa) and whether each can be used now. Until the server answers
 * nothing is available: the engine's controls stay hidden. Like the model availability, it is read
 * when a studio opens and after a change in Settings.
 */
@Injectable({ providedIn: 'root' })
export class EnginesStore {
  private readonly api = inject(ApiService);

  readonly data = signal<Record<string, EngineAvailability> | null>(null);
  readonly heartmula = computed(() => this.data()?.['heartmula'] ?? null);
  readonly diffrhythm2 = computed(() => this.data()?.['diffrhythm2'] ?? null);
  /** The container of the generator is stopped (or starting): it is offered, with a notice, but a song cannot be made yet. */
  readonly diffrhythm2Stopped = computed(() => this.diffrhythm2()?.reason === 'not_running');
  readonly heartmulaStopped = computed(() => this.heartmula()?.reason === 'not_running');
  /** DiffRhythm2 is offered: it can make songs now, or it only needs its container started. */
  readonly diffrhythm2Available = computed(() => this.diffrhythm2()?.available === true || this.diffrhythm2Stopped());
  /** Something local is missing (the image or the weights): the Models tab builds both in one step. */
  readonly diffrhythm2Installable = computed(() => {
    const d = this.diffrhythm2();
    return !!d && !d.available && !!d.reason && INSTALLABLE.includes(d.reason);
  });
  /** HeartMuLa is offered: it can make songs now, or it only needs its container started. */
  readonly heartmulaAvailable = computed(() => this.heartmula()?.available === true || this.heartmulaStopped());
  /** Something local is missing (the image or the weights): the studio says how to install it. */
  readonly heartmulaInstallable = computed(() => {
    const h = this.heartmula();
    return !!h && !h.available && !!h.reason && INSTALLABLE.includes(h.reason);
  });

  /** A container is being started. */
  readonly starting = computed(() => Object.values(this.data() ?? {}).some((e) => e.container?.state === 'starting'));
  /** Why the last call to start or stop failed. */
  readonly callError = signal<string | null>(null);

  async refresh(stats = false): Promise<void> {
    try {
      this.data.set((await firstValueFrom(this.api.getMusicEngines(stats))).engines);
    } catch {
      this.data.set(null);
    }
  }

  /** Starts the container of a generator; the answer comes back at once and the state is polled until it is up. */
  async start(engine: string, gpu?: number): Promise<void> {
    this.callError.set(null);
    try {
      await firstValueFrom(this.api.startMusicEngine(engine, gpu));
    } catch (e) {
      this.callError.set(errorText(e));
    }
    await this.refresh(true);
  }

  async stop(engine: string): Promise<void> {
    this.callError.set(null);
    try {
      await firstValueFrom(this.api.stopMusicEngine(engine));
    } catch (e) {
      this.callError.set(errorText(e));
    }
    await this.refresh(true);
  }
}

function errorText(e: unknown): string {
  const body = (e as { error?: { error?: { message?: string } } })?.error?.error;
  return body?.message ?? (e instanceof Error ? e.message : String(e));
}
