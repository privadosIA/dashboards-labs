import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { PagedList } from '@lab/paged-list';
import { Router, RouterLink } from '@angular/router';

import { injectLink } from '../core/links';
import { AnimationFailure, type Draft, type Part } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { MUSIC_MOTION_LINKS } from '../core/external-links';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog, type ConfirmData } from '../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../shared/failure-text';
import { AskPart } from './ask-part/ask-part';

/**
 * The part drafts, newest first, the form that asks for one, the way to write one from scratch, and the approved parts of the user's with edit and
 * delete. The port reads the list again while one is being written.
 */
@Component({
  selector: 'app-parts-page',
  imports: [AskPart, PagedList, RouterLink],
  templateUrl: './parts.page.html',
  styleUrl: './parts.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartsPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  /** Where the host has the catalog of vector parts, when it said (the link to it is drawn only then). */
  protected readonly vectorCatalog = inject(MUSIC_MOTION_LINKS).vectorCatalog;
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  protected readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  protected readonly common = this.texts;
  protected readonly links = this.texts.links;

  protected readonly drafts = signal<readonly Draft[] | null>(null);
  /** The approved parts of the user's, `null` until the catalog is read. */
  protected readonly mine = signal<readonly Part[] | null>(null);
  /** Why the list could not be read, or a deletion did not happen, in the server's words. */
  protected readonly refused = signal('');

  ngOnInit(): void {
    this.port
      .drafts()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (list) => this.drafts.set(list), error: (e) => this.refused.set(failureText(e, this.texts)) });
    this.port
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (c) => this.mine.set(c.parts.filter((p) => p.source === 'user')), error: (e) => this.refused.set(failureText(e, this.texts)) });
  }

  /** What a draft's state is called; the template gets the draft of a page untyped, so it cannot index the texts itself. */
  protected stateText(d: Draft): string {
    return this.t.states[d.state];
  }

  protected edit(part: Part): void {
    void this.router.navigate([this.link('parts', 'mine', part.name)]);
  }

  /** Asks, then deletes. A refusal because something uses the part is shown in the server's words with a second question: delete it anyway. */
  protected removePart(part: Part): void {
    this.confirmThen({ title: this.t.removePartTitle, message: `${part.name}: ${this.t.removePartMessage}`, action: this.t.removePartAction, danger: true }, () => this.deletePart(part, false));
  }

  private deletePart(part: Part, force: boolean): void {
    this.refused.set('');
    this.port
      .removePart(part.name, force)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => this.mine.update((list) => list?.filter((p) => p.name !== part.name) ?? null),
        error: (e) => {
          // A part of the user's is only refused with a conflict when something uses it: the server says what.
          if (!force && e instanceof AnimationFailure && e.kind === 'busy') {
            this.confirmThen({ title: this.t.forceTitle, message: `${part.name}: ${e.reason}\n${this.t.forceMessage}`, action: this.t.forceAction, danger: true }, () => this.deletePart(part, true));
          } else this.refused.set(failureText(e, this.texts));
        },
      });
  }

  private confirmThen(data: ConfirmData, go: () => void): void {
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((yes) => {
        if (yes) go();
      });
  }

  protected open(draft: Draft): void {
    void this.router.navigate([this.link('parts', draft.id)]);
  }

  protected remove(draft: Draft): void {
    const data: ConfirmData = { title: this.t.removeTitle, message: `${draft.name ?? draft.request}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.refused.set('');
        this.port
          .removeDraft(draft.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ error: (e) => this.refused.set(failureText(e, this.texts)) });
      });
  }
}
