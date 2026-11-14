import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';

import { injectLink } from '../core/links';
import { AnimationFailure, type Preset, type Reference } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { parseTags } from '../animation/validate';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { failureText } from '../shared/failure-text';
import { formatClock } from '../shared/format';
import { LearnSection } from './learn/learn-section';
import en from './dynamic/edit-reference.en.json';
import es from './dynamic/edit-reference.es.json';

type FormModel = Record<string, unknown>;

/** One reference: what the server read of it, its data to edit and the button that makes a style from it. */
@Component({
  selector: 'app-reference-page',
  imports: [DynamicFormComponent, LearnSection, RouterLink],
  templateUrl: './reference.page.html',
  styleUrl: './reference.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferencePage implements OnInit {
  protected readonly link = injectLink();
  private readonly port = inject(ANIMATION);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly destroyed = inject(DestroyRef);
  private readonly ticket = inject(TicketService);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.references;
  protected readonly common = this.texts;
  protected readonly clock = formatClock;
  protected readonly schema = pickSchema('edit-reference', { en, es }, this.lang);

  /** `undefined` while it loads, `null` when it does not exist or could not be read (`error` says which). */
  protected readonly reference = signal<Reference | null | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly refused = signal('');
  protected readonly making = signal(false);
  protected readonly preset = signal<Preset | null>(null);
  protected readonly makeRefused = signal('');
  /** The key frame shown large; the first one until another is chosen. */
  protected readonly chosen = signal(0);

  protected readonly analysis = computed(() => this.reference()?.analysis ?? null);
  protected readonly canMake = computed(() => this.reference()?.state === 'ready' && !this.making());
  protected readonly big = computed(() => {
    const frames = this.analysis()?.frames ?? [];
    return frames[Math.min(this.chosen(), frames.length - 1)] ?? null;
  });
  /** What the form edits, as one text: the form starts again from it only when it changes, not at every read of the list. */
  private readonly editable = computed(() => {
    const r = this.reference();
    return r ? JSON.stringify([r.title, r.notes, r.tags]) : '';
  });

  constructor() {
    effect(() => {
      this.editable();
      const r = untracked(() => this.reference());
      if (r) untracked(() => this.model.set({ title: r.title, notes: r.notes, tags: r.tags.join(', ') }));
    });
  }

  ngOnInit(): void {
    this.port
      .reference(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (r) => {
          this.reference.set(r);
          if (r.state === 'analysing') this.follow();
        },
        error: (e) => {
          this.error.set(e instanceof AnimationFailure && e.kind === 'missing' ? '' : failureText(e, this.texts));
          this.reference.set(null);
        },
      });
  }

  /** While it is analysing the port reads the list again; this page takes its reference from there until it is not analysing. */
  private follow(): void {
    this.port
      .references()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((list) => {
        const now = list.find((r) => r.id === this.id);
        if (now) {
          if (this.reference()?.state === 'analysing') this.reference.set(now);
        } else if (this.reference()?.state === 'analysing') {
          // The list may simply not have been read yet (it starts empty): only the server says whether it is gone.
          this.port
            .reference(this.id)
            .pipe(takeUntilDestroyed(this.destroyed))
            .subscribe({ next: (r) => this.reference.set(r), error: () => this.reference.set(null) });
        }
      });
  }

  /** A frame with the ticket the server asks for when it has a token (an `<img>` cannot send one). */
  protected src(address: string): string {
    return address.startsWith('data:') ? address : this.ticket.withTicket(address);
  }

  /** The address of the video when it came from one, to open it; an uploaded video has none. */
  protected sourceLink(r: Reference): string | null {
    return r.source && /^https?:\/\//i.test(r.source) ? r.source : null;
  }

  protected source(r: Reference): string {
    return r.source ?? this.t.uploaded;
  }

  protected percent(share: number): string {
    return `${Math.round(share * 100)}%`;
  }

  protected save(): void {
    if (this.saving() || !this.valid()) return;
    const m = this.model();
    this.saving.set(true);
    this.saved.set(false);
    this.refused.set('');
    this.port
      .editReference(this.id, { title: String(m['title'] ?? '').trim(), notes: String(m['notes'] ?? ''), tags: parseTags(String(m['tags'] ?? '')) })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.saved.set(true);
          this.reference.set(r);
        },
        error: (e) => {
          this.saving.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }

  protected makePreset(): void {
    if (!this.canMake()) return;
    this.making.set(true);
    this.makeRefused.set('');
    this.preset.set(null);
    this.port
      .makePreset(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (p) => {
          this.making.set(false);
          this.preset.set(p);
        },
        error: (e) => {
          this.making.set(false);
          this.makeRefused.set(failureText(e, this.texts));
        },
      });
  }
}
