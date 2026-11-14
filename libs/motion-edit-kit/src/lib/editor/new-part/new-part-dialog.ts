import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, model, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AnimationFailure, MAX_PICTURE_BYTES, type Draft } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { DraftView } from './draft-view/draft-view';

/**
 * The cycle of a new part in a window of its own: describe it (a sentence and, if wanted, a picture), follow the draft the server writes, rewrite it by hand
 * if you like, see what it draws, and approve it into the catalog. It opens from the library and closes with Esc, the × or a click outside; closing it leaves the
 * draft in the server and it is listed to be reopened.
 */
@Component({
  selector: 'app-new-part',
  imports: [DraftView],
  templateUrl: './new-part-dialog.html',
  styleUrl: './new-part-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPartDialog {
  readonly open = model(false);
  /** A part was approved: its name. The page reads the catalog again. */
  readonly approved = output<string>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  protected readonly t = textsFor(inject(LanguageService).lang).newPart;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly request = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly asking = signal(false);
  protected readonly refused = signal('');
  protected readonly drafts = signal<readonly Draft[]>([]);
  /** The draft on view; none while the person describes a part. */
  protected readonly current = signal<string | null>(null);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal();
        this.refresh();
      } else if (!this.open() && el.open) el.close();
    });
  }

  /** Reads the list of drafts (once: the draft on view is followed by its own view). */
  protected refresh(): void {
    this.port
      .drafts()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.drafts.set(list), error: () => undefined });
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.open.set(false);
  }

  protected type(event: Event): void {
    this.request.set((event.target as HTMLTextAreaElement).value);
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.file.set(f && f.size <= MAX_PICTURE_BYTES ? f : null);
    if (f && f.size > MAX_PICTURE_BYTES) this.refused.set(this.t.pictureHint);
    input.value = '';
  }

  protected canAsk(): boolean {
    const n = this.request().trim().length;
    return n >= 1 && n <= 500 && !this.asking();
  }

  protected ask(): void {
    if (!this.canAsk()) return;
    this.asking.set(true);
    this.refused.set('');
    const file = this.file();
    this.port
      .askDraft({ request: this.request().trim(), ...(file ? { file } : {}) })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.asking.set(false);
          this.request.set('');
          this.file.set(null);
          this.current.set(d.id);
          this.refresh();
        },
        error: (e) => {
          this.asking.set(false);
          this.refused.set(e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e));
        },
      });
  }

  protected onApproved(name: string): void {
    this.current.set(null);
    this.refresh();
    this.approved.emit(name);
    this.open.set(false);
  }

  protected state(d: Draft): string {
    return this.t.states[d.state];
  }
}
