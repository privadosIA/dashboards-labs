import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';

import type { PagedListLang } from '../paginator-intl';
import { PAGE_SIZE_OPTIONS, PagedList } from './paged-list';

@Component({
  imports: [PagedList],
  template: `
    @if (show()) {
      <lab-paged-list [listId]="listId" [data]="rows()" [lang]="lang">
        <ng-template let-page>
          <ul>
            @for (r of page; track r) {
              <li class="row">{{ r }}</li>
            }
          </ul>
        </ng-template>
      </lab-paged-list>
    }
  `,
})
class Host {
  listId = 'test-list';
  lang: PagedListLang = 'en';
  show = signal(true);
  rows = signal(Array.from({ length: 37 }, (_, i) => `row-${i}`));
}

describe('PagedList', () => {
  beforeEach(() => sessionStorage.clear());

  async function create(configure?: (h: Host) => void) {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const paginator = (f: { debugElement: import('@angular/core').DebugElement }) => f.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
  const rows = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelectorAll('li.row');

  it('draws the first page of 10 and offers 10, 20, 50 and 100', async () => {
    const f = await create();
    expect(rows(f).length).toBe(10);
    expect(rows(f)[0].textContent).toContain('row-0');
    expect(paginator(f).pageSizeOptions).toEqual([...PAGE_SIZE_OPTIONS]);
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50, 100]);
  });

  it('holds the rows in an area that never scrolls nor moves the page sideways', async () => {
    const f = await create();
    const area = (f.nativeElement as HTMLElement).querySelector('[data-testid=paged-list-items]') as HTMLElement;
    expect(getComputedStyle(area).overflowX).toBe('clip');
  });

  it('changing the size draws up to that many items from the start', async () => {
    const f = await create();
    paginator(f).page.emit({ pageIndex: 0, pageSize: 20, length: 37, previousPageIndex: 0 });
    await f.whenStable();
    f.detectChanges();
    expect(rows(f).length).toBe(20);
  });

  it('a host can choose its own sizes, and the default is then the first when 10 is not among them', async () => {
    @Component({
      imports: [PagedList],
      template: `<lab-paged-list listId="own" [data]="rows" [pageSizeOptions]="[5, 20]"><ng-template let-page>@for (r of page; track r) {<i class="r">{{ r }}</i>}</ng-template></lab-paged-list>`,
    })
    class Own {
      rows = Array.from({ length: 30 }, (_, i) => i);
    }
    await TestBed.configureTestingModule({ imports: [Own] }).compileComponents();
    const f = TestBed.createComponent(Own);
    await f.whenStable();
    f.detectChanges();
    expect(paginator(f).pageSizeOptions).toEqual([5, 20]);
    expect(f.nativeElement.querySelectorAll('i.r').length).toBe(5);
  });

  it('remembers the size per list id, and another list keeps its own', async () => {
    const f = await create();
    paginator(f).page.emit({ pageIndex: 0, pageSize: 50, length: 37, previousPageIndex: 0 });
    await f.whenStable();
    f.detectChanges();
    expect(rows(f).length).toBe(37);

    f.componentInstance.show.set(false);
    f.detectChanges();
    f.componentInstance.show.set(true);
    await f.whenStable();
    f.detectChanges();
    expect(paginator(f).pageSize).toBe(50);

    f.componentInstance.show.set(false);
    f.detectChanges();
    f.componentInstance.listId = 'other-list';
    f.componentInstance.show.set(true);
    await f.whenStable();
    f.detectChanges();
    expect(paginator(f).pageSize).toBe(10);
  });

  it('a page that no longer exists after the data shrinks goes back to the last one', async () => {
    const f = await create();
    paginator(f).page.emit({ pageIndex: 3, pageSize: 10, length: 37, previousPageIndex: 0 });
    await f.whenStable();
    f.detectChanges();
    expect(rows(f).length).toBe(7);
    f.componentInstance.rows.set(Array.from({ length: 25 }, (_, i) => `r${i}`));
    await f.whenStable();
    f.detectChanges();
    expect(rows(f).length).toBe(5); // the third and last page of 25
  });

  it('when the data grows or refreshes the person stays on the page', async () => {
    const f = await create();
    paginator(f).page.emit({ pageIndex: 2, pageSize: 10, length: 37, previousPageIndex: 0 });
    await f.whenStable();
    f.detectChanges();
    f.componentInstance.rows.set(Array.from({ length: 45 }, (_, i) => `n${i}`));
    await f.whenStable();
    f.detectChanges();
    expect(paginator(f).pageIndex).toBe(2);
    expect(rows(f)[0].textContent).toContain('n20');
  });

  it('shows no paginator while the list is not longer than the smallest size', async () => {
    const f = await create((h) => h.rows.set(['a', 'b', 'c', 'd']));
    expect(rows(f).length).toBe(4);
    expect(f.debugElement.query(By.directive(MatPaginator))).toBeNull();
    f.componentInstance.rows.set(Array.from({ length: 11 }, (_, i) => `r${i}`));
    await f.whenStable();
    f.detectChanges();
    expect(f.debugElement.query(By.directive(MatPaginator))).not.toBeNull();
  });

  it('speaks English or Spanish as the host says, whatever the app provides', async () => {
    const en = await create();
    expect(paginator(en).hasNextPage()).toBe(true);
    const text = (f: { nativeElement: HTMLElement }) => (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text(en)).toContain('Items per page');
    expect(text(en)).toContain('1 – 10 of 37');
    TestBed.resetTestingModule();
    sessionStorage.clear();
    const es = await create((h) => (h.lang = 'es'));
    expect(text(es)).toContain('Elementos por página');
    expect(text(es)).toContain('1 – 10 de 37');
  });
});
