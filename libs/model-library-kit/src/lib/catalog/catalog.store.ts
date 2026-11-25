import { Injectable, computed, inject, signal } from '@angular/core';
import { PAGE_SIZE_OPTIONS, PageSizeStore } from '@lab/paged-list';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../core/language';
import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { reasonOf } from '../core/reason';
import { textsFor } from '../core/texts';
import { type CatalogPage, type CatalogQuery, LibraryFailed, MODEL_LIBRARY_PORT, type ModelPack } from '../port';

export const PAGE_SIZE = 10;
/** The id the catalog's page size is remembered under, as every paged list does. */
export const CATALOG_LIST_ID = 'models3d-catalog';

/** The catalog of the installed packs, one page at a time, with the filters the server takes. Only the newest answer is kept, so a fast typist never sees an old page. */
@Injectable()
export class CatalogStore {
  private readonly port = inject(MODEL_LIBRARY_PORT);
  private readonly t = textsFor(inject(LanguageService).lang);
  private asked = 0;
  private readonly sizes = inject(PageSizeStore);
  private readonly given = inject(MODEL_LIBRARY_OPTIONS, { optional: true })?.pageSize;
  /** The sizes the paginator offers: the shared ones, and the host's own when it asked for another. */
  readonly sizeOptions: readonly number[] = this.given && !PAGE_SIZE_OPTIONS.includes(this.given) ? [this.given, ...PAGE_SIZE_OPTIONS].sort((a, b) => a - b) : PAGE_SIZE_OPTIONS;
  /** The page size: the one the person chose in this session, the host's, or the shared default. */
  readonly size = signal(this.initialSize());

  readonly query = signal<CatalogQuery>({ limit: this.size(), offset: 0 });
  readonly page = signal<CatalogPage>({ models: [], total: 0 });
  readonly packs = signal<readonly ModelPack[]>([]);
  readonly status = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  readonly error = signal('');

  /** The packs with models in them, for the filter. */
  readonly installed = computed(() => this.packs().filter((p) => p.state === 'installed'));
  readonly tags = computed(() => [...new Set(this.installed().flatMap((p) => p.tags))].sort());
  readonly offset = computed(() => this.query().offset ?? 0);
  /** The page the paginator shows, from 0. */
  readonly pageIndex = computed(() => Math.floor(this.offset() / this.size()));

  /** Reads the packs (for the filters) and the page again. */
  async reload(): Promise<void> {
    try {
      this.packs.set(await firstValueFrom(this.port.packs()));
    } catch (e) {
      this.fail(e);
      return;
    }
    await this.fetch();
  }

  /** Changes the filters; a change of filter starts again at the first page, a change of page keeps them. */
  async set(patch: Partial<CatalogQuery>): Promise<void> {
    this.query.update((q) => ({ ...q, offset: 'offset' in patch ? patch.offset : 0, ...patch }));
    await this.fetch();
  }

  /** The person asked for another page or another size (the paginator's event); the size is remembered for the session. */
  go(e: { pageIndex: number; pageSize: number }): Promise<void> {
    if (e.pageSize !== this.size()) {
      this.size.set(e.pageSize);
      this.sizes.set(CATALOG_LIST_ID, e.pageSize);
    }
    return this.set({ limit: e.pageSize, offset: e.pageIndex * e.pageSize });
  }

  private initialSize(): number {
    // a size the host asked for is the list's too: the paginator reads the same store to know which one is chosen
    if (this.given) this.sizes.set(CATALOG_LIST_ID, this.given);
    return this.sizes.get(CATALOG_LIST_ID, PAGE_SIZE);
  }

  private async fetch(): Promise<void> {
    const mine = ++this.asked;
    try {
      const page = await firstValueFrom(this.port.catalog(this.query()));
      if (mine !== this.asked) return;
      this.page.set(page);
      this.status.set('ready');
    } catch (e) {
      if (mine === this.asked) this.fail(e);
    }
  }

  private fail(e: unknown): void {
    this.status.set(e instanceof LibraryFailed && (e.status === 404 || e.status === 501) ? 'unavailable' : 'error');
    this.error.set(reasonOf(e, this.t));
  }
}
