import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { RoutingTask } from '../../core/api.models';
import { AvailabilityStore } from '../../core/availability.store';

/**
 * Where the controls of a task would be, when its provider answers but has not the model the task
 * needs: says what is missing and how to fix it (for an Ollama, the command to install one; for any
 * other provider, to set its model in Settings), with a link to Settings. It shows nothing when the
 * task can run, while the availability is unknown, and when nothing answers at all or the problem is
 * the key or the consent: those controls are simply hidden.
 */
@Component({
  selector: 'app-model-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink],
  templateUrl: './model-notice.component.html',
  styleUrl: './model-notice.component.scss',
})
export class ModelNoticeComponent {
  readonly task = input.required<RoutingTask>();
  private readonly availability = inject(AvailabilityStore);

  protected readonly missing = computed(() => this.availability.missingModel(this.task()));
  /** Assistant and motion graphics need a text model; the others, one that reads pictures. */
  protected readonly vision = computed(() => this.task() !== 'assistant' && this.task() !== 'motion_graphics');
  /** The model suggested to install: the one that writes motion-graphic pages best, a small one for prompts, a vision one otherwise. */
  protected readonly command = computed(() =>
    this.vision() || this.task() === 'motion_graphics' ? 'ollama pull gemma4:26b' : 'ollama pull qwen3:8b',
  );
}
