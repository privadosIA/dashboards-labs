import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { CharCount } from '../../shared/char-count/char-count';
import { withPlaceholder } from '../../shared/with-options';
import { SongDraftStore } from '../../song/draft.store';
import { SongWriter } from '../../song/writer.service';
import { StyleCapture } from './style-capture/style-capture';
import en from './dynamic/ai.en.json';
import es from './dynamic/ai.es.json';

/** The AI Lyrics Generator: describe the lyrics, the assistant writes them (and a style when there is none) into the draft. */
@Component({
  selector: 'app-ai-dialog',
  templateUrl: './ai-dialog.html',
  styleUrl: './ai-dialog.scss',
  imports: [DynamicFormComponent, DfSlotDirective, CharCount, StyleCapture],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiDialog {
  protected readonly ref = inject<MatDialogRef<AiDialog, boolean>>(MatDialogRef);
  protected readonly store = inject(SongDraftStore);
  protected readonly writer = inject(SongWriter);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  /** The example and the tips are the placeholder of the prompt: they are there until the user writes. */
  protected readonly schema = withPlaceholder(pickSchema('ai', { en, es }, this.lang), 'prompt', [this.t.ai.example, '', this.t.ai.tipsTitle, ...this.t.ai.tips.map((tip) => `• ${tip}`)].join('\n'));
  /** The title the user already wrote is a good start for the description. */
  protected readonly model = signal<Record<string, unknown>>({ prompt: this.store.title() });
  protected readonly valid = signal(false);
  /** What the description can hold: the counter says how much is left, so that nobody types past it and loses the end. */
  protected readonly promptMax = 2000;
  protected readonly promptLength = computed(() => [...String(this.model()['prompt'] ?? '')].length);

  constructor() {
    this.writer.clearError();
  }

  protected async generate(): Promise<void> {
    if (!this.valid()) return;
    const written = await this.writer.write({ text: String(this.model()['prompt'] ?? '').trim(), generator: this.store.generator(), instrumental: false });
    if (!written) return;
    this.store.adoptLyrics(written);
    this.ref.close(true);
  }
}
