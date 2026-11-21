import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

export type PagedListLang = 'es' | 'en';

const LABELS = {
  en: { perPage: 'Items per page', next: 'Next page', previous: 'Previous page', first: 'First page', last: 'Last page', of: 'of' },
  es: { perPage: 'Elementos por página', next: 'Página siguiente', previous: 'Página anterior', first: 'Primera página', last: 'Última página', of: 'de' },
} as const;

/** The labels of one paged list, in the language its host gave it, whatever the application provides for its own paginators. */
@Injectable()
export class LabPaginatorIntl extends MatPaginatorIntl {
  private of = 'of';

  use(lang: PagedListLang): void {
    const l = LABELS[lang];
    this.itemsPerPageLabel = l.perPage;
    this.nextPageLabel = l.next;
    this.previousPageLabel = l.previous;
    this.firstPageLabel = l.first;
    this.lastPageLabel = l.last;
    this.of = l.of;
    this.changes.next();
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return `0 ${this.of} ${length}`;
    const start = page * pageSize;
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return `${start + 1} – ${end} ${this.of} ${length}`;
  };
}
