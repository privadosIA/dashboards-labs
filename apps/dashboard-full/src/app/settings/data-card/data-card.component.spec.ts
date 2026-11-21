import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';

import { DataImportRecord, DataStatus } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ShareService } from '../../core/share.service';
import { DataCardComponent } from './data-card.component';

const PARTS: DataImportRecord = {
  entity: 'music-motion/parts',
  state: 'done',
  created: 12,
  existing: 0,
  skipped: [{ path: 'parts/broken.json', reason: 'invalid JSON at line 3' }],
  started_at: '2026-11-19T10:00:00Z',
  finished_at: '2026-11-19T10:00:01Z',
};
const STATUS: DataStatus = {
  engine: 'sqlite',
  migrations: { applied: [{ id: '202610010900_core', applied_at: '2026-11-01T09:00:00Z' }, { id: '202611040800_library', applied_at: '2026-11-04T08:00:00Z' }], pending: ['202611200900_history'] },
  tables: [{ name: 'projects', rows: 2 }, { name: 'music_parts', rows: 12 }],
  imports: [PARTS],
  legacy_files: [
    { entity: 'settings', files: 1, bytes: 2048 },
    { entity: 'providers', files: 13, bytes: 2_386_000 },
    { entity: 'prompts', files: 0, bytes: 0 },
  ],
};
const refusal = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { error: { code: 'x', message } } }));

