import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LanguageService } from '../../core/language';
import { MOTION_EDIT_BASE } from '../../core/options';
import { textsFor } from '../../core/texts';

/**
 * The strip the editor shows when it was opened from a guided flow (`?flow=<id>&step=design|script`): where the person is, a way back and Continue, which the editor answers by
 * saving what is unsaved first. Nothing else of the editor changes.
 */
@Component({
  selector: 'app-flow-bar',
  imports: [RouterLink],
  templateUrl: './flow-bar.html',
  styleUrl: './flow-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowBar {
  private readonly base = inject(MOTION_EDIT_BASE);
  protected readonly t = textsFor(inject(LanguageService).lang).flow.bar;

  readonly flow = input.required<string>();
  readonly step = input<'design' | 'script'>('script');
  readonly dirty = input(false);
  readonly saving = input(false);
  readonly continued = output<void>();

  protected readonly address = computed(() => `${this.base}/flow/${this.flow()}`);
}
