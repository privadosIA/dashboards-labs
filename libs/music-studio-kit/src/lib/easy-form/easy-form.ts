import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { CharCount } from '../shared/char-count/char-count';
import { InstrumentalSwitch } from './instrumental-switch/instrumental-switch';
import { withoutFields, withoutLogic } from '../shared/with-options';
import { SongDraftStore } from '../song/draft.store';
import { GENERATORS } from '../song/generators';
import type { VocalGender } from '../song/model';
import { PROMPT_MAX } from '../song/validate';
import { SongWriter } from '../song/writer.service';
import en from './dynamic/easy.en.json';
import es from './dynamic/easy.es.json';

type FormModel = Record<string, unknown>;

/**
 * The Easy form: a prompt, the instrumental switch, the vocal gender and three quick examples. It writes into the same draft
 * as Custom; the Generate button lives in the composer, which also shows why the assistant could not write.
 */
@Component({
  selector: 'app-easy-form',
  templateUrl: './easy-form.html',
  styleUrl: './easy-form.scss',
  imports: [DynamicFormComponent, DfSlotDirective, CharCount, InstrumentalSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EasyForm {
  protected readonly store = inject(SongDraftStore);
  protected readonly writer = inject(SongWriter);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly base = pickSchema('easy', { en, es }, this.lang);

  protected readonly promptMax = PROMPT_MAX;
  protected readonly promptLength = computed(() => [...this.store.prompt()].length);
  /** DiffRhythm2 cannot make a song without voice: no switch for it, and the voice has nothing to wait for. */
  protected readonly schema = computed(() => (this.canInstrumental() ? this.base : withoutFields(withoutLogic(this.base, 'gender'), 'instrumental')));
  /** DiffRhythm2 cannot make a song without voice: there is no switch for it. */
  protected readonly canInstrumental = computed(() => GENERATORS[this.store.generator()].instrumental);
  protected readonly model = signal<FormModel>(this.fromStore());

  constructor() {
    effect(() => {
      const next = this.fromStore();
      untracked(() => {
        if (!this.same(next, this.model())) this.model.set(next);
      });
    });
    effect(() => {
      const m = this.model();
      untracked(() => this.toStore(m));
    });
  }

  private fromStore(): FormModel {
    return { prompt: this.store.prompt(), instrumental: this.store.instrumental(), gender: this.store.gender() };
  }

  private same(a: FormModel, b: FormModel): boolean {
    return a['prompt'] === b['prompt'] && a['instrumental'] === b['instrumental'] && a['gender'] === b['gender'];
  }

  private toStore(m: FormModel): void {
    this.store.setPrompt(String(m['prompt'] ?? ''));
    this.store.setInstrumental(m['instrumental'] === true);
    const gender = (m['gender'] as VocalGender | undefined) ?? 'random';
    if (gender !== this.store.gender()) this.store.setGender(gender);
  }
}
