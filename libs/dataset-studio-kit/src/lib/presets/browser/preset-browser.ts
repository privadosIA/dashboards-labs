import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { type KindId } from '../../kinds/kinds';
import { FallbackPrompts } from '../adapters';
import { PRESET_KINDS, type Preset, type PresetKind, presetKindOf } from '../model';
import { PROMPTS } from '../port';
import { MAX_EXAMPLES, firstLine } from '../rank';
import en from './dynamic/search.en.json';
import es from './dynamic/search.es.json';

/**
 * The library of presets beside the brief (or full page): a search box, kind and tag chips, cards with the prompt's first line, its source and its licence, and, per card, Insert (the page fills
 * the brief), Pin as example (up to five, the examples a generation sends) and Delete for the person's own. It reads and deletes through the presets port; it adds nothing itself.
 */
@Component({
  selector: 'lab-preset-browser',
  imports: [DynamicFormComponent],
  templateUrl: './preset-browser.html',
  styleUrl: './preset-browser.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresetBrowser {
  private readonly port = inject(PROMPTS);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).presets;
  protected readonly schema = pickSchema('preset-search', { en, es }, this.lang) as DfFormSchema;
  protected readonly kindIds = PRESET_KINDS;
  protected readonly max = MAX_EXAMPLES;

  /** The studio kind this browser serves (the beside-the-brief use); none shows every kind with chips (the full page). */
  readonly kind = input<KindId | null>(null);
  /** The presets pinned as examples (two-way). */
  readonly pinned = model<readonly Preset[]>([]);
  /** The person asked to insert a preset into the brief. */
  readonly insert = output<Preset>();
  /** Whether Insert is offered (the Presets page has no brief to fill). */
  readonly insertable = input(true);
  /** Bumped by the page after an import or a save, to read the library again. */
  readonly version = input(0);

  protected readonly form = signal<Record<string, unknown>>({ q: '' });
  private readonly chosenKind = signal<PresetKind | null>(null);
  protected readonly tags = signal<readonly string[]>([]);
  private readonly refresh = signal(0);
  protected readonly problem = signal('');

  /** The kind the list is filtered by: the studio's own, else the chip chosen. */
  protected readonly activeKind = computed<PresetKind | null>(() => (this.kind() ? presetKindOf(this.kind() as KindId) : this.chosenKind()));
  private readonly query = computed(() => ({ kind: this.activeKind() ?? undefined, q: String(this.form()['q'] ?? ''), tags: this.tags(), limit: 60, v: this.version() + this.refresh() }));

  protected readonly result = toSignal(
    toObservable(this.query).pipe(
      switchMap(({ v: _v, ...query }) =>
        this.port.list(query).pipe(
          map((list) => ({ list, failed: '' })),
          catchError((e: unknown) => of({ list: { items: [] as readonly Preset[], total: 0 }, failed: e instanceof Error ? e.message : String(e) })),
          startWith(null),
        ),
      ),
    ),
    { initialValue: null },
  );

  protected readonly items = computed(() => this.result()?.list.items ?? []);
  protected readonly total = computed(() => this.result()?.list.total ?? 0);
  protected readonly loadFailed = computed(() => this.result()?.failed ?? '');
  /** The tags of what is shown, most common first: the chips a person can narrow by. */
  protected readonly topTags = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.items()) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([t]) => t);
  });
  /** The page is using the browser-only library (the server has no store). */
  protected readonly localOnly = computed(() => {
    this.result();
    return this.port instanceof FallbackPrompts && !this.port.shared;
  });
  protected readonly full = computed(() => this.pinned().length >= MAX_EXAMPLES);

  protected setKind(kind: PresetKind | null): void {
    this.chosenKind.set(kind);
    this.tags.set([]);
  }

  protected toggleTag(tag: string): void {
    this.tags.update((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  protected isPinned(p: Preset): boolean {
    return this.pinned().some((x) => x.id === p.id);
  }

  protected togglePin(p: Preset): void {
    if (this.isPinned(p)) this.pinned.update((list) => list.filter((x) => x.id !== p.id));
    else if (!this.full()) this.pinned.update((list) => [...list, p]);
  }

  protected line(p: Preset): string {
    return firstLine(p.prompt);
  }

  protected remove(p: Preset): void {
    this.problem.set('');
    this.port.remove(p.id).subscribe({
      next: () => {
        this.pinned.update((list) => list.filter((x) => x.id !== p.id));
        this.refresh.update((n) => n + 1);
      },
      error: (e: unknown) => this.problem.set(this.t.deleteFailed(e instanceof Error ? e.message : String(e))),
    });
  }
}
