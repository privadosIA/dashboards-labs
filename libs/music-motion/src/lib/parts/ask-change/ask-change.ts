import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { ANIMATION } from '../../animation/tokens';
import { injectLink } from '../../core/links';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { AssistantField } from '../../shared/assistant-field/assistant-field';
import en from '../dynamic/ask-change.en.json';
import es from '../dynamic/ask-change.es.json';
import type { Assistant } from '@lab/assist-kit';

type FormModel = Record<string, unknown>;

/**
 * Asks the assistant to change a part: an instruction and the text that is in the editor (saved or not) go to the server as a draft asked from a base
 * text. The answer is a new draft, which is opened; the draft or the part the text came from is not touched.
 */
@Component({
  selector: 'app-ask-change',
  imports: [DynamicFormComponent, AssistantField],
  templateUrl: './ask-change.html',
  styleUrl: './ask-change.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AskChange {
  /** The text to change, as it is in the editor. */
  readonly manifest = input.required<string>();
  readonly fragment = input.required<string>();

  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  private readonly destroyed = inject(DestroyRef);
  protected readonly link = injectLink();
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  protected readonly schema = pickSchema('ask-change', { en, es }, this.lang);

  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(false);
  /** The assistant chosen to write the change (provider and model); empty is the server's own. */
  protected readonly chosen = signal<Assistant>({ provider: '', model: '' });
  protected readonly working = signal(false);
  /** Why the server did not take it, in its own words. */
  protected readonly refused = signal('');

  protected ask(): void {
    if (this.working() || !this.valid()) return;
    const request = String(this.model()['request'] ?? '').trim();
    this.working.set(true);
    this.refused.set('');
    this.port
      .askDraft({ request, base: { manifest: this.manifest(), fragment: this.fragment() }, ...(this.chosen().provider ? { provider: this.chosen().provider } : {}), ...(this.chosen().model ? { model: this.chosen().model } : {}) })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (draft) => {
          this.working.set(false);
          void this.router.navigate([this.link('parts', draft.id)]);
        },
        error: (e) => {
          this.working.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
