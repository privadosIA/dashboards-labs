import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { RoutedTask, RoutingResponse, RoutingTask } from './api.models';
import { ApiService } from './api.service';

/**
 * Which provider runs each task, shared by every screen that has a control using one:
 * the badge next to those controls, their availability and the Tasks card of Settings.
 * It is read once when the app starts (and again after the Tasks card saves); without
 * it (no answer) nothing is shown, which is what the built-in Ollama looks like.
 */
@Injectable({ providedIn: 'root' })
export class RoutingStore {
  private readonly api = inject(ApiService);

  readonly routing = signal<RoutingResponse | null>(null);
  readonly maxCalls = computed(() => this.routing()?.max_calls ?? 60);
  private requested = false;

  /** Reads the routing once; a failure leaves it empty (no badges). */
  async load(): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    await this.refresh();
  }

  /** Reads it again (after a change). */
  async refresh(): Promise<void> {
    try {
      this.routing.set(await firstValueFrom(this.api.getRouting()));
    } catch {
      this.routing.set(null);
    }
  }

  /** Replaces what the store knows with an answer of the API (after the Tasks card saved). */
  set(res: RoutingResponse): void {
    this.routing.set(res);
  }

  task(task: RoutingTask): RoutedTask | null {
    return this.routing()?.routing[task] ?? null;
  }

  /** The provider's name when the task runs on a remote one, else null: the badge says it. */
  remoteName(task: RoutingTask): string | null {
    const t = this.task(task);
    return t?.remote && t.provider !== 'ollama' ? t.name : null;
  }

  /** Whether the task runs on a provider that is not the built-in Ollama. */
  external(task: RoutingTask): boolean {
    const t = this.task(task);
    return !!t && t.provider !== 'ollama';
  }
}
