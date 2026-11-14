import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/** The labels of every paginator, in the language of the UI. */
@Injectable()
export class PaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = $localize`:@@paginator.itemsPerPage:Items per page:`;
  override nextPageLabel = $localize`:@@paginator.next:Next page`;
  override previousPageLabel = $localize`:@@paginator.previous:Previous page`;
  override firstPageLabel = $localize`:@@paginator.first:First page`;
  override lastPageLabel = $localize`:@@paginator.last:Last page`;

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return $localize`:@@paginator.range0:0 of ${length}:length:`;
    }
    const start = page * pageSize;
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return $localize`:@@paginator.range:${start + 1}:start: – ${end}:end: of ${length}:length:`;
  };
}