describe('DataCardComponent', () => {
  let fixture: ComponentFixture<DataCardComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let share: { saveBlob: ReturnType<typeof vi.fn> };
  let dialogData: { message: string; destructive?: boolean; confirmLabel: string }[];
  let confirm = true;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const click = async (id: string) => {
    q<HTMLButtonElement>(id)!.click();
    await settle();
  };
  const tick = async (entity: string) => {
    q(`data-legacy-${entity}`)!.querySelector('input')!.click();
    await settle();
  };

  async function open(status: DataStatus = STATUS) {
    dialogData = [];
    confirm = true;
    api = {
      getDataStatus: vi.fn(() => of(status)),
      importData: vi.fn(() => of({ imports: [] })),
      cleanLegacyData: vi.fn(() => of({ cleaned: [] })),
      downloadDataExport: vi.fn(() => of(new HttpResponse({ body: new Blob(['zip']), headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="mediaorquestator-data-20261119-133655.zip"' }) }))),
    };
    share = { saveBlob: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [DataCardComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ShareService, useValue: share },
        {
          provide: MatDialog,
          useValue: {
            open: (_c: unknown, config: { data: (typeof dialogData)[number] }) => {
              dialogData.push(config.data);
              return { afterClosed: () => of(confirm) };
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DataCardComponent);
    fixture.detectChanges();
    await settle();
  }

  describe('the state of the data', () => {
    it('names the engine, the migrations, the pending ones with a warning, the rows and the import with its skipped file', async () => {
      await open();
      expect(q('data-engine')!.textContent).toContain('sqlite');
      expect(q('data-migrations')!.textContent).toContain('2');
      expect(q('data-pending')!.textContent).toContain('202611200900_history');
      expect(q('data-table-music_parts')!.textContent).toContain('12');
      expect(q('data-table-projects')!.textContent).toContain('2');
      const record = q('data-import-music-motion/parts')!;
      expect(record.textContent).toContain('12');
      expect(q('data-import-skipped-music-motion/parts')!.textContent).toContain('parts/broken.json');
      expect(q('data-import-skipped-music-motion/parts')!.textContent).toContain('invalid JSON at line 3');
    });

    it('shows no warning when no migration is pending', async () => {
      await open({ ...STATUS, migrations: { applied: STATUS.migrations.applied, pending: [] } });
      expect(q('data-pending')).toBeNull();
    });

    it('says in words that the state could not be read, offers to try again and keeps the rest of the page out of it', async () => {
      await open();
      api['getDataStatus'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      await click('data-refresh');
      expect(q('data-load-error')).not.toBeNull();
      api['getDataStatus'].mockReturnValue(of(STATUS));
      await click('data-retry');
      expect(q('data-load-error')).toBeNull();
      expect(q('data-engine')).not.toBeNull();
    });

    it('shows a progress bar and disables the buttons while a request runs', async () => {
      await open();
      expect(q('data-busy')).toBeNull();
      const pending = new Subject<DataStatus>();
      api['getDataStatus'].mockReturnValue(pending);
      await click('data-refresh');
      expect(q('data-busy')).not.toBeNull();
      expect(q<HTMLButtonElement>('data-import-all')!.disabled).toBe(true);
      pending.next(STATUS);
      pending.complete();
      await settle();
      expect(q('data-busy')).toBeNull();
      expect(q<HTMLButtonElement>('data-import-all')!.disabled).toBe(false);
    });
  });

  describe('importing', () => {
    it('imports what is pending and shows both records, the failed one with its error and its button', async () => {
      await open();
      const done: DataImportRecord = { ...PARTS, entity: 'settings', skipped: [] };
      const failed: DataImportRecord = { ...PARTS, entity: 'providers', state: 'failed', created: 0, skipped: [], error: 'a row could not be written' };
      api['importData'].mockReturnValue(of({ imports: [done, failed] }));
      api['getDataStatus'].mockReturnValue(of({ ...STATUS, imports: [PARTS, done, failed] }));
      await click('data-import-all');
      expect(api['importData']).toHaveBeenCalledWith(undefined);
      expect(q('data-import-settings')).not.toBeNull();
      expect(q('data-import-error-providers')!.textContent).toContain('a row could not be written');
      expect(q('data-import-again-providers')).not.toBeNull();
      expect(api['getDataStatus']).toHaveBeenCalledTimes(2);
    });

    it('imports one entity again, with its name, and replaces only that record', async () => {
      await open({ ...STATUS, imports: [PARTS, { ...PARTS, entity: 'settings', skipped: [] }] });
      const again: DataImportRecord = { ...PARTS, created: 0, existing: 12, skipped: [] };
      api['importData'].mockReturnValue(of({ imports: [again] }));
      api['getDataStatus'].mockReturnValue(of({ ...STATUS, imports: [again, { ...PARTS, entity: 'settings', skipped: [] }] }));
      await click('data-import-again-music-motion/parts');
      expect(api['importData']).toHaveBeenCalledWith('music-motion/parts');
      expect(q('data-import-skipped-music-motion/parts')).toBeNull();
      expect(q('data-import-settings')).not.toBeNull();
    });

    it('shows the reason of a 409 or a 404, changes nothing on screen and leaves the buttons usable', async () => {
      await open();
      api['importData'].mockReturnValue(refusal(409, 'another import is running'));
      await click('data-import-all');
      expect(q('data-error')!.textContent).toContain('another import is running');
      expect(q('data-import-music-motion/parts')).not.toBeNull();
      expect(q<HTMLButtonElement>('data-import-all')!.disabled).toBe(false);
      api['importData'].mockReturnValue(refusal(404, 'no entity "x"; they are settings, providers'));
      await click('data-import-again-music-motion/parts');
      expect(q('data-error')!.textContent).toContain('they are settings, providers');
      expect(api['getDataStatus']).toHaveBeenCalledTimes(1);
    });
  });

  describe('the export', () => {
    it('fetches the export and saves it with the name the server gives', async () => {
      await open();
      await click('data-export');
      expect(api['downloadDataExport']).toHaveBeenCalledTimes(1);
      expect(share.saveBlob).toHaveBeenCalledTimes(1);
      const [blob, name] = share.saveBlob.mock.calls[0];
      expect(blob).toBeInstanceOf(Blob);
      expect(name).toBe('mediaorquestator-data-20261119-133655.zip');
      expect(q('data-error')).toBeNull();
    });

    it('saves it with a dated name when the page cannot read the name', async () => {
      await open();
      api['downloadDataExport'].mockReturnValue(of(new HttpResponse({ body: new Blob(['zip']) })));
      await click('data-export');
      expect(share.saveBlob.mock.calls[0][1]).toMatch(/^mediaorquestator-data-\d{4}-\d{2}-\d{2}\.zip$/);
    });

    it('says so, with the server\'s reason, and saves nothing when the server refuses', async () => {
      await open();
      const body = new Blob([JSON.stringify({ error: { code: 'unauthorized', message: 'missing or invalid access token' } })]);
      api['downloadDataExport'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401, error: body })));
      await click('data-export');
      expect(q('data-error')!.textContent).toContain('missing or invalid access token');
      expect(share.saveBlob).not.toHaveBeenCalled();
      expect(q<HTMLButtonElement>('data-export')!.disabled).toBe(false);
    });

    it('says the export could not be downloaded when the server gave no reason', async () => {
      await open();
      api['downloadDataExport'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      await click('data-export');
      expect(q('data-error')).not.toBeNull();
      expect(share.saveBlob).not.toHaveBeenCalled();
    });

    it('shows the progress bar while the file is being fetched', async () => {
      await open();
      const pending = new Subject<HttpResponse<Blob>>();
      api['downloadDataExport'].mockReturnValue(pending);
      await click('data-export');
      expect(q('data-busy')).not.toBeNull();
      expect(q<HTMLButtonElement>('data-export')!.disabled).toBe(true);
      pending.next(new HttpResponse({ body: new Blob(['zip']) }));
      pending.complete();
      await settle();
      await settle(); // the card reads the status again once the file is saved
      expect(share.saveBlob).toHaveBeenCalledTimes(1);
      expect(q('data-busy')).toBeNull();
    });
  });

  describe('deleting the old state files', () => {
    it('lists only the entities that have files, and the button waits for a tick', async () => {
      await open();
      expect(q('data-legacy-settings')).not.toBeNull();
      expect(q('data-legacy-providers')).not.toBeNull();
      expect(q('data-legacy-prompts')).toBeNull();
      expect(q<HTMLButtonElement>('data-clean')!.disabled).toBe(true);
      await tick('settings');
      expect(q<HTMLButtonElement>('data-clean')!.disabled).toBe(false);
    });

    it('asks first, naming the entities, the files and the size, then sends one request with both and shows what was deleted', async () => {
      await open();
      await tick('settings');
      await tick('providers');
      api['cleanLegacyData'].mockReturnValue(of({ cleaned: [{ entity: 'settings', deleted: 1, bytes: 2048 }, { entity: 'providers', deleted: 13, bytes: 2_386_000 }] }));
      api['getDataStatus'].mockReturnValue(of({ ...STATUS, legacy_files: STATUS.legacy_files.map((l) => ({ ...l, files: 0, bytes: 0 })) }));
      await click('data-clean');
      expect(dialogData).toHaveLength(1);
      expect(dialogData[0].destructive).toBe(true);
      expect(dialogData[0].message).toContain('settings, providers');
      expect(dialogData[0].message).toContain('14');
      expect(dialogData[0].message).toContain('2,3 MB');
      expect(api['cleanLegacyData']).toHaveBeenCalledTimes(1);
      expect(api['cleanLegacyData']).toHaveBeenCalledWith(['settings', 'providers']);
      expect(q('data-cleaned')!.textContent).toContain('providers');
      expect(q('data-legacy-settings')).toBeNull();
      expect(q('data-legacy-empty')).not.toBeNull();
    });

    it('sends nothing when the dialog is cancelled, and the ticks stay', async () => {
      await open();
      await tick('settings');
      confirm = false;
      await click('data-clean');
      expect(dialogData).toHaveLength(1);
      expect(api['cleanLegacyData']).not.toHaveBeenCalled();
      expect(q('data-legacy-settings')!.querySelector('input')!.checked).toBe(true);
    });

    it('shows the reason of a 409, says nothing was deleted and keeps the entities listed', async () => {
      await open();
      await tick('providers');
      api['cleanLegacyData'].mockReturnValue(refusal(409, 'its import skipped a file'));
      await click('data-clean');
      expect(q('data-error')!.textContent).toContain('its import skipped a file');
      expect(q('data-nothing-deleted')).not.toBeNull();
      expect(q('data-cleaned')).toBeNull();
      expect(q('data-legacy-providers')).not.toBeNull();
    });

    it('does not decide itself what may be deleted: an entity whose import failed is offered like any other', async () => {
      await open({ ...STATUS, imports: [{ ...PARTS, entity: 'providers', state: 'failed', skipped: [], error: 'x' }] });
      await tick('providers');
      expect(q<HTMLButtonElement>('data-clean')!.disabled).toBe(false);
    });
  });
});
