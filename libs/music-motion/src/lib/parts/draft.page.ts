import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';
import { map, switchMap, type Subscription } from 'rxjs';

import { injectLink } from '../core/links';
import { AnimationFailure, isWriting, pictureLost, type Draft, type Part } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog, type ConfirmData } from '../shared/confirm-dialog/confirm.dialog';
import { failureText } from '../shared/failure-text';
import { AskChange } from './ask-change/ask-change';
import { PartPreview } from './part-preview/part-preview';
import en from './dynamic/edit-draft.en.json';
import es from './dynamic/edit-draft.es.json';

type FormModel = Record<string, unknown>;

/** One draft: how it is going, what the assistant saw, its preview, what failed, its text to edit, and retry, approve and delete. */
@Component({
  selector: 'app-draft-page',
  imports: [AskChange, DynamicFormComponent, RouterLink, PartPreview],
  templateUrl: './draft.page.html',
  styleUrl: './draft.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly route = inject(ActivatedRoute);
  /** The draft the page shows; it changes when a change that was asked for opens the page of the new draft. */
  private id = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly dialog = inject(MatDialog);
  private readonly destroyed = inject(DestroyRef);
  private readonly ticket = inject(TicketService);
  private following?: Subscription;
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  protected readonly common = this.texts;
  protected readonly schema = pickSchema('edit-draft', { en, es }, this.lang);

  /** `undefined` while it loads, `null` when it does not exist or could not be read (`error` says which). */
  protected readonly draft = signal<Draft | null | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  /** The problems the server found in the text it was given, one to a line of its reason. */
  protected readonly problems = signal<readonly string[]>([]);
  protected readonly working = signal<'retry' | 'approve' | 'replace' | null>(null);
  /** Why a retry, an approval or a deletion did not happen, in the server's words. */
  protected readonly refused = signal('');
  protected readonly nameTaken = signal(false);
  /** The part that was approved, as the catalog lists it. */
  protected readonly approved = signal<Part | null>(null);
  /** The approved part of the user's that this draft is a change of (`replaces`): it is replaced, not approved. */
  protected readonly target = signal<Part | null>(null);
  /** Whether the part shown as approved was replaced rather than added. */
  protected readonly replaced = signal(false);

  protected readonly manifestText = computed(() => String(this.model()['manifest'] ?? ''));
  protected readonly fragmentText = computed(() => String(this.model()['fragment'] ?? ''));
  protected readonly writing = computed(() => !!this.draft() && isWriting(this.draft()!));
  protected readonly lost = computed(() => !!this.draft() && pictureLost(this.draft()!));
  protected readonly sourceText = computed(() => {
    const source = this.draft()?.source ?? '';
    const match = /^reference:([^/]+)\/(.+)$/.exec(source);
    return match ? this.t.sourceReference.replace('{id}', match[1]).replace('{frame}', match[2]) : source === 'upload' ? this.t.sourceUpload : source;
  });
  /** What the form edits, as one text: it starts again from it only when it changes, not at every read of the list. */
  private readonly editable = computed(() => {
    const d = this.draft();
    return d ? JSON.stringify([d.manifest ?? '', d.fragment ?? '']) : '';
  });

  constructor() {
    effect(() => {
      this.editable();
      const d = untracked(() => this.draft());
      if (d) untracked(() => this.model.set({ manifest: d.manifest ?? '', fragment: d.fragment ?? '' }));
    });
  }

  ngOnInit(): void {
    // The page is reused when its address changes to another draft: it starts again from that one.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyed)).subscribe((params) => {
      const id = params.get('id') ?? '';
      if (id !== this.id) {
        this.id = id;
        this.reset();
      }
    });
    this.load();
  }

  private reset(): void {
    this.following?.unsubscribe();
    this.draft.set(undefined);
    this.error.set('');
    this.model.set({});
    this.saved.set(false);
    this.problems.set([]);
    this.refused.set('');
    this.approved.set(null);
    this.target.set(null);
    this.replaced.set(false);
    this.working.set(null);
    this.load();
  }

  /** A draft that changes a part of the user's is replaced over it: the catalog says whether that part is still there. */
  private findTarget(d: Draft): void {
    this.target.set(null);
    if (!d.replaces) return;
    this.port
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (c) => this.target.set(c.parts.find((p) => p.name === d.replaces && p.source === 'user') ?? null), error: () => this.target.set(null) });
  }

  private load(): void {
    this.port
      .draft(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.draft.set(d);
          this.findTarget(d);
          if (isWriting(d)) this.follow();
        },
        error: (e) => {
          this.error.set(e instanceof AnimationFailure && e.kind === 'missing' ? '' : failureText(e, this.texts));
          this.draft.set(null);
        },
      });
  }

  /** While it is being written the port reads the list again; when it stops being written, the draft is read whole (the list has no text). */
  private follow(): void {
    // The list starts empty, before its first read: a draft that was never in it is not "gone", only not read yet.
    let seen = false;
    this.following?.unsubscribe();
    this.following = this.port
      .drafts()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((list) => {
        const now = list.find((d) => d.id === this.id);
        if (now) seen = true;
        if (!this.writing() || (!now && !seen)) return;
        if (now && isWriting(now)) this.draft.set(now);
        else this.load();
      });
  }

  /** A preview frame with the ticket the server asks for when it has a token (an `<img>` cannot send one). */
  protected src(address: string): string {
    return address.startsWith('data:') ? address : this.ticket.withTicket(address);
  }

  protected attempts(d: Draft): string {
    return this.t.attempts.replace('{n}', String(d.attempts));
  }

  protected save(): void {
    if (this.saving() || !this.valid() || this.writing()) return;
    const m = this.model();
    this.saving.set(true);
    this.saved.set(false);
    this.problems.set([]);
    this.refused.set('');
    this.port
      .saveDraft(this.id, { manifest: String(m['manifest'] ?? ''), fragment: String(m['fragment'] ?? '') })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.saving.set(false);
          this.saved.set(true);
          this.draft.set(d);
        },
        // What the person typed stays in the editor and the draft stays as the server holds it.
        error: (e) => {
          this.saving.set(false);
          if (e instanceof AnimationFailure && e.kind === 'refused') this.problems.set(e.reason.split('\n').map((l) => l.trim()).filter(Boolean));
          else this.refused.set(failureText(e, this.texts));
        },
      });
  }

  protected retry(): void {
    if (this.working() || this.lost()) return;
    this.working.set('retry');
    this.refused.set('');
    this.port
      .retryDraft(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.working.set(null);
          this.draft.set(d);
          this.follow();
        },
        error: (e) => {
          this.working.set(null);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }

  protected approve(): void {
    const d = this.draft();
    if (!d || this.working() || d.state !== 'ready') return;
    const data: ConfirmData = { title: this.t.approveTitle, message: `${d.name ?? d.request}: ${this.t.approveMessage}`, action: this.t.approveAction };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.working.set('approve');
        this.refused.set('');
        this.nameTaken.set(false);
        this.port
          .approveDraft(this.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({
            next: (part) => {
              this.working.set(null);
              this.approved.set(part);
            },
            error: (e) => {
              this.working.set(null);
              this.nameTaken.set(e instanceof AnimationFailure && e.kind === 'busy' && !this.writing());
              this.refused.set(failureText(e, this.texts));
            },
          });
      });
  }

  /** Saves the draft's text over the part it changes and deletes the draft; the server checks it like an approval. */
  protected replace(): void {
    const d = this.draft();
    const target = this.target();
    if (!d || !target || this.working() || d.state !== 'ready') return;
    const data: ConfirmData = { title: this.t.replaceTitle, message: `${target.name}: ${this.t.replaceMessage}`, action: this.t.replaceAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.working.set('replace');
        this.refused.set('');
        this.port
          .replacePart(target.name, { manifest: d.manifest ?? '', fragment: d.fragment ?? '' })
          .pipe(
            switchMap((part) => this.port.removeDraft(d.id).pipe(map(() => part))),
            takeUntilDestroyed(this.destroyed),
          )
          .subscribe({
            next: (part) => {
              this.working.set(null);
              this.replaced.set(true);
              this.approved.set(part);
            },
            error: (e) => {
              this.working.set(null);
              this.refused.set(failureText(e, this.texts));
            },
          });
      });
  }

  protected remove(): void {
    const d = this.draft();
    if (!d) return;
    const data: ConfirmData = { title: this.t.removeTitle, message: `${d.name ?? d.request}: ${this.t.removeMessage}`, action: this.t.removeAction, danger: true };
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.refused.set('');
        this.port
          .removeDraft(this.id)
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ next: () => void this.router.navigate([this.link('parts')]), error: (e) => this.refused.set(failureText(e, this.texts)) });
      });
  }
}
