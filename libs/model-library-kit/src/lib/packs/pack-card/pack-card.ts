import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { ModelPack } from '../../port';

/** One pack: who made it, under what licence, how big it is and what can be done with it in its state. */
@Component({
  selector: 'lab-pack-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, AutoAnimateDirective],
  templateUrl: './pack-card.html',
  styleUrl: './pack-card.scss',
})
export class PackCard {
  readonly pack = input.required<ModelPack>();
  /** Something is being asked of the server about this pack. */
  readonly busy = input(false);
  /** The last refusal, in the server's words. */
  readonly problem = input('');
  readonly install = output<void>();
  readonly cancel = output<void>();
  readonly remove = output<void>();

  protected readonly t = textsFor(inject(LanguageService).lang).packs;
  protected readonly states = textsFor(inject(LanguageService).lang).state;
  protected readonly confirming = signal(false);
  /** The server says `total: 0` until it knows the size of the download: nothing to measure yet. */
  protected readonly known = computed(() => (this.pack().progress?.total ?? 0) > 0);
  protected readonly percent = computed(() => {
    const p = this.pack().progress;
    return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  });
  /** Kenney's packs come from a page that asks for donations. */
  protected readonly kenney = computed(() => {
    try {
      return new URL(this.pack().page ?? '').hostname.endsWith('kenney.nl');
    } catch {
      return false;
    }
  });

  protected ask(): void {
    this.confirming.set(true);
  }

  protected confirm(): void {
    this.confirming.set(false);
    this.remove.emit();
  }
}
