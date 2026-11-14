import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import type { Catalog, Design, Script } from '@lab/animation-core';
import { ConceptBox, LOCK_KEY, designFieldOf, designFormSchema, fromDesignModel, textsFor as libraryTexts, toDesignModel, withDesignCatalog } from '@lab/music-motion';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { hasThemeFeature } from '../../scenes/features';
import type { EditRequest } from '../edit';
import { ThemePanel } from '../theme/theme-panel';

type FormModel = Record<string, unknown>;

/** The song's design: the colours, the typefaces (chosen from the ones the server knows), the mode of each section, the idea and the two looks. */
@Component({
  selector: 'app-design-panel',
  imports: [ConceptBox, DynamicFormComponent, DfSlotDirective, ThemePanel],
  templateUrl: './design-panel.html',
  styleUrl: './design-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignPanel {
  readonly design = input.required<Design>();
  /** The tags of the sections of the song, once each. */
  readonly tags = input.required<readonly string[]>();
  readonly catalog = input.required<Catalog>();
  /** The script of the piece: the Frame preset adds layers to it. */
  readonly script = input<Script | null>(null);
  readonly locked = input(false);
  /** Why the server refused the design, in its own words. */
  readonly refused = input('');
  readonly edit = output<EditRequest>();

  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).editing;
  private readonly base = designFormSchema(this.lang);
  /** The library's words for the design, in this host's language. */
  protected readonly libraryDesign = libraryTexts(this.lang).design;
  protected readonly schema = computed(() => withDesignCatalog(this.base, this.catalog(), [...this.tags()], libraryTexts(this.lang).design));
  protected readonly model = signal<FormModel>({});
  private readonly valid = signal(true);
  /** The idea of the design, in its own box under the form (it is not a field of the form). */
  protected readonly concept = signal('');
  /** The server lists the theme: the theme is edited under the form. */
  protected readonly themed = computed(() => hasThemeFeature(this.catalog()));
  private readonly themeRefusal = /^design\.(theme\b|transition_seconds\b)/;
  protected readonly accentProblem = computed(() => (designFieldOf(this.refused()) === 'accent' ? this.refused() : ''));
  protected readonly otherProblem = computed(() => (this.accentProblem() || (this.themed() && this.themeRefusal.test(this.refused())) ? '' : this.refused()));
  protected readonly swatches = computed(() => (['dark', 'light', 'accent'] as const).map((k) => ({ key: k, value: this.design()[k] })).filter((s) => /^#[0-9a-fA-F]{6}$/.test(s.value)));

  constructor() {
    // The form starts from the design, and again whenever it changes (an undo, a reload).
    effect(() => {
      const design = this.design();
      const tags = this.tags();
      const locked = this.locked();
      untracked(() => {
        const model = { ...toDesignModel(design, [...tags]), [LOCK_KEY]: locked };
        this.model.set(model);
        this.concept.set(String(design.concept ?? ''));
      });
    });
  }

  protected status(status: string): void {
    this.valid.set(status === 'VALID');
  }

  /** The idea is written in a plain box of its own, outside the form's fields: it keeps it and says the design changed, as a field of the form does. */
  protected setConcept(concept: string): void {
    this.concept.set(concept);
    this.changed(this.model());
  }

  protected changed(model: FormModel): void {
    if (!this.valid()) return;
    const current = this.design();
    const made = fromDesignModel({ ...model, concept: this.concept() }, [...this.tags()]);
    // The form writes a mode for every section; one the design did not name and that is the default one is not a change.
    const modes = Object.fromEntries(Object.entries(made.modes).filter(([tag, mode]) => tag in current.modes || mode !== made.defaultMode));
    // What the form does not draw stays as the design has it: the theme and the crossfade are edited under it.
    const next = { ...made, modes, ...(current.theme ? { theme: current.theme } : {}), ...(current.transitionSeconds !== undefined ? { transitionSeconds: current.transitionSeconds } : {}) };
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    this.edit.emit({ fn: (d) => ({ ...d, design: next }), label: 'song-design' });
  }
}
