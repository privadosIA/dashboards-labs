import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { AnimationFailure, type Part } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_LINKS, type HostPlace } from '../../core/external-links';
import { injectLink } from '../../core/links';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { AskChange } from '../ask-change/ask-change';
import { PartPreview } from '../part-preview/part-preview';
import en from '../dynamic/edit-draft.en.json';
import es from '../dynamic/edit-draft.es.json';

type FormModel = Record<string, unknown>;

/** The text of an approved part of the user's, to change: it is saved as a replace, which the server checks like an approval. */
@Component({
  selector: 'app-own-part-page',
  imports: [AskChange, DynamicFormComponent, RouterLink, PartPreview],
  templateUrl: './own-part.page.html',
  styleUrl: './own-part.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnPartPage implements OnInit {
  private readonly port = inject(ANIMATION);
  protected readonly name = inject(ActivatedRoute).snapshot.paramMap.get('name') ?? '';
  private readonly destroyed = inject(DestroyRef);
  protected readonly link = injectLink();
  private readonly places = inject(MUSIC_MOTION_LINKS);
  /** Where the host opens this part as a vector part: only when it said so (it is a vector part). */
  protected readonly vectorPlace = signal<HostPlace | null>(null);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  protected readonly common = this.texts;
  protected readonly links = this.texts.links;
  protected readonly schema = pickSchema('edit-draft', { en, es }, this.lang);

  /** `undefined` while it loads; `'ready'` when the text is there to change; otherwise why it is not (`missing`, `builtin`, `failed`). */
  protected readonly state = signal<'ready' | 'missing' | 'builtin' | 'failed' | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  /** The problems the server found in the text, one to a line of its reason. */
  protected readonly problems = signal<readonly string[]>([]);
  /** Why a save did not happen for another reason (no Chrome), in the server's words. */
  protected readonly refused = signal('');
  protected readonly part = signal<Part | null>(null);
  protected readonly manifestText = computed(() => String(this.model()['manifest'] ?? ''));
  protected readonly fragmentText = computed(() => String(this.model()['fragment'] ?? ''));

  ngOnInit(): void {
    this.port
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (c) => {
          const part = c.parts.find((p) => p.name === this.name);
          if (!part) this.state.set('missing');
          else if (part.source !== 'user') this.state.set('builtin');
          else {
            this.part.set(part);
            this.loadText();
          }
        },
        error: (e) => this.fail(e),
      });
  }

  private loadText(): void {
    this.port
      .partText(this.name)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (text) => {
          this.model.set({ manifest: pretty(text.manifest), fragment: text.fragment });
          this.vectorPlace.set(this.places.partInVector?.({ name: this.name, manifest: text.manifest, fragment: text.fragment }) ?? null);
          this.state.set('ready');
        },
        error: (e) => this.fail(e),
      });
  }

  private fail(e: unknown): void {
    if (e instanceof AnimationFailure && e.kind === 'missing') this.state.set('missing');
    else {
      this.error.set(failureText(e, this.texts));
      this.state.set('failed');
    }
  }

  protected save(): void {
    if (this.saving() || !this.valid() || this.state() !== 'ready') return;
    const m = this.model();
    this.saving.set(true);
    this.saved.set(false);
    this.problems.set([]);
    this.refused.set('');
    this.port
      .replacePart(this.name, { manifest: String(m['manifest'] ?? ''), fragment: String(m['fragment'] ?? '') })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (part) => {
          this.saving.set(false);
          this.saved.set(true);
          this.part.set(part);
        },
        // What the person typed stays in the editor and the part stays as the server holds it.
        error: (e) => {
          this.saving.set(false);
          if (e instanceof AnimationFailure && e.kind === 'refused') this.problems.set(e.reason.split('\n').map((l) => l.trim()).filter(Boolean));
          else this.refused.set(failureText(e, this.texts));
        },
      });
  }
}

/** The manifest as the server gives it is one line: it is shown indented so that it can be read and changed. */
function pretty(manifest: string): string {
  try {
    return JSON.stringify(JSON.parse(manifest), null, 2);
  } catch {
    return manifest;
  }
}
