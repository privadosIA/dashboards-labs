import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { PagedList } from '@lab/paged-list';

import { injectLink } from '../core/links';
import type { Reference } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog, type ConfirmData } from '../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../shared/failure-text';
import { AddReference } from './add-reference/add-reference';
import { ReferenceCard } from './reference-card/reference-card';

/** The references, newest first, and the form that adds one. The port reads the list again while one is analysing. */
@Component({
  selector: 'app-references-page',
  imports: [AddReference, ReferenceCard, PagedList],
  templateUrl: './references.page.html',
  styleUrl: './references.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferencesPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.references;
  protected readonly common = this.texts;
  protected readonly lang = inject(LanguageService).lang;

  protected readonly references = signal<readonly Reference[] | null>(null);
  /** What the newest finished learning of each reference kept, by reference. */
  protected readonly taught = signal<Readonly<Record<string, { readonly styles: number; readonly parts: number }>>>({});
  /** Why the list could not be read, or a deletion did not happen, in the server's words. */
  protected readonly refused = signal('');

  ngOnInit(): void {
    this.port
      .references()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.references.set(list), error: (e) => this.refused.set(failureText(e, this.texts)) });
    // One read of the learnings for the whole list; a server that cannot say leaves the cards as they were.
    this.port
      .learnings()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (list) => {
          const out: Record<string, { styles: number; parts: number }> = {};
          for (const l of list) if (l.state === 'ready' && !(l.referenceId in out)) out[l.referenceId] = { styles: l.styles.length, parts: l.partDrafts.length };
          this.taught.set(out);
        },
        error: () => undefined,
      });
  }

  protected open(reference: Reference): void {
    void this.router.navigate([this.link('references', reference.id)]);
  }

  protected remove(reference: Reference): void {
    const data: ConfirmData = { title: this.t.removeTitle, message: `${reference.title}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.refused.set('');
        this.port
          .removeReference(reference.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ error: (e) => this.refused.set(failureText(e, this.texts)) });
      });
  }
}
