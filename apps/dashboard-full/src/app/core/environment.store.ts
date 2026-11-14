import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EnvironmentReport, TokenSources, TokenStatus } from './api.models';
import { ApiService } from './api.service';

/**
 * Environment report cache: feeds the environment view, the editor's
 * model/voice/LoRA dropdowns and the launch form's GPU selector. refresh()
 * always hits the server (GPU VRAM must be fresh per request).
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentStore {
  private readonly api = inject(ApiService);

  readonly report = signal<EnvironmentReport | null>(null);
  readonly loading = signal(false);

  /** The edition of the program (fixed when it is built); null until the report is known. */
  readonly edition = computed(() => this.report()?.edition ?? null);
  /** Which projects the server shows; null until the report is known. */
  readonly contentMode = computed(() => this.report()?.content_mode ?? null);
  /** The server keeps projects for adults out of sight (also while the report is not known yet, to be safe). */
  readonly hidesAdult = computed(() => this.contentMode() !== 'all');
  /** The public edition lacks some controls (Civitai, "more detail", suggestions after a refusal). */
  readonly isPublic = computed(() => this.edition() === 'public');

  /** Every model file in `models/`, the retouch ones too: the editor's dropdowns and its "is it on disk" check need them all. */
  readonly models = computed(() => [...(this.report()?.models ?? []), ...(this.report()?.retouch ?? [])]);
  readonly voices = computed(() => this.report()?.voices ?? []);
  readonly loras = computed(() => this.report()?.loras ?? []);
  /** Installed music adapters (LoRAs), by name. */
  /** The lyrics reader is installed: whisper-cli and a Whisper model. */
  readonly whisperReady = computed(() => {
    const r = this.report();
    return !!r && r.binaries.some((b) => b.name === 'whisper-cli' && b.present) && (r.transcription ?? []).length > 0;
  });
  /** What is missing to read lyrics, in the order to install it ('' when nothing). */
  readonly whisperMissing = computed<'' | 'program' | 'model'>(() => {
    const r = this.report();
    if (!r) return '';
    if (!r.binaries.some((b) => b.name === 'whisper-cli' && b.present)) return 'program';
    return (r.transcription ?? []).length > 0 ? '' : 'model';
  });
  readonly musicAdapters = computed(() => (this.report()?.music_adapters ?? []).map((a) => a.name));
  readonly gpus = computed(() => this.report()?.gpus ?? []);
  /** The disk that holds the projects, once the report knows it. */
  readonly disk = computed(() => this.report()?.disk ?? null);
  /** The models directory (and the free space of its disk), when the server has one. */
  readonly modelsDir = computed(() => this.report()?.models_dir ?? null);
  /** The machine's memory, once the report knows it. */
  readonly ram = computed(() => this.report()?.ram ?? null);
  /** The Chrome or Chromium that draws motion graphics: null until the report is known, else whether the machine has one. */
  readonly browser = computed(() => {
    const b = this.report()?.binaries.find((x) => x.name === 'chrome');
    return b ? { present: b.present, version: b.version, fix: b.fix } : null;
  });
  /** Download keys the server has, or null until the report (or its `tokens`) is known. */
  readonly tokens = computed<TokenStatus | null>(() => this.report()?.tokens ?? null);

  /** Where each configured key comes from (empty until the report says). */
  readonly tokenSources = computed<TokenSources>(() => this.report()?.token_sources ?? {});

  async refresh(loraDir?: string): Promise<void> {
    this.loading.set(true);
    try {
      this.report.set(await firstValueFrom(this.api.getEnvironment(loraDir)));
    } finally {
      this.loading.set(false);
    }
  }

  /** Frees the VRAM Ollama retains, refreshes the report and returns the models dropped. */
  async unloadOllama(): Promise<string[]> {
    const res = await firstValueFrom(this.api.unloadOllama());
    await this.refresh();
    return res.unloaded;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.report()) {
      await this.refresh();
    }
  }
}
