import { ChangeDetectionStrategy, Component, inject, output, signal, viewChild } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { AssistLanguage } from '../../language';
import type { NewProvider } from '../../providers';
import { assistTextsFor } from '../../texts';
import en from './dynamic/provider.en.json';
import es from './dynamic/provider.es.json';

/**
 * Add an external provider: name, kind, base address, key and model. The key goes out in the `submitted` event once and the form clears it; it is kept nowhere else, not in the flow
 * and not in the browser's storage.
 */
@Component({
  selector: 'lab-add-provider',
  imports: [DynamicFormComponent],
  templateUrl: './add-provider.html',
  styleUrl: './add-provider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddProvider {
  private readonly lang = inject(AssistLanguage).lang;
  protected readonly t = assistTextsFor(this.lang);
  protected readonly schema = pickSchema('assist-provider', { en, es }, this.lang);

  readonly submitted = output<NewProvider>();
  private readonly form = viewChild(DynamicFormComponent);

  protected readonly value = signal<Record<string, unknown>>({ kind: 'openai' });
  protected readonly valid = signal(false);
  /** Set by the picker while the server is answering and with its refusal. */
  readonly working = signal(false);
  readonly problem = signal('');

  protected submit(): void {
    if (this.working()) return;
    // What is missing is not shown in red until the person asks to add: then every field that needs something says so, and nothing is sent.
    if (!this.valid()) {
      this.form()?.markAllAsTouched();
      return;
    }
    const v = this.value();
    const key = String(v['key'] ?? '').trim();
    this.submitted.emit({ name: String(v['name'] ?? ''), kind: v['kind'] === 'ollama' ? 'ollama' : 'openai', baseUrl: String(v['baseUrl'] ?? ''), model: String(v['model'] ?? ''), ...(key ? { key } : {}) });
    // the key is not kept here once it has gone
    this.value.update((x) => ({ ...x, key: '' }));
  }
}
