import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import type { DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { catchError, of } from 'rxjs';

import type { Draft, DraftInput, Reference } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { validateDraftInput } from '../../animation/validate';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { AssistantField } from '../../shared/assistant-field/assistant-field';
import en from '../dynamic/ask-part.en.json';
import es from '../dynamic/ask-part.es.json';
import type { Assistant } from '@lab/assist-kit';

type FormModel = Record<string, unknown>;
type Node = DfFormSchema['fields'][number];

/** The form that asks for a part: a phrase and, if wished, a key frame of a reference or a picture of the person's own. */
@Component({
  selector: 'app-ask-part',
  imports: [DynamicFormComponent, AssistantField],
  templateUrl: './ask-part.html',
  styleUrl: './ask-part.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AskPart implements OnInit {
  /** Whether the panel starts unfolded: it does while there is no draft yet. */
  readonly open = input(true);
  /** The draft as the server answers: it comes back being written. */
  readonly asked = output<Draft>();

  private readonly port = inject(ANIMATION);
  private readonly ticket = inject(TicketService);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  private readonly base = pickSchema('ask-part', { en, es }, this.lang);

  /** The references that have key frames to choose from. Not being able to read them only leaves that choice empty. */
  private readonly references = signal<readonly Reference[]>([]);
  protected readonly model = signal<FormModel>({ source: 'none' });
  protected readonly valid = signal(false);
  /** The assistant chosen to write the part (provider and model); empty is the server's own. */
  protected readonly chosen = signal<Assistant>({ provider: '', model: '' });
  protected readonly file = signal<File | null>(null);
  /** The key frame chosen: its address in the list of the chosen reference. */
  protected readonly frame = signal<number | null>(null);
  protected readonly working = signal(false);
  /** The server's reason for refusing, in its own words. */
  protected readonly refused = signal('');

  protected readonly source = computed(() => String(this.model()['source'] ?? 'none'));
  protected readonly reference = computed(() => this.references().find((r) => r.id === this.model()['reference']) ?? null);
  protected readonly frames = computed(() => this.reference()?.analysis?.frames ?? []);
  protected readonly schema = computed<DfFormSchema>(() => ({
    ...this.base,
    fields: this.base.fields.map((f): Node => {
      if (!('key' in f)) return f;
      if (f.key === 'source') return { ...f, options: [{ value: 'none', label: this.t.pictureNone }, { value: 'frame', label: this.t.pictureFrame }, { value: 'file', label: this.t.pictureFile }] } as Node;
      if (f.key === 'reference') return { ...f, options: this.references().map((r) => ({ value: r.id, label: r.title })) } as Node;
      return f;
    }),
  }));

  /** What the person has chosen to ask with. A picture of the wrong kind for the source chosen is left out. */
  private readonly input = computed<DraftInput>(() => {
    const request = typeof this.model()['request'] === 'string' ? (this.model()['request'] as string) : '';
    const frame = this.frame();
    const model = { ...(this.chosen().provider ? { provider: this.chosen().provider } : {}), ...(this.chosen().model ? { model: this.chosen().model } : {}) };
    if (this.source() === 'file') return { request, ...(this.file() ? { file: this.file()! } : {}), ...model };
    if (this.source() === 'frame') return { request, ...(this.reference() ? { referenceId: this.reference()!.id } : {}), ...(frame !== null && this.reference() ? { frame: this.frameName(frame) } : {}), ...model };
    return { request, ...model };
  });
  /** A picture is needed when its source is chosen, and it must be of a kind the server takes. */
  private readonly pictureOk = computed(() => {
    const i = this.input();
    const chosen = this.source() === 'none' || (this.source() === 'file' ? !!i.file : !!(i.referenceId && i.frame));
    return chosen && !validateDraftInput(i).includes('picture');
  });
  /** The phrase and the picture must be valid. */
  protected readonly canAsk = computed(() => this.valid() && this.pictureOk() && validateDraftInput(this.input()).length === 0);
  private readonly form = viewChild(DynamicFormComponent);
  /** The person pressed the button with something missing: only then are the faults shown. */
  private readonly tried = signal(false);
  protected readonly pictureMissing = computed(() => this.tried() && !this.pictureOk());

  ngOnInit(): void {
    this.port
      .references()
      .pipe(
        catchError(() => of([] as readonly Reference[])),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((list) => this.references.set(list.filter((r) => r.state === 'ready' && (r.analysis?.frames.length ?? 0) > 0)));
  }

  /** The name of a key frame as the server knows it: the last part of its address. */
  private frameName(index: number): string {
    const address = this.frames()[index] ?? '';
    return decodeURIComponent(address.split('?')[0].split('/').pop() ?? '');
  }

  /** A frame with the ticket the server asks for when it has a token (an `<img>` cannot send one). */
  protected src(address: string): string {
    return address.startsWith('data:') ? address : this.ticket.withTicket(address);
  }

  protected pickFrame(index: number): void {
    this.frame.set(index);
  }

  protected pickFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected clear(picker: HTMLInputElement): void {
    picker.value = '';
    this.file.set(null);
  }

  protected ask(): void {
    if (this.working()) return;
    if (!this.canAsk()) {
      this.tried.set(true);
      this.form()?.markAllAsTouched();
      return;
    }
    this.working.set(true);
    this.refused.set('');
    this.port
      .askDraft(this.input())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (draft) => {
          this.working.set(false);
          this.tried.set(false);
          this.model.set({ source: 'none' });
          this.form()?.reset({ source: 'none' });
          this.file.set(null);
          this.frame.set(null);
          this.asked.emit(draft);
        },
        // The phrase and the picture stay: the person can change them and ask again.
        error: (e) => {
          this.working.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
