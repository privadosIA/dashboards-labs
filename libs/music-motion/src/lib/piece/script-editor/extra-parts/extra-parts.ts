import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';

import { extraChoices, MAX_EXTRA_PARTS, type Catalog, type Level, type PartRef, type ScriptPiece } from '@lab/animation-core';
import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { LOCK_KEY } from '../../../shared/lock';
import { PartParams } from '@lab/motion-parts';
import { ADD_KEY, partSelectSchema } from './extra-schema';

type FormModel = Record<string, unknown>;

/** The extra parts a piece draws beside its main one: each with its part to choose, its parameters and a way to take it away, and a choice that adds one. */
@Component({
  selector: 'app-extra-parts',
  imports: [DynamicFormComponent, PartParams],
  templateUrl: './extra-parts.html',
  styleUrl: './extra-parts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtraParts {
  readonly piece = input.required<ScriptPiece>();
  readonly catalog = input.required<Catalog>();
  readonly level = input.required<Level>();
  readonly locked = input(false);
  readonly add = output<string>();
  readonly remove = output<number>();
  readonly changePart = output<{ k: number; part: string }>();
  readonly changeParams = output<{ k: number; params: Record<string, unknown> }>();

  protected readonly t = textsFor(inject(LanguageService).lang).script;
  protected readonly extras = computed<readonly PartRef[]>(() => this.piece().with ?? []);
  /** What decides the forms of the selects: the names of the parts, not their parameters, so typing a parameter does not redraw them. */
  private readonly names = computed(() => this.piece().part + '|' + this.extras().map((x) => x.part).join('|'));
  protected readonly canAdd = computed(() => this.extras().length < MAX_EXTRA_PARTS);

  private options(except?: string): { value: string; label: string }[] {
    const level = this.level();
    const parts = this.catalog().parts;
    return extraChoices(this.piece(), this.catalog(), except).map((name) => ({ value: name, label: parts.find((p) => p.name === name)?.levels.includes(level) ? name : `${name} ${this.t.aboveLevel}` }));
  }

  protected readonly entries = computed(() => {
    this.names();
    const locked = this.locked();
    return untracked(() =>
      this.extras().map((ref, k) => ({
        k,
        part: this.catalog().parts.find((p) => p.name === ref.part) ?? null,
        schema: partSelectSchema(`extra-${this.piece().id}-${k}`, 'part', this.t.extraPart, this.options(ref.part)),
        model: { part: ref.part, [LOCK_KEY]: locked } as FormModel,
      })),
    );
  });
  protected readonly addSchema = computed(() => {
    this.names();
    return untracked(() => partSelectSchema(`extra-add-${this.piece().id}`, ADD_KEY, this.t.addExtra, [{ value: '', label: this.t.none }, ...this.options()]));
  });
  /** A new model each time the extras change, so the select goes back to empty after it adds one. */
  protected readonly addModel = computed<FormModel>(() => {
    this.names();
    return { [ADD_KEY]: '', [LOCK_KEY]: this.locked() };
  });

  protected partChanged(k: number, model: FormModel): void {
    const part = String(model['part'] ?? '');
    if (part && part !== this.extras()[k]?.part) this.changePart.emit({ k, part });
  }

  protected addChanged(model: FormModel): void {
    const part = String(model[ADD_KEY] ?? '');
    if (part) this.add.emit(part);
  }
}
