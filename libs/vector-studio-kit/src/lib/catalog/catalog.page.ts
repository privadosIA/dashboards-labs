import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AnimationFailure, ANIMATION, type PartText } from '@lab/music-motion';
import { PagedList } from '@lab/paged-list';
import { fromPart, toSvg } from '@lab/vector-editor';
import { catchError, forkJoin, of, take, type Observable } from 'rxjs';

import { Handoff } from '../core/handoff';
import { VECTOR_STUDIO_BASE } from '../core/options';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { PartCard, type CatalogItem } from './part-card/part-card';

type State = 'loading' | 'ready' | 'offline';

/** A still SVG as an address an `<img>` can show: nothing in it runs there. */
const thumbnail = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * The vector parts of the user's on the connected server: every user part is read and kept when it carries a vector model (the mark is the
 * model inside the fragment; the server's manifest has no room for a `kind`). Open puts the part in the editor, Delete removes it from the catalog
 * (with the server's reason and Delete anyway when pieces use it). Without a server it says so.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [PagedList, PartCard],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  private readonly base = inject(VECTOR_STUDIO_BASE);
  private readonly handoff = inject(Handoff);
  private readonly destroyed = inject(DestroyRef);
  protected readonly lang = inject(LanguageService).lang;
  protected readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.catalog;

  protected readonly state = signal<State>('loading');
  protected readonly why = signal('');
  protected readonly items = signal<readonly CatalogItem[]>([]);
  protected readonly busy = signal<Readonly<Record<string, string>>>({});
  protected readonly notice = signal<{ text: string; problem: boolean } | undefined>(undefined);
  private readonly docs = new Map<string, ReturnType<typeof fromPart>>();

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.notice.set(undefined);
    this.port
      .catalog()
      .pipe(take(1), takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (catalog) => {
          const mine = catalog.parts.filter((p) => p.source === 'user');
          if (mine.length === 0) return this.show([]);
          forkJoin(mine.map((p) => this.read(p.name))).subscribe((texts) => this.show(texts.filter((x): x is PartText => !!x), mine));
        },
        error: (e: unknown) => {
          this.why.set(e instanceof Error ? e.message : this.texts.unknownError);
          this.state.set('offline');
        },
      });
  }

  /** The text of a part, or nothing when the server cannot give it (a part that vanished meanwhile is not an error of the page). */
  private read(name: string): Observable<PartText | undefined> {
    return this.port.partText(name).pipe(
      take(1),
      catchError(() => of(undefined)),
    );
  }

  private show(texts: readonly PartText[], parts: readonly { name: string; description: string }[] = []): void {
    this.docs.clear();
    const items: CatalogItem[] = [];
    for (const text of texts) {
      const made = fromPart({ manifest: text.manifest, fragment: text.fragment });
      if (!('doc' in made)) continue;
      this.docs.set(text.name, made);
      const description = parts.find((p) => p.name === text.name)?.description ?? '';
      items.push({ name: text.name, description, thumbnail: thumbnail(toSvg(made.doc, 0)) });
    }
    this.items.set(items);
    this.state.set('ready');
  }

  protected openPart(name: string): void {
    const made = this.docs.get(name);
    if (!made || !('doc' in made)) return;
    this.handoff.give({ ...made.doc, name: made.doc.name ?? name, partName: name });
    void this.router.navigate([this.base, 'editor']);
  }

  protected removePart(name: string, force: boolean): void {
    this.notice.set(undefined);
    this.port
      .removePart(name, force)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        complete: () => {
          this.busy.update(({ [name]: _gone, ...rest }) => rest);
          this.items.update((list) => list.filter((i) => i.name !== name));
          this.docs.delete(name);
        },
        error: (e: unknown) => {
          if (e instanceof AnimationFailure && e.kind === 'busy' && !force) this.busy.update((b) => ({ ...b, [name]: e.reason }));
          else this.notice.set({ text: this.t.refused(e instanceof Error ? e.message : this.texts.unknownError), problem: true });
        },
      });
  }
}
