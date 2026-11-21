import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { ProjectVersion } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { ProjectHistoryData, ProjectHistoryDialogComponent } from './project-history-dialog.component';

const V = (version: number, reason: ProjectVersion['reason'] = 'save'): ProjectVersion => ({ version, created_at: `2026-11-1${version}T10:00:00Z`, reason, bytes: 1024 * version });
const NEWEST_FIRST = [V(3, 'patch'), V(2), V(1, 'run')];
const refusal = (status: number, message: string) => new HttpErrorResponse({ status, error: { error: { code: 'x', message } } });

describe('ProjectHistoryDialogComponent', () => {
  let fixture: ComponentFixture<ProjectHistoryDialogComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: { restore: ReturnType<typeof vi.fn> };
  let confirmed = true;
  let asked: { message: string; destructive?: boolean; title: string }[];

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const click = async (id: string) => {
    q(id)!.click();
    await settle();
  };

  async function open(data: Partial<ProjectHistoryData> = {}, versions: ProjectVersion[] = NEWEST_FIRST) {
    confirmed = true;
    asked = [];
    api = {
      listProjectVersions: vi.fn(() => of(structuredClone(versions))),
      getProjectVersion: vi.fn((_id: string, n: number) => of({ ...V(n), yaml: `project: demo\n# version ${n}\n` })),
    };
    store = { restore: vi.fn((id: string, n: number) => Promise.resolve({ restored: n, project: { id, name: 'Demo', mode: 'video', scene_count: 1 } })) };
    await TestBed.configureTestingModule({
      imports: [ProjectHistoryDialogComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ProjectsStore, useValue: store },
        { provide: MAT_DIALOG_DATA, useValue: { projectId: 'demo', ...data } },
      ],
    })
      // the component imports MatDialogModule, which brings its own MatDialog: the stand-in has to be provided on the component
      .overrideComponent(ProjectHistoryDialogComponent, {
        add: {
          providers: [
            {
              provide: MatDialog,
              useValue: {
                open: (_c: unknown, config: { data: (typeof asked)[number] }) => {
                  asked.push(config.data);
                  return { afterClosed: () => of(confirmed) };
                },
              },
            },
          ],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ProjectHistoryDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  it('lists the versions newest first with their number, reason and size', async () => {
    await open();
    expect(api['listProjectVersions']).toHaveBeenCalledWith('demo');
    const rows = Array.from(el().querySelectorAll('[data-testid^="version-"]:not([data-testid="version-text"])')).map((b) => b.getAttribute('data-testid'));
    expect(rows).toEqual(['version-3', 'version-2', 'version-1']);
    expect(q('version-3')!.textContent).toContain('#3');
    expect(q('version-3')!.querySelector('.chip')!.getAttribute('data-reason')).toBe('patch');
    expect(q('version-1')!.querySelector('.chip')!.getAttribute('data-reason')).toBe('run');
    expect(q('version-3')!.textContent).toContain('3,0 KB');
  });

  it('says a project with no versions has none', async () => {
    await open({}, []);
    expect(q('history-empty')).not.toBeNull();
    expect(el().querySelectorAll('li.version')).toHaveLength(0);
  });

  it('says the versions could not be read and tries again', async () => {
    await open();
    api['listProjectVersions'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    fixture = TestBed.createComponent(ProjectHistoryDialogComponent);
    fixture.detectChanges();
    await settle();
    expect(q('history-load-error')).not.toBeNull();
    await click('history-retry');
    expect(q('history-load-error')).toBeNull();
    expect(q('version-2')).not.toBeNull();
  });

  describe('reading a version', () => {
    it('shows its text read-only and changes nothing', async () => {
      await open();
      await click('version-3');
      expect(api['getProjectVersion']).toHaveBeenCalledWith('demo', 3);
      expect(q('version-text')!.textContent).toContain('# version 3');
      expect(q('version-text')!.tagName).toBe('PRE');
      expect(store.restore).not.toHaveBeenCalled();
    });

    it('moves to another version when the person chooses it', async () => {
      await open();
      await click('version-3');
      await click('version-2');
      expect(q('version-text')!.textContent).toContain('# version 2');
      expect(el().querySelectorAll('[data-testid="version-text"]')).toHaveLength(1);
    });

    it('says why a text could not be read', async () => {
      await open();
      api['getProjectVersion'].mockReturnValueOnce(throwError(() => refusal(404, 'version 3 of project "demo" not found')));
      await click('version-3');
      expect(q('history-problem')!.textContent).toContain('not found');
      expect(q('version-text')).toBeNull();
    });
  });

  describe('restoring', () => {
    it('asks first, naming the version, then restores it once, says which one and reads the list again', async () => {
      const onRestored = vi.fn();
      await open({ onRestored });
      await click('version-3');
      await click('restore-3');
      expect(asked).toHaveLength(1);
      expect(asked[0].destructive).toBe(true);
      expect(asked[0].title).toContain('3');
      expect(asked[0].message).toContain('3');
      expect(store.restore).toHaveBeenCalledTimes(1);
      expect(store.restore).toHaveBeenCalledWith('demo', 3);
      expect(q('history-restored')!.textContent).toContain('3');
      expect(onRestored).toHaveBeenCalledWith(3);
      expect(api['listProjectVersions']).toHaveBeenCalledTimes(2);
      expect(q('version-text')).toBeNull();
    });

    it('shows the new top version after the list is read again', async () => {
      await open();
      api['listProjectVersions'].mockReturnValue(of([V(4, 'restore'), ...NEWEST_FIRST]));
      await click('version-2');
      await click('restore-2');
      expect(q('version-4')!.querySelector('.chip')!.getAttribute('data-reason')).toBe('restore');
    });

    it('sends nothing when the confirmation is declined', async () => {
      await open();
      await click('version-3');
      confirmed = false;
      await click('restore-3');
      expect(store.restore).not.toHaveBeenCalled();
      expect(q('history-restored')).toBeNull();
    });

    it('the confirmation also says the editor\'s unsaved changes will be lost, when it has some', async () => {
      await open({ unsaved: true });
      await click('version-3');
      await click('restore-3');
      const withUnsaved = asked[0].message;
      TestBed.resetTestingModule();
      await open({});
      await click('version-3');
      await click('restore-3');
      expect(withUnsaved.length).toBeGreaterThan(asked[0].message.length);
    });

    it('a 409 or a 422 shows the server\'s reason and changes nothing', async () => {
      const onRestored = vi.fn();
      await open({ onRestored });
      await click('version-3');
      store.restore.mockRejectedValueOnce(refusal(409, 'project has an active or queued run'));
      await click('restore-3');
      expect(q('history-problem')!.textContent).toContain('active or queued run');
      expect(q('history-restored')).toBeNull();
      expect(onRestored).not.toHaveBeenCalled();
      store.restore.mockRejectedValueOnce(refusal(422, 'config: the text of that version is no longer valid'));
      await click('restore-3');
      expect(q('history-problem')!.textContent).toContain('no longer valid');
      expect(onRestored).not.toHaveBeenCalled();
      // the version is still chosen, so the person can try again
      expect(q('restore-3')).not.toBeNull();
    });
  });
});
