import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import type { Observable, Subscription } from 'rxjs';

import type { VectorDocument } from '../model/document';
import { slug } from '../model/names';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import { DOES_NOT_MOVE, SERVER_BODY_LIMIT, moves, toPart, type PartFiles } from '../runtime/to-part';
import { vectorTexts } from '../texts';
import en from './dynamic/send.en.json';
import es from './dynamic/send.es.json';
import type { SinkDraft, VectorPartSink } from './sink';

type View = 'form' | 'working' | 'review' | 'done';
type Levels = Array<'simple' | 'medium' | 'advanced'>;

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A size in the unit a person reads: KB under a megabyte, MB (one decimal when it is not whole) above. */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * The cycle that puts a document in the catalog as a part, in a dialog that knows no port (the host gives it a `VectorPartSink`): a form (name
 * checked free, description, levels, cost); on Send, a draft is made from the exported part and followed; when the server fails it the problems are shown
 * and the form stays open; when it is ready the server's pictures are shown and Approve puts it in the catalog. A document that came from the catalog
 * (`partName`) offers Replace, which replaces the part's texts, and Send as new.
 */
@Component({
  selector: 'lab-vector-send',
  imports: [DynamicFormComponent],
  templateUrl: './send.html',
  styleUrl: './send.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorSend {
  readonly doc = input.required<VectorDocument>();
  readonly sink = input.required<VectorPartSink>();
  readonly open = model(false);
  /** The name of the part that was approved or replaced. */
  readonly sent = output<string>();

  private readonly lang = inject(VECTOR_EDITOR_LANG);
  protected readonly t = vectorTexts(this.lang).send;
  protected readonly schema = pickSchema('send', { en, es }, this.lang);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly destroyed = inject(DestroyRef);

  protected readonly model = signal<Record<string, unknown>>({});
  protected readonly valid = signal(false);
  protected readonly view = signal<View>('form');
  protected readonly problems = signal<string[]>([]);
  protected readonly draft = signal<SinkDraft | undefined>(undefined);
  protected readonly checking = signal(false);
  protected readonly doneText = signal('');
  protected readonly replacing = computed(() => !!this.doc().partName);
  protected readonly moves = computed(() => (this.open() ? moves(this.doc()) || this.doc().params.length > 0 : true));
  protected readonly levels = computed<Levels>(() => {
    const m = this.model();
    return (['simple', 'medium', 'advanced'] as const).filter((l) => m[`level_${l}`] !== false);
  });
  protected readonly anyLevel = computed(() => this.levels().length > 0);
  /** The request this document makes, in bytes, plus room for a long description and parameters; nothing when the document does not draw as a part. */
  protected readonly requestBytes = computed(() => {
    if (!this.open()) return 0;
    const made = toPart(this.doc(), { name: 'part', description: '' });
    return 'problems' in made ? 0 : made.bodyBytes + 1024;
  });
  protected readonly tooBig = computed(() => this.requestBytes() > SERVER_BODY_LIMIT);
  protected readonly sizeText = computed(() => sizeText(this.requestBytes()));
  protected readonly limitText = sizeText(SERVER_BODY_LIMIT);
  protected readonly ready = computed(() => this.valid() && this.anyLevel() && this.moves() && !this.tooBig());

  private work: Subscription | undefined;

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
    // Each time it opens it starts from the document: its name, or the one it was opened from.
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
    this.destroyed.onDestroy(() => this.work?.unsubscribe());
  }

  private reset(): void {
    const doc = this.doc();
    this.work?.unsubscribe();
    this.view.set('form');
    this.problems.set([]);
    this.draft.set(undefined);
    this.checking.set(false);
    this.model.set({
      name: doc.partName ?? slug(doc.name ?? ''),
      description: doc.name ?? '',
      level_simple: true,
      level_medium: true,
      level_advanced: true,
      cost_ms: 40,
    });
  }

  protected backdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.open.set(false);
  }

  private files(name: string): PartFiles | undefined {
    const m = this.model();
    const made = toPart(this.doc(), { name, description: String(m['description'] ?? ''), levels: this.levels(), cost_ms: Number(m['cost_ms']) || 40 });
    if ('problems' in made) {
      this.problems.set(made.problems.map((p) => (p === DOES_NOT_MOVE ? this.t.doesNotMove : p)));
      return undefined;
    }
    return { manifest: made.manifest, fragment: made.fragment };
  }

  private fail(e: unknown): void {
    this.view.set('form');
    this.checking.set(false);
    this.problems.set([this.t.notSent(reason(e))]);
  }

  /** Sends the document as a new part: the name is checked against the catalog, then the draft is made and followed. */
  protected send(): void {
    const name = String(this.model()['name'] ?? '').trim();
    this.problems.set([]);
    this.view.set('working');
    this.checking.set(true);
    this.work?.unsubscribe();
    this.work = this.sink()
      .isNameFree(name)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (free) => {
          if (!free) {
            this.view.set('form');
            this.checking.set(false);
            this.problems.set([this.t.nameTaken(name)]);
            return;
          }
          this.checking.set(false);
          const files = this.files(name);
          if (!files) return void this.view.set('form');
          this.follow(this.sink().createDraft(files));
        },
        error: (e: unknown) => this.fail(e),
      });
  }

  private follow(draft$: Observable<SinkDraft>): void {
    this.work?.unsubscribe();
    this.work = draft$.pipe(takeUntilDestroyed(this.destroyed)).subscribe({
      next: (d) => this.arrived(d),
      error: (e: unknown) => this.fail(e),
    });
  }

  private arrived(d: SinkDraft): void {
    this.draft.set(d);
    if (d.state === 'writing') {
      this.work?.unsubscribe();
      this.work = this.sink()
        .followDraft(d.id)
        .pipe(takeUntilDestroyed(this.destroyed))
        .subscribe({ next: (next) => this.arrived(next), error: (e: unknown) => this.fail(e) });
    } else if (d.state === 'failed') {
      this.view.set('form');
      this.problems.set(d.problems.length ? [...d.problems] : [d.error ?? this.t.failed]);
    } else this.view.set('review');
  }

  protected approve(): void {
    const d = this.draft();
    if (!d) return;
    const name = String(this.model()['name'] ?? '').trim();
    this.view.set('working');
    this.work?.unsubscribe();
    this.work = this.sink()
      .approve(d.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        error: (e: unknown) => {
          this.view.set('review');
          this.problems.set([this.t.notSent(reason(e))]);
        },
        complete: () => this.finish(this.t.approved(name), name),
      });
  }

  /** Replaces the part this document came from: its texts, with the name it has. */
  protected replace(): void {
    const name = this.doc().partName;
    if (!name) return;
    this.problems.set([]);
    const files = this.files(name);
    if (!files) return;
    this.view.set('working');
    this.work?.unsubscribe();
    this.work = this.sink()
      .replace(name, files)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        error: (e: unknown) => this.fail(e),
        complete: () => this.finish(this.t.replaced(name), name),
      });
  }

  protected back(): void {
    this.view.set('form');
    this.problems.set([]);
  }

  private finish(text: string, name: string): void {
    this.doneText.set(text);
    this.view.set('done');
    this.sent.emit(name);
  }
}
