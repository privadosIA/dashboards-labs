import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import type { AssistModels } from '@lab/animation-core';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { AssistantPicker } from '@lab/assist-kit';
import type { Assistant } from '../../model';
import en from '../dynamic/propose-again.en.json';
import es from '../dynamic/propose-again.es.json';

/** The small form of Propose again, for the Design and Script cards: another prompt and another provider and model, for this call only. */
@Component({
  selector: 'app-propose-again',
  imports: [AssistantPicker, DynamicFormComponent],
  templateUrl: './propose-again.html',
  styleUrl: './propose-again.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposeAgain implements OnInit {
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).flow.propose;
  private readonly base = pickSchema('flow-propose-again', { en, es }, this.lang);

  readonly prompt = input('');
  readonly model = input('');
  readonly provider = input('');
  readonly models = input<AssistModels | null>(null);
  readonly submitted = output<{ prompt: string; model: string; provider: string }>();
  readonly cancelled = output<void>();

  protected readonly value = signal<Record<string, unknown>>({});
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly routingModels = computed(() => (this.models()?.models ?? []).map((m) => m.name));
  protected readonly valid = signal(false);
  protected readonly schema: DfFormSchema = this.base;

  ngOnInit(): void {
    this.value.set({ prompt: this.prompt() });
    this.assistant.set({ provider: this.provider(), model: this.model() });
  }

  protected submit(): void {
    if (!this.valid()) return;
    this.submitted.emit({ prompt: String(this.value()['prompt'] ?? '').trim(), model: this.assistant().model, provider: this.assistant().provider });
  }
}
