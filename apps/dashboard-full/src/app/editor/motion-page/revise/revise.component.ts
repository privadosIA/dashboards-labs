import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { schemaFor } from '../../../shared/dynamic/schema-loader';
import formsEn from './dynamic/forms.en.json';
import formsEs from './dynamic/forms.es.json';
import { MAX_INSTRUCTION } from './revise-problem';

/**
 * Asks the model to change only the motion of a stored page, from a request in words: a one-line field, a button and a few
 * suggestions that fill it. The parent owns the request (and the page it replaces); this control says what was asked and shows
 * the wait and the problem it is given.
 */
@Component({
  selector: 'app-motion-revise',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatIconModule, AutoAnimateDirective],
  templateUrl: './revise.component.html',
  styleUrl: './revise.component.scss',
})
export class MotionReviseComponent {
  /** A request is running (this one or another of the editor's): the button waits. */
  readonly busy = input(false);
  /** The model is working on this request: the wait text shows. */
  readonly waiting = input(false);
  /** What the last request failed with, in words for the person; empty when there is nothing to say. */
  readonly problem = input('');
  /** The person asked for this change. */
  readonly revise = output<string>();

  protected readonly schema = computed<DfFormSchema>(() => schemaFor({ es: formsEs, en: formsEn }));
  protected readonly model = signal<Record<string, unknown>>({ instruction: '' });

  protected readonly chips = [
    $localize`:@@motion.revise.chipSlower:slower entrances`,
    $localize`:@@motion.revise.chipFaster:faster, snappier`,
    $localize`:@@motion.revise.chipBounce:a bounce on the title`,
    $localize`:@@motion.revise.chipStagger:stagger the lines`,
  ];

  protected readonly instruction = computed(() => String(this.model()['instruction'] ?? '').trim());
  protected readonly canSend = computed(() => !this.busy() && this.instruction() !== '' && this.instruction().length <= MAX_INSTRUCTION);

  protected useChip(text: string): void {
    this.model.set({ ...this.model(), instruction: text });
  }

  protected send(): void {
    if (this.canSend()) this.revise.emit(this.instruction());
  }

  /** Empties the field once the change was made. */
  clear(): void {
    this.model.set({ instruction: '' });
  }
}
