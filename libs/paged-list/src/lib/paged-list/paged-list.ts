import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, contentChild, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { map } from 'rxjs';

import { PageSizeStore } from '../page-size.store';
import { LabPaginatorIntl, type PagedListLang } from '../paginator-intl';

/** The page sizes a paged list offers unless it chooses its own. */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100];

/**
 * A list drawn one page at a time. It takes the whole array and draws the current page through the projected template:
 *
 * ```html
 * <lab-paged-list listId="references" [data]="items()" [lang]="lang">
 *   <ng-template let-page>@for (i of page; track i.id) { … }</ng-template>
 * </lab-paged-list>
 * ```
 *
 * The size chosen is remembered per `listId` for the session, so the id must be unique among the lists a host mounts. The
 * paginator is left out while the list has no more items than the smallest size.
 *
 * A host that draws its own filter controls passes a predicate in `filter`: only the items it accepts are counted and paged, and the list goes
 * back to its first page when the predicate changes (give it a stable one, such as a `computed`, not a new function on every change detection).
 * `emptyFilterText` is what the list says when the predicate accepts nothing of a list that is not empty.
 *
 * **Server mode.** A host whose server pages the list gives `data` (just the page it holds), `total` (how many there are in all) and `index` (the page
 * it is showing), and is told with `pageChange` when the person asks for another page or size. The list then slices nothing, counts `total` in the
 * paginator and leaves `filter` unused: the host owns the page, so it goes back to the first one when its own filters change.
 *
 * ```html
 * <lab-paged-list listId="library" [data]="songs()" [total]="total()" [index]="pageIndex()" (pageChange)="go($event)"> … </lab-paged-list>
 * ```
 */
@Component({
  selector: 'lab-paged-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatPaginatorModule, NgTemplateOutlet],
  providers: [LabPaginatorIntl, { provide: MatPaginatorIntl, useExisting: LabPaginatorIntl }],
  templateUrl: './paged-list.html',
  styleUrl: './paged-list.scss',
})
export class PagedList<T> {
  /** A phone: the paginator drops the first/last page buttons, which do not fit. */
  protected readonly phone = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 599px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  private readonly store = inject(PageSizeStore);
  private readonly intl = inject(LabPaginatorIntl);

  readonly listId = input.required<string>();
  /** The paginator goes above the list and stays at the top edge of the scrolling panel the list is in, instead of at the end of a long list. */
  readonly sticky = input(false);
  readonly data = input.required<readonly T[]>();
  readonly lang = input<PagedListLang>('en');
  readonly pageSizeOptions = input<readonly number[]>(PAGE_SIZE_OPTIONS);
  /** The size a list starts with (one of `pageSizeOptions`) until the person chooses another; by default 10. */
  readonly initialSize = input<number | null>(null);
  readonly filter = input<((item: T) => boolean) | null>(null);
  readonly emptyFilterText = input('');
  /** Server mode: how many items the server has in all. Without it the list pages `data` itself. */
  readonly total = input<number | null>(null);
  /** Server mode: the page the host is showing, from 0. */
  readonly index = input(0);
  /** Server mode: the person asked for another page or size. */
  readonly pageChange = output<{ pageIndex: number; pageSize: number }>();

  protected readonly itemsTpl = contentChild.required(TemplateRef);

  protected readonly server = computed(() => this.total() !== null);
  private readonly localIndex = signal(0);
  /** The page shown: the host's in server mode, the list's own otherwise. */
  protected readonly pageIndex = computed(() => (this.server() ? this.index() : this.localIndex()));
  private readonly sizeOverride = signal<number | null>(null);
  protected readonly pageSize = computed(() => this.sizeOverride() ?? this.store.get(this.listId(), this.initialSize() ?? (this.pageSizeOptions().includes(10) ? 10 : this.pageSizeOptions()[0])));
  /** The items that pass the filter, or all of them without one. */
  protected readonly shown = computed(() => {
    const keep = this.filter();
    return keep && !this.server() ? this.data().filter(keep) : this.data();
  });
  /** How many items the paginator counts: the server's total, or what is shown. */
  protected readonly length = computed(() => this.total() ?? this.shown().length);
  protected readonly needed = computed(() => this.length() > Math.min(...this.pageSizeOptions()));
  /** The filter took out every item of a list that has some (in server mode: the server has none). */
  protected readonly nothingMatches = computed(() => (this.server() ? this.total() === 0 : this.shown().length === 0 && this.data().length > 0));

  private readonly labels = effect(() => this.intl.use(this.lang()));

  /** A new filter starts again from the first page; new data under the same filter keeps the page. */
  private readonly restart = effect(() => {
    this.filter();
    untracked(() => this.localIndex.set(0));
  });

  /** A page that no longer exists (the data shrank) goes back to the last one. */
  private readonly clamp = effect(() => {
    if (this.server()) return;
    const last = Math.max(0, Math.ceil(this.shown().length / this.pageSize()) - 1);
    if (this.localIndex() > last) this.localIndex.set(last);
  });

  /** What is drawn: the page of the data, or in server mode the data as the host gave it (it already is the page). */
  protected readonly page = computed(() => {
    if (this.server()) return this.data();
    const start = this.localIndex() * this.pageSize();
    return this.shown().slice(start, start + this.pageSize());
  });

  protected onPage(e: PageEvent): void {
    if (e.pageSize !== this.pageSize()) {
      this.store.set(this.listId(), e.pageSize);
      this.sizeOverride.set(e.pageSize);
    }
    if (this.server()) this.pageChange.emit({ pageIndex: e.pageIndex, pageSize: e.pageSize });
    else this.localIndex.set(e.pageIndex);
  }
}
