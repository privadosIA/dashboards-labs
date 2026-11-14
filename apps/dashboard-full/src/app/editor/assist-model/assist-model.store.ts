import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AssistModel } from '../../core/api.models';
import { ApiService } from '../../core/api.service';

const STORAGE_KEY = 'mo.assistModel';

/** Above this size a model is too slow on the CPU to be comfortable (docs: docs/ASSISTANT.md). */
export const SLOW_MODEL_BYTES = 14e9;

/**
 * The model the prompt assistant uses, chosen from those installed in Ollama.
 * The choice (an empty one means "the server's default") is remembered in the
 * browser and shared by the editor and the music studio; it is a convenience
 * of the person using the browser, so it works without storage too.
 */
@Injectable({ providedIn: 'root' })
export class AssistModelStore {
  private readonly api = inject(ApiService);

  readonly models = signal<AssistModel[]>([]);
  /** The model a request that names none uses (from the server). */
  readonly defaultModel = signal('');
  readonly loaded = signal(false);
  private readonly choice = signal(readChoice());
  private requested = false;

  /**
   * The model to send, or '' for the default. Until the list has been read the
   * choice is trusted (the server refuses a model that is gone); after it, a
   * choice that is no longer installed counts as the default.
   */
  readonly selected = computed(() => {
    const c = this.choice();
    if (!c) return '';
    return !this.loaded() || this.models().some((m) => m.name === c) ? c : '';
  });

  /** Reads the installed models once; a failure (Ollama down) leaves the list empty and the default in use. */
  async load(): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    try {
      const res = await firstValueFrom(this.api.assistModels());
      this.models.set(res.models);
      this.defaultModel.set(res.default);
    } catch {
      this.models.set([]);
    } finally {
      this.loaded.set(true);
    }
  }

  choose(name: string): void {
    this.choice.set(name);
    try {
      if (name) localStorage.setItem(STORAGE_KEY, name);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no storage: the choice lasts until the page is reloaded
    }
  }

  /** Why a model deserves a warning ('' when it does not). */
  static warning(m: AssistModel): '' | 'memory' | 'slow' {
    if (!m.fits) return 'memory';
    return m.size_bytes > SLOW_MODEL_BYTES ? 'slow' : '';
  }
}

function readChoice(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
