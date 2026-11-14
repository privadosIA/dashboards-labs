import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { StorageDialogComponent } from './storage-dialog.component';

const STORAGE = {
  total_bytes: 6_000_000_000,
  parts: [
    { id: 'cache', bytes: 163_000_000, files: 60, cleanable: true },
    { id: 'final', bytes: 12_000_000, files: 2, cleanable: false },
    { id: 'animations', bytes: 38_000_000, files: 11, cleanable: true },
    { id: 'backups', bytes: 0, files: 0, cleanable: true },
  ],
};

describe('StorageDialogComponent', () => {
  let http: HttpTestingController;
  let confirm = true;

  async function open(extra: { mediaDir?: string } = {}) {
    // The confirm dialog is a MatDialog of its own: the component gets a stand-in the test answers.
    TestBed.overrideComponent(StorageDialogComponent, {
      set: { providers: [{ provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirm) }) } }] },
    });
    await TestBed.configureTestingModule({
      imports: [StorageDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { projectId: 'demo', freeBytes: 20e9, ...extra } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StorageDialogComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects/demo/storage').flush(STORAGE);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('lists the parts biggest first with their size, the total and the free space', async () => {
    const fixture = await open();
    const el = fixture.nativeElement as HTMLElement;
    const ids = Array.from(el.querySelectorAll('[data-testid^=storage-part-]')).map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual(['storage-part-cache', 'storage-part-animations', 'storage-part-final', 'storage-part-backups']);
    expect(el.querySelector('[data-testid=storage-summary]')?.textContent).toContain('5,6 GB');
    expect(el.querySelector('[data-testid=storage-summary]')?.textContent).toContain('18,6 GB');
  });

  it('shows the media folder only when it is given', async () => {
    const without = await open();
    expect((without.nativeElement as HTMLElement).querySelector('[data-testid=storage-media-dir]')).toBeNull();
    TestBed.resetTestingModule();
    const withDir = await open({ mediaDir: '/mnt/backups/media' });
    expect((withDir.nativeElement as HTMLElement).querySelector('[data-testid=storage-media-dir]')?.textContent).toContain('/mnt/backups/media');
  });

  it('only the parts that can be cleaned and have something offer cleaning', async () => {
    const fixture = await open();
    const btn = (id: string) => fixture.nativeElement.querySelector(`[data-testid=storage-clean-${id}]`) as HTMLButtonElement;
    expect(btn('cache').disabled).toBe(false);
    expect(btn('final').disabled).toBe(true); // the results are not cleaned from here
    expect(btn('backups').disabled).toBe(true); // nothing to clean
  });

  it('cleans a part after confirming, says what it freed and reloads', async () => {
    confirm = true;
    const fixture = await open();
    (fixture.nativeElement.querySelector('[data-testid=storage-clean-animations]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/storage/clean' });
    expect(req.request.body).toEqual({ parts: ['animations'] });
    req.flush({ freed_bytes: 38_000_000, cleaned: { animations: 38_000_000 } });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/projects/demo/storage').flush({ ...STORAGE, parts: STORAGE.parts.map((p) => (p.id === 'animations' ? { ...p, bytes: 0, files: 0 } : p)) });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[data-testid=storage-clean-animations]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does nothing when the confirmation is refused', async () => {
    confirm = false;
    const fixture = await open();
    (fixture.nativeElement.querySelector('[data-testid=storage-clean-cache]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    http.expectNone('/api/projects/demo/storage/clean');
  });
});
