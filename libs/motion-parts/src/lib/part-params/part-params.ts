import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';

import { LOCK_KEY } from '../lock';
import type { Part, PartLevel } from '../model';
import { buildParamsSchema, fromParamsModel, toParamsModel } from '../params-schema';
import { MOTION_PARTS_LANG } from '../provide-motion-parts';
import { motionPartsTexts } from '../texts';

type FormModel = Record<string, unknown>;

/** The parameters of the part something uses (a piece, a scene), as a form made from the catalog's description of that part. */
@Component({
  selector: 'lab-part-params',
  imports: [DynamicFormComponent],
  templateUrl: './part-params.html',
  styleUrl: './part-params.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartParams {
  readonly part = input.required<Part>();
  readonly values = input<Readonly<Record<string, unknown>> | undefined>(undefined);
  /** The level it is used at: a part that does not support it is marked. */
  readonly level = input.required<PartLevel>();
  readonly locked = input(false);
  /** The parameters as the person left them, when they differ from the piece's. */
  readonly paramsChange = output<Record<string, unknown>>();

  protected readonly t = motionPartsTexts(inject(MOTION_PARTS_LANG, { optional: true }) ?? 'en');
  protected readonly schema = computed(() => buildParamsSchema(this.part(), this.t));
  protected readonly model = signal<FormModel>({});
  protected readonly levels = computed(() => this.part().levels.join(', '));
  protected readonly above = computed(() => !this.part().levels.includes(this.level()));

  constructor() {
    effect(() => {
      const part = this.part();
      const values = this.values();
      const locked = this.locked();
      untracked(() => this.model.set({ ...toParamsModel(part, values), [LOCK_KEY]: locked }));
    });
  }

  protected changed(model: FormModel): void {
    const part = this.part();
    const next = fromParamsModel(part, model);
    const now = fromParamsModel(part, toParamsModel(part, this.values()));
    if (JSON.stringify(next) !== JSON.stringify(now)) this.paramsChange.emit(next);
  }
}
