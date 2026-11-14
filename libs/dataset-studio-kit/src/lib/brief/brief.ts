import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import type { EngineCard } from '../engines/model';
import { type GenerationMode, type KindDef, briefFits } from '../kinds/kinds';
import { type LookId, applyLook, lookInBrief, recommendedModel, sceneLines } from '../looks/looks';
import en from './dynamic/brief.en.json';
import es from './dynamic/brief.es.json';

/**
 * The brief: the text with a counter against the kind's limit, the negative and the look when the kind has them, the mode in use ("one line per scene" or "one sentence") and, in one line per
 * scene, how many scenes and assistant calls that is. A look is visible words (a `style:` last line) plus a recommended installed model, which is announced through `recommend` and never forced.
 */
@Component({
  selector: 'lab-brief',
  imports: [DynamicFormComponent],
  templateUrl: './brief.html',
  styleUrl: './brief.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Brief {
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).brief;
  protected readonly kinds = textsFor(this.lang).kind;
  private readonly base = pickSchema('dataset-brief', { en, es }, this.lang);

  readonly kind = input.required<KindDef>();
  /** How this kind is generated now (the page works it out from what the server lists). */
  readonly mode = input.required<GenerationMode>();
  /** The installed image models, to recommend one for a look. */
  readonly models = input<readonly EngineCard[]>([]);

  readonly brief = model('');
  readonly negative = model('');
  readonly look = model<LookId | ''>('');
  /** The model a look recommends (the page decides whether to select it). */
  readonly recommend = output<string>();

  protected readonly form = signal<Record<string, unknown>>({ brief: '', negative: '', look: '' });
  protected readonly fits = computed(() => briefFits(this.kind(), this.brief()));
  protected readonly scenes = computed(() => (this.mode() === 'lines' ? sceneLines(this.brief()).length : 0));
  protected readonly recommended = signal<EngineCard | null>(null);
  protected readonly noRecommended = signal(false);

  protected readonly schema = computed<DfFormSchema>(() => {
    const panels = this.kind().panels;
    const placeholder = this.t.placeholder[this.mode()];
    return {
      ...this.base,
      fields: this.base.fields
        .filter((f) => !('key' in f) || f.key === 'brief' || (f.key === 'negative' && panels.negative) || (f.key === 'look' && panels.look))
        .map((f) => ('key' in f && f.key === 'brief' ? { ...f, placeholder } : f)),
    } as DfFormSchema;
  });

  constructor() {
    // What the person types or picks in the form.
    effect(() => {
      const f = this.form();
      untracked(() => this.fromForm(String(f['brief'] ?? ''), String(f['negative'] ?? ''), (String(f['look'] ?? '') as LookId | '') || ''));
    });
    // The recommendation follows the look and the installed models, which may arrive after the look was picked (the server is asked for them).
    effect(() => {
      const look = this.look();
      this.models();
      untracked(() => this.announce(look));
    });
    // What the page sets from outside (an inserted preset, a restored draft).
    effect(() => {
      const brief = this.brief();
      const negative = this.negative();
      const look = this.look();
      untracked(() => {
        // The text is the truth: the select shows the look its last line carries.
        const shown = lookInBrief(brief);
        if (shown !== look) this.look.set(shown);
        const f = this.form();
        if (f['brief'] !== brief || f['negative'] !== negative || f['look'] !== shown) this.form.set({ brief, negative, look: shown });
      });
    });
  }

  private fromForm(brief: string, negative: string, look: LookId | ''): void {
    if (look !== this.look()) {
      // A look was picked: its words go to the end of the brief, visibly, and the form shows them.
      const next = applyLook(brief, look);
      this.look.set(look);
      this.brief.set(next);
      this.negative.set(negative);
      this.form.set({ brief: next, negative, look });
      return;
    }
    if (brief !== this.brief()) {
      this.brief.set(brief);
      // Taking the style line away by hand puts the select back to none.
      const inText = lookInBrief(brief);
      if (inText !== this.look()) {
        this.look.set(inText);
        this.form.set({ brief, negative, look: inText });
      }
    }
    if (negative !== this.negative()) this.negative.set(negative);
  }

  private announce(look: LookId | ''): void {
    if (!look) {
      this.recommended.set(null);
      this.noRecommended.set(false);
      return;
    }
    const model = recommendedModel(look, this.models());
    this.recommended.set(model ?? null);
    this.noRecommended.set(!model);
    if (model) this.recommend.emit(model.id);
  }
}
