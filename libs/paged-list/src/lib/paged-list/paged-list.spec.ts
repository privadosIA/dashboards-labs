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

@Component({
  imports: [PagedList],
  template: `
    <lab-paged-list listId="filtered-list" [data]="rows()" [filter]="keep()" emptyFilterText="Nothing matches">
      <ng-template let-page>
        <ul>
          @for (r of page; track r) {
            <li class="row">{{ r }}</li>
          }
        </ul>
      </ng-template>
    </lab-paged-list>
  `,
})
class FilteredHost {
  rows = signal(Array.from({ length: 167 }, (_, i) => `${i % 7 === 0 ? 'bad' : 'ok'}-${i}`));
  keep = signal<((r: string) => boolean) | null>(null);
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

  describe('with a filter', () => {
    async function filtered() {
      await TestBed.configureTestingModule({ imports: [FilteredHost] }).compileComponents();
      const f = TestBed.createComponent(FilteredHost);
      await f.whenStable();
      f.detectChanges();
      return f;
    }
    const apply = async (f: Awaited<ReturnType<typeof filtered>>, keep: ((r: string) => boolean) | null) => {
      f.componentInstance.keep.set(keep);
      await f.whenStable();
      f.detectChanges();
    };

    it('pages only the items the filter accepts and counts them', async () => {
      const f = await filtered();
      await apply(f, (r) => r.startsWith('bad'));
      expect(rows(f).length).toBe(10);
      expect(paginator(f).length).toBe(24);
      expect((f.nativeElement as HTMLElement).textContent).toContain('1 – 10 of 24');
      paginator(f).page.emit({ pageIndex: 1, pageSize: 10, length: 24, previousPageIndex: 0 });
      await f.whenStable();
      f.detectChanges();
      expect(rows(f)[0].textContent).toBe('bad-70');
    });

    it('shows no paginator when the filter leaves a short list', async () => {
      const f = await filtered();
      await apply(f, (r) => r === 'bad-0' || r === 'bad-7');
      expect(rows(f).length).toBe(2);
      expect(f.debugElement.query(By.directive(MatPaginator))).toBeNull();
    });

    it('goes back to the first page when the filter changes, and keeps the page when only the data does', async () => {
      const f = await filtered();
      paginator(f).page.emit({ pageIndex: 3, pageSize: 10, length: 167, previousPageIndex: 0 });
      await f.whenStable();
      f.detectChanges();
      f.componentInstance.rows.update((r) => [...r, 'extra']);
      await f.whenStable();
      f.detectChanges();
      expect(paginator(f).pageIndex).toBe(3);
      await apply(f, (r) => r.startsWith('ok'));
      expect(paginator(f).pageIndex).toBe(0);
    });

    it('draws every item without a filter', async () => {
      const f = await filtered();
      expect(paginator(f).length).toBe(167);
    });

    it('says that nothing matches, without a paginator, and says nothing for an empty list', async () => {
      const f = await filtered();
      await apply(f, () => false);
      const text = (f.nativeElement as HTMLElement).querySelector('[data-testid=paged-list-no-match]');
      expect(text?.textContent).toContain('Nothing matches');
      expect(text?.getAttribute('role')).toBe('status');
      expect(f.debugElement.query(By.directive(MatPaginator))).toBeNull();
      f.componentInstance.rows.set([]);
      await f.whenStable();
      f.detectChanges();
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=paged-list-no-match]')).toBeNull();
    });
  });
});

@Component({
  imports: [PagedList],
  template: `
    <lab-paged-list listId="server-list" [data]="page()" [total]="total()" [index]="index()" (pageChange)="changed($event)" emptyFilterText="Nothing matches">
      <ng-template let-rows>
        <ul>
          @for (r of rows; track r) {
            <li class="row">{{ r }}</li>
          }
        </ul>
      </ng-template>
    </lab-paged-list>
  `,
})
class ServerHost {
  all = Array.from({ length: 135 }, (_, i) => `song-${i}`);
  total = signal(135);
  index = signal(0);
  size = 10;
  asked: { pageIndex: number; pageSize: number }[] = [];
  page = signal(this.all.slice(0, 10));
  changed(e: { pageIndex: number; pageSize: number }): void {
    this.asked.push(e);
    this.size = e.pageSize;
    this.index.set(e.pageIndex);
    this.page.set(this.all.slice(e.pageIndex * e.pageSize, (e.pageIndex + 1) * e.pageSize));
  }
}

describe('PagedList in server mode', () => {
  const setup = async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [ServerHost] }).compileComponents();
    const fixture = TestBed.createComponent(ServerHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.row')).map((e) => e.textContent);
    const paginator = () => fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
    return { fixture, host: fixture.componentInstance, rows, paginator };
  };

  it('draws the data as given and counts the total of the server in the paginator', async () => {
    const { rows, paginator } = await setup();
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toBe('song-0');
    expect(paginator().length).toBe(135);
    expect(paginator().pageIndex).toBe(0);
  });

  it('does not slice what the host gives: a page of 7 is drawn whole', async () => {
    const { fixture, host, rows } = await setup();
    host.page.set(host.all.slice(0, 7));
    fixture.detectChanges();
    expect(rows()).toHaveLength(7);
  });

  it('asks the host for the next page and does not move by itself', async () => {
    const { fixture, host, rows, paginator } = await setup();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();
    expect(host.asked).toEqual([{ pageIndex: 1, pageSize: 10 }]);
    expect(rows()[0]).toBe('song-10');
    expect(paginator().pageIndex).toBe(1);
  });

  it('shows the page the host says, so a filter that sends it back to the first page is followed', async () => {
    const { fixture, host, paginator } = await setup();
    host.changed({ pageIndex: 3, pageSize: 10 });
    fixture.detectChanges();
    expect(paginator().pageIndex).toBe(3);
    host.index.set(0);
    fixture.detectChanges();
    expect(paginator().pageIndex).toBe(0);
  });

  it('a new size is told to the host with the page and remembered for the list', async () => {
    const { fixture, host, paginator } = await setup();
    paginator()._changePageSize(50);
    fixture.detectChanges();
    expect(host.asked.at(-1)).toEqual({ pageIndex: 0, pageSize: 50 });
    expect(JSON.parse(sessionStorage.getItem('mo-paged-list-sizes') ?? '{}')['server-list']).toBe(50);
  });

  it('has no paginator when the server has no more than the smallest size, and says nothing matches at zero', async () => {
    const { fixture, host } = await setup();
    host.total.set(8);
    host.page.set(host.all.slice(0, 8));
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MatPaginator))).toBeNull();
    host.total.set(0);
    host.page.set([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="paged-list-no-match"]')).not.toBeNull();
  });
});
