import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { type DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import type { ModelEntry, SourceInfo } from '../../core/api.models';
import { activeLang } from '../../core/language';
import { type EntryProblems } from '../models3d-validators';
import en from './dynamic/forms.en.json';
import es from './dynamic/forms.es.json';

type Source = 'text' | 'picture';

/** The values the form holds: what an entry has, with the empty string for "the project's". */
type FormModel = {
  id: string;
  prompt: string;
  engine: string;
  detail: string;
  variants: number | null;
  seed: number | null;
  adult: boolean;
};

const toModel = (e: ModelEntry): FormModel => ({ id: e.id, prompt: e.prompt ?? '', engine: e.engine ?? '', detail: e.detail ?? '', variants: e.variants ?? 1, seed: e.seed ?? null, adult: e.adult === true });

/**
 * One entry of a 3D models project: its id, the text of the object or a picture of the project's sources (never both), the engine, the detail, the variants, the seed and the adult mark. The entry's problems are shown under
 * it, in words; a refusal the server gave for it is shown as it came. The form hands the whole entry over each time something changes.
 */
@Component({
  selector: 'app-model-entry-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatButtonToggleModule, MatIconModule],
  templateUrl: './entry-form.component.html',
  styleUrl: './entry-form.component.scss',
})
export class EntryFormComponent {
  readonly entry = input.required<ModelEntry>();
  readonly index = input.required<number>();
  readonly problems = input.required<EntryProblems>();
  readonly pictures = input<readonly SourceInfo[]>([]);
  /** What the project says for an entry that says nothing, shown as the placeholder of the choices. */
  readonly defaults = input<{ engine?: string; detail?: string }>({});
  /** A refusal of the server about this entry, as it came. */
  readonly refusal = input('');
  readonly uploading = input(false);
  /** A run is going: nothing can be started from the entry. */
  readonly busy = input(false);

  readonly changed = output<ModelEntry>();
  readonly remove = output<void>();
  readonly duplicate = output<void>();
  readonly makeOne = output<void>();
  readonly upload = output<File>();

  private readonly base = pickSchema('model-entry', { en, es }, activeLang()) as DfFormSchema;
  protected readonly model = signal<FormModel>(toModel({ id: '' }));
  protected readonly source = signal<Source>('text');
  /** With a picture there is no text field: the schema leaves it out, and the variants too (an entry with its own picture makes one model). */
  protected readonly schema = computed<DfFormSchema>(() => {
    const hide = this.source() === 'picture' ? ['prompt', 'variants'] : [];
    return { ...this.base, fields: this.base.fields.filter((f) => !hide.includes((f as { key?: string }).key ?? '')) };
  });
  protected readonly image = computed(() => this.entry().image ?? '');

  constructor() {
    // what the project holds changed under the form (a duplicate, a removal, a load): the form shows it, unless it is what the form itself just said
    effect(() => {
      const e = this.entry();
      untracked(() => {
        if (JSON.stringify(toModel(e)) !== JSON.stringify(this.model())) this.model.set(toModel(e));
        // a picture that is not chosen yet is an empty name, not an absent one: the entry is still of the picture kind
        this.source.set(e.image !== undefined && !(e.prompt ?? '').trim() ? 'picture' : 'text');
      });
    });
  }

  private number(v: unknown): number | undefined {
    return v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
  }

  protected onModel(m: FormModel): void {
    this.model.set(m);
    const picture = this.source() === 'picture';
    this.changed.emit({
      id: String(m.id ?? '').trim(),
      ...(picture ? { image: this.entry().image } : { prompt: m.prompt ?? '' }),
      ...(m.engine ? { engine: m.engine } : {}),
      ...(m.detail ? { detail: m.detail } : {}),
      ...(!picture && this.number(m.variants) !== undefined && this.number(m.variants) !== 1 ? { variants: this.number(m.variants) } : {}),
      ...(this.number(m.seed) !== undefined ? { seed: this.number(m.seed) } : {}),
      ...(m.adult ? { adult: true } : {}),
    });
  }

  protected setSource(value: Source): void {
    this.source.set(value);
    const e = this.entry();
    // keep one of the two: the other is dropped, so that both are never sent
    this.changed.emit(value === 'picture' ? { ...e, prompt: undefined, variants: undefined, image: e.image ?? '' } : { ...e, image: undefined, prompt: e.prompt ?? '' });
  }

  protected choose(name: string): void {
    this.changed.emit({ ...this.entry(), image: name, prompt: undefined, variants: undefined });
  }

  protected pick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.item(0);
    if (file) this.upload.emit(file);
  }

  protected engineHint(): string {
    return this.defaults().engine ?? '';
  }
}
