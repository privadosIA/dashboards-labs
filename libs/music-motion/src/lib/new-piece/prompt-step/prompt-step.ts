import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import type { Assistant } from '@lab/assist-kit';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { MAX_PROMPT } from '@lab/animation-core';
import { AssistantField } from '../../shared/assistant-field/assistant-field';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import en from './dynamic/prompt.en.json';
import es from './dynamic/prompt.es.json';

/** The first thing of a new animation: what it should be like, in the person's words (the piece's prompt, up to 2000 characters), and the model that reads it. Optional. */
@Component({
  selector: 'app-prompt-step',
  imports: [AssistantField, DynamicFormComponent],
  templateUrl: './prompt-step.html',
  styleUrl: './prompt-step.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptStep {
  /** The text written. */
  readonly prompt = model('');
  /** Whether the look chosen is an own style, whose script the prompt does not replace. */
  readonly own = input(false);
  /** Whether what is written is acceptable (it is not longer than the concept holds). */
  readonly valid = model(true);
  /** The assistant chosen (provider and model); empty is the server's own. */
  readonly assistant = model<Assistant>({ provider: '', model: '' });

  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).newAnimation.prompt;
  protected readonly max = MAX_PROMPT;
  protected readonly schema = pickSchema('prompt', { en, es }, this.lang);
  protected readonly model = signal<Record<string, unknown>>({ prompt: '' });
  protected readonly length = computed(() => String(this.model()['prompt'] ?? '').length);

  protected changed(value: Record<string, unknown>): void {
    this.model.set(value);
    this.prompt.set(String(value['prompt'] ?? ''));
  }
}
