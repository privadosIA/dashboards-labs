import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';

import type { Catalog, Stage } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { LOCK_KEY } from '../../shared/lock';
import { addCharacter, fromStageModel, removeCharacter, sameStage, toStageModel } from './stage-model';
import { buildStageSchema } from './stage-schema';

type FormModel = Record<string, unknown>;

/** The stage of an illustrated piece: a background and characters from the catalog, each with its pose, action and place. */
@Component({
  selector: 'app-stage-editor',
  imports: [DynamicFormComponent],
  templateUrl: './stage-editor.html',
  styleUrl: './stage-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageEditor {
  readonly stage = input<Stage | undefined>(undefined);
  readonly catalog = input.required<Catalog>();
  readonly locked = input(false);
  /** The stage as the person left it; `null` when nothing is left of it. */
  readonly stageChange = output<Stage | null>();

  protected readonly t = textsFor(inject(LanguageService).lang).stage;
  protected readonly schema = computed(() => buildStageSchema(this.stage(), this.catalog(), this.t));
  protected readonly model = signal<FormModel>({});
  protected readonly characters = computed(() => this.stage()?.characters ?? []);

  constructor() {
    effect(() => {
      const stage = this.stage();
      const locked = this.locked();
      untracked(() => this.model.set({ ...toStageModel(stage), [LOCK_KEY]: locked }));
    });
  }

  protected changed(model: FormModel): void {
    const next = fromStageModel(model, this.stage(), this.catalog());
    if (!sameStage(next, this.stage())) this.stageChange.emit(next.background || next.characters ? next : null);
  }

  protected add(): void {
    this.stageChange.emit(addCharacter(this.stage(), this.catalog()));
  }

  protected remove(i: number): void {
    this.stageChange.emit(removeCharacter(this.stage(), i));
  }
}
