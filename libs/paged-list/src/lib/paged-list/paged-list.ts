import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, contentChild, effect, inject, input, signal } from '@angular/core';
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
  readonly data = input.required<readonly T[]>();
  readonly lang = input<PagedListLang>('en');
  readonly pageSizeOptions = input<readonly number[]>(PAGE_SIZE_OPTIONS);

  protected readonly itemsTpl = contentChild.required(TemplateRef);

  protected readonly pageIndex = signal(0);
  private readonly sizeOverride = signal<number | null>(null);
  protected readonly pageSize = computed(() => this.sizeOverride() ?? this.store.get(this.listId(), this.pageSizeOptions().includes(10) ? 10 : this.pageSizeOptions()[0]));
  protected readonly needed = computed(() => this.data().length > Math.min(...this.pageSizeOptions()));

  private readonly labels = effect(() => this.intl.use(this.lang()));

  /** A page that no longer exists (the data shrank) goes back to the last one. */
  private readonly clamp = effect(() => {
    const last = Math.max(0, Math.ceil(this.data().length / this.pageSize()) - 1);
    if (this.pageIndex() > last) this.pageIndex.set(last);
  });

  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.data().slice(start, start + this.pageSize());
  });

  protected onPage(e: PageEvent): void {
    if (e.pageSize !== this.pageSize()) {
      this.store.set(this.listId(), e.pageSize);
      this.sizeOverride.set(e.pageSize);
    }
    this.pageIndex.set(e.pageIndex);
  }
}
