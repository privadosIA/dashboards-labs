import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ANIMATION } from '@lab/animation-core';
import { countPlan, runAnimationImport } from '@lab/animation-dataset';
import { DATASET_PORT, DatasetFailed, PROJECT_ID_PATTERN, projectIdFromFile } from '@lab/dataset-import';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { type KindDef, isTupleKind } from '../kinds/kinds';
import { type Tuple, parseTuples } from '../generate/tuples';
import type { PreviewStatus } from '../preview/status';
import en from './dynamic/create.en.json';
import es from './dynamic/create.es.json';

/** A dataset the person wants to keep as a preset: the page fills in the brief, the negative, the look, the kind and the engine. */
export interface SavePresetRequest {
  readonly title: string;
}

/** The studio each kind of project is found in once created (named in words: dashboards do not link to each other). */
const STUDIO: Record<KindDef['id'], 'video' | 'music' | 'motion' | 'piece'> = { video: 'video', images: 'video', graphics: 'motion', songs: 'music', piece: 'piece' };

/** The file name a download gets: the first entry's title (or the piece's), as a safe file name. */
export function downloadName(kind: KindDef, raw: string): string {
  let title = '';
  if (isTupleKind(kind)) {
    const parsed = parseTuples(raw);
    title = parsed.ok ? (parsed.entries[0]?.[1] ?? '') : '';
  } else {
    try {
      title = String((JSON.parse(raw) as { animation?: { title?: string } }).animation?.title ?? '');
    } catch {
      title = '';
    }
  }
  const base = projectIdFromFile(`${title || 'dataset'}.json`) || 'dataset';
  return `${base}.json`;
}

/**
 * What to do with the dataset that was read: Download it as a file, Create the project (the import's `confirm` with a project id and its failures, or, for the animated piece, the animation import with its report) and Save it as a preset.
 * Nothing here changes the dataset. After Create it says in which studio the project is found, in words and without a link.
 */
@Component({
  selector: 'lab-dataset-actions',
  imports: [DynamicFormComponent],
  templateUrl: './actions.html',
  styleUrl: './actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetActions {
  private readonly port = inject(DATASET_PORT);
  private readonly animation = inject(ANIMATION);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).actions;
  protected readonly schema = pickSchema('dataset-create', { en, es }, this.lang) as DfFormSchema;

  readonly kind = input.required<KindDef>();
  readonly raw = input.required<string>();
  readonly status = input.required<PreviewStatus>();
  /** The person asked to keep the brief as a preset (the page does it and says so through `presetNote`). */
  readonly savePreset = output<SavePresetRequest>();
  /** What the page says about the preset it just saved or could not save. */
  readonly presetNote = input('');
  readonly presetProblem = input('');
  /** Whether there is a brief to keep. */
  readonly canSavePreset = input(true);

  protected readonly form = signal<Record<string, unknown>>({ id: '' });
  private readonly idTouched = signal(false);
  protected readonly creating = signal(false);
  protected readonly failure = signal('');
  protected readonly done = signal('');
  protected readonly valid = signal(false);

  /** The name typed does not fit what the server accepts (checked here: the form library does not take this pattern). */
  protected readonly badName = computed(() => {
    const id = String(this.form()['id'] ?? '').trim();
    return id !== '' && !PROJECT_ID_PATTERN.test(id);
  });
  protected readonly studio = computed(() => this.t.studios[STUDIO[this.kind().id]]);
  protected readonly tuple = computed(() => isTupleKind(this.kind()));
  /** What stops Create, in words, or empty when it can go. */
  protected readonly blocked = computed(() => {
    const s = this.status();
    if (s.busy) return '';
    if (!s.valid) return '';
    if (!this.tuple()) {
      const created = s.plan ? countPlan(s.plan).create : 0;
      return created === 0 ? this.t.pieceNeedsSong : '';
    }
    return s.imported === 0 ? this.t.nothing : '';
  });
  protected readonly canCreate = computed(() => this.status().valid && !this.status().busy && !this.creating() && !this.blocked() && (this.tuple() ? this.valid() && !!String(this.form()['id'] ?? '').trim() && !this.badName() : true));

  constructor() {
    // What was said about the last Create is about the dataset that was there: it goes when the dataset or the kind changes.
    effect(() => {
      this.raw();
      this.kind();
      untracked(() => {
        this.done.set('');
        this.failure.set('');
      });
    });
    // A project name from the first title, until the person types one of their own.
    effect(() => {
      const raw = this.raw();
      const kind = this.kind();
      untracked(() => {
        if (this.idTouched() || !isTupleKind(kind)) return;
        const name = downloadName(kind, raw).replace(/\.json$/, '');
        if (name !== 'dataset' && name !== this.form()['id']) this.form.set({ id: name });
      });
    });
    effect(() => {
      const id = String(this.form()['id'] ?? '');
      untracked(() => {
        if (id && id !== downloadName(this.kind(), this.raw()).replace(/\.json$/, '')) this.idTouched.set(true);
      });
    });
  }

  protected download(): void {
    const blob = new Blob([this.raw()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName(this.kind(), this.raw());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.failure.set('');
    this.done.set('');
    const s = this.status();
    try {
      if (this.tuple()) {
        const id = String(this.form()['id'] ?? '').trim();
        await firstValueFrom(this.port.confirm(id, s.yaml, this.kind().images ? { outputMode: 'images' } : undefined));
        const parsed = parseTuples(this.raw());
        const n = s.imported || (parsed.ok ? (parsed.entries as Tuple[]).length : 0);
        this.done.set(this.t.created(n, id, this.studio()));
      } else if (s.dataset && s.plan) {
        await runAnimationImport(s.dataset, s.plan, this.animation, { keepLocal: () => false });
        this.done.set(this.t.pieceCreated);
      }
    } catch (e) {
      this.failure.set(e instanceof DatasetFailed ? this.t.failures[e.kind] : e instanceof Error ? e.message : String(e));
    } finally {
      this.creating.set(false);
    }
  }

  protected save(): void {
    const parsed = isTupleKind(this.kind()) ? parseTuples(this.raw()) : null;
    const title = parsed?.ok ? (parsed.entries[0]?.[1] ?? '') : downloadName(this.kind(), this.raw()).replace(/\.json$/, '');
    this.savePreset.emit({ title: title || this.kind().id });
  }
}
