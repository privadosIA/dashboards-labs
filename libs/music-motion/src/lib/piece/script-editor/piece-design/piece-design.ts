import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import type { Catalog, Design, PieceDesign, ScriptPiece } from '@lab/animation-core';
import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { LOCK_KEY } from '../../../shared/lock';
import en from './dynamic/piece-design.en.json';
import es from './dynamic/piece-design.es.json';
import { withPieceDesign } from './piece-design-schema';

type FormModel = Record<string, unknown>;
const KEYS = ['dark', 'light', 'accent', 'display', 'body', 'verse_style', 'hit_style'] as const;

/** The design a piece has of its own: any of the colours, typefaces and styles it replaces of the song's, and the way back to the song's. */
@Component({
  selector: 'app-piece-design',
  imports: [DynamicFormComponent],
  templateUrl: './piece-design.html',
  styleUrl: './piece-design.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PieceDesignBlock {
  readonly piece = input.required<ScriptPiece>();
  readonly catalog = input.required<Catalog>();
  /** The song's design, to say what the piece would have without its own. */
  readonly song = input.required<Design>();
  readonly locked = input(false);
  /** The design as the person left it; `null` when none is left. */
  readonly designChange = output<PieceDesign | null>();

  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.script;
  private readonly base = pickSchema('piece-design', { en, es }, this.lang);
  protected readonly schema = computed(() => withPieceDesign(this.base, this.catalog(), this.song(), this.texts));
  protected readonly model = signal<FormModel>({});
  private readonly opened = signal(false);
  protected readonly shown = computed(() => this.opened() || !!this.piece().design);
  protected readonly has = computed(() => !!this.piece().design);

  constructor() {
    effect(() => {
      const design = this.piece().design;
      const locked = this.locked();
      untracked(() => this.model.set({ ...Object.fromEntries(KEYS.map((k) => [k, design?.[k] ?? ''])), [LOCK_KEY]: locked }));
    });
  }

  protected open(): void {
    this.opened.set(true);
  }

  protected changed(model: FormModel): void {
    const next = Object.fromEntries(KEYS.flatMap((k) => (typeof model[k] === 'string' && model[k] !== '' ? [[k, model[k]]] : []))) as PieceDesign;
    if (JSON.stringify(next) === JSON.stringify(this.piece().design ?? {})) return;
    this.designChange.emit(Object.keys(next).length ? next : null);
  }

  protected reset(): void {
    this.opened.set(false);
    if (this.piece().design) this.designChange.emit(null);
  }
}
