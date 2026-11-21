import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AvailabilityResponse, RoutingTask, TaskAvailability, UnavailableReason } from './api.models';
import { ApiService } from './api.service';

/** The reasons that mean the provider answered but lacks the model the task needs: those get a notice. */
const MISSING_MODEL: readonly UnavailableReason[] = ['no_models', 'no_vision_model', 'no_model'];

/**
 * Which model tasks can run right now, so the controls that depend on a model are not offered
 * when they cannot work. Until an answer arrives (or when the server does not answer) nothing is
 * available: the controls stay hidden. It is read when the app starts, after any change in
 * Settings and when the window regains focus.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityStore {
  private readonly api = inject(ApiService);

  readonly data = signal<AvailabilityResponse | null>(null);
  /** True once an answer has been received (hidden controls and notices wait for it). */
  readonly known = computed(() => this.data() !== null);
  private requested = false;
  private watching = false;

  /** Reads it once; later calls use refresh. */
  async load(): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    await this.refresh();
  }

  /** Asks again (a change in Settings, or the window got the focus back). */
  async refresh(): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.getAvailability()));
    } catch {
      this.data.set(null); // the server does not answer: the controls stay hidden
    }
  }

  /** Refreshes when the window regains focus or the tab becomes visible; the server caches, so this is cheap. */
  watchFocus(): void {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    window.addEventListener('focus', () => void this.refresh());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refresh();
    });
  }

  task(task: RoutingTask): TaskAvailability | null {
    return this.data()?.tasks?.[task] ?? null;
  }

  /** Whether the task can run now (false while unknown). */
  available(task: RoutingTask): boolean {
    return this.task(task)?.available === true;
  }

  /** The task's provider answered but lacks the model it needs: a notice says so. Null otherwise (also while unknown). */
  missingModel(task: RoutingTask): TaskAvailability | null {
    const t = this.task(task);
    return t && !t.available && t.reason && MISSING_MODEL.includes(t.reason) ? t : null;
  }

  /** Any of the tasks can run. */
  anyAvailable(tasks: readonly RoutingTask[]): boolean {
    return tasks.some((t) => this.available(t));
  }
}
