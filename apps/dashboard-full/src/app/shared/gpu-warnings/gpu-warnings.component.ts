import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { GpuStatus } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';

/**
 * The warnings of one GPU: memory Ollama keeps after its last use (with a
 * button that frees it) and little free VRAM. Written from the report's fields,
 * so they follow the language of the interface.
 */
@Component({
  selector: 'mo-gpu-warnings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './gpu-warnings.component.html',
  styleUrl: './gpu-warnings.component.scss',
})
export class GpuWarningsComponent {
  private readonly env = inject(EnvironmentStore);

  readonly gpu = input.required<GpuStatus>();
  /** Show the GPU's number in front of each warning (several GPUs in one list). */
  readonly named = input(false);

  protected readonly freeing = signal(false);
  protected readonly freed = signal<string[] | null>(null);
  protected readonly prefix = computed(() => (this.named() ? `GPU ${this.gpu().index}: ` : ''));

  protected async free(): Promise<void> {
    this.freeing.set(true);
    try {
      this.freed.set(await this.env.unloadOllama());
    } finally {
      this.freeing.set(false);
    }
  }
}
