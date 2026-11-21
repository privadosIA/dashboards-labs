import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PipelineEvent } from '../../core/api.models';
import { ThemeService } from '../../core/theme.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { buildStrip } from './strip-model';

/**
 * The moviola strip — the one memorable element of the app (design plan).
 * Scenes are rows; phases run left→right as time. State is the material
 * of each segment (solid done, pulsing active, hatched cache, empty
 * pending, ∅ n/a), always paired with a text label for accessibility.
 * The single orchestrated moment: segments settle in sequence when the
 * run completes, skipped under reduced motion.
 */
@Component({
  selector: 'app-phase-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, DurationPipe],
  templateUrl: './phase-strip.component.html',
  styleUrl: './phase-strip.component.scss',
})
export class PhaseStripComponent {
  readonly events = input.required<PipelineEvent[]>();

  private readonly theme = inject(ThemeService);

  protected readonly model = computed(() => buildStrip(this.events()));
  protected readonly settle = computed(
    () => this.model().finished && !this.theme.reducedMotion(),
  );

  protected stateLabel(state: string): string {
    switch (state) {
      case 'running':
        return $localize`:@@strip.running:running`;
      case 'done':
        return $localize`:@@strip.done:done`;
      case 'cache':
        return $localize`:@@strip.cache:cache`;
      case 'failed':
        return $localize`:@@strip.failed:failed`;
      case 'stopped':
        return $localize`:@@strip.stopped:stopped`;
      case 'na':
        return $localize`:@@strip.na:n/a`;
      default:
        return $localize`:@@strip.pending:pending`;
    }
  }
}
