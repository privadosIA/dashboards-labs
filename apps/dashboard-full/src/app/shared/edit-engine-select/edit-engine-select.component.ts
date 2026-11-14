import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { EditEngine, editEngineHelp, editEngineLabel } from '../../editor/quality-tiers';

/**
 * The engine of Retouch: Fast (FLUX.1 Kontext) or Precise (Qwen-Image-Edit), with a line about what sets each apart.
 * With two engines installed it is a choice; with one it only says which engine it is.
 */
@Component({
  selector: 'app-edit-engine-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule],
  templateUrl: './edit-engine-select.component.html',
  styleUrl: './edit-engine-select.component.scss',
})
export class EditEngineSelectComponent {
  /** The engines installed (and, where it matters, fitting the machine). */
  readonly engines = input<readonly EditEngine[]>([]);
  /** The engine in use; null shows the fast one as the default. */
  readonly value = input<EditEngine | null>(null);
  readonly testId = input('edit-engine');
  readonly picked = output<EditEngine>();

  protected readonly current = computed<EditEngine>(() => this.value() ?? (this.engines().includes('fast') ? 'fast' : (this.engines()[0] ?? 'fast')));
  protected readonly choices = computed(() => (['fast', 'precise'] as EditEngine[]).filter((e) => this.engines().includes(e)));
  protected readonly label = editEngineLabel;
  protected readonly help = editEngineHelp;
}
