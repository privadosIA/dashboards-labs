import { AutoAnimateDirective } from '@lab/motion-ui';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { EnginesStore } from '../../core/engines.store';
import { EnvironmentStore } from '../../core/environment.store';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { GpuStatus } from '../../core/api.models';
import { GpuWarningsComponent } from '../../shared/gpu-warnings/gpu-warnings.component';
import { MusicContainersComponent } from '../music-containers/music-containers.component';
import { PanelComponent } from '../../shared/panel/panel.component';

/**
 * Environment checklist (deliberately quiet — a list you read twice a
 * month, not a dashboard): binaries with the fixing script named but
 * never executable from here, asset inventories, GPUs with fresh VRAM
 * and the Ollama caveat on the affected GPU.
 */
@Component({
  selector: 'app-environment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutoAnimateDirective,
    PanelComponent,
    PageHeaderComponent,
    GpuWarningsComponent,
    MusicContainersComponent,
    MatIconModule, MatButtonModule, MatListModule, MatProgressBarModule, BytesPipe],
  templateUrl: './environment-page.component.html',
  styleUrl: './environment-page.component.scss',
})
export class EnvironmentPageComponent implements OnInit {
  protected readonly env = inject(EnvironmentStore);
  private readonly engines = inject(EnginesStore);

  /** The card being freed, and what the last freeing did (by card). */
  protected readonly freeing = signal<number | null>(null);
  protected readonly freedOn = signal<Record<number, string>>({});

  ngOnInit(): void {
    void this.env.refresh();
  }

  /** The music containers (id and name) running or starting on this card. */
  protected containersOn(g: GpuStatus): { id: string; name: string }[] {
    const d = this.engines.data();
    if (!d) return [];
    return (['heartmula', 'diffrhythm2'] as const)
      .filter((id) => d[id]?.container && d[id]!.container!.state !== 'stopped' && d[id]!.container!.gpu === g.index)
      .map((id) => ({ id, name: id === 'heartmula' ? 'HeartMuLa' : 'DiffRhythm2' }));
  }

  /** Lets go of what the app holds on a card: unloads Ollama's models and stops the music containers there. */
  protected async free(g: GpuStatus): Promise<void> {
    this.freeing.set(g.index);
    try {
      const dropped: string[] = [];
      if (g.ollama_mb) dropped.push(...(await this.env.unloadOllama()));
      for (const c of this.containersOn(g)) {
        await this.engines.stop(c.id);
        if (!this.engines.callError()) dropped.push(c.name);
      }
      await this.env.refresh();
      const err = this.engines.callError();
      this.freedOn.update((m) => ({
        ...m,
        [g.index]: err ?? (dropped.length ? $localize`:@@env.gpuFreed:Freed: ${dropped.join(', ')}:what:.` : $localize`:@@env.gpuNothing:There was nothing to let go of.`),
      }));
    } finally {
      this.freeing.set(null);
    }
  }

  protected modelsHeading(n: number): string {
    return $localize`:@@env.models:Models (${n}:count:)`;
  }

  protected retouchHeading(n: number): string {
    return $localize`:@@env.retouch:Retouch models (${n}:count:)`;
  }

  protected voicesHeading(n: number): string {
    return $localize`:@@env.voices:Voices (${n}:count:)`;
  }

  protected lorasHeading(n: number): string {
    return $localize`:@@env.loras:LoRAs (${n}:count:)`;
  }

  protected musicHeading(n: number): string {
    return $localize`:@@env.music:Music models (${n}:count:)`;
  }

  protected refresh(): void {
    void this.env.refresh();
  }
}
