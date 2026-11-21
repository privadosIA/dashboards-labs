import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { InstallJob, InstallPlan } from '../../../core/api.models';
import { ApiService } from '../../../core/api.service';
import { EnginesStore } from '../../../core/engines.store';
import { InstallStreamHandlers, InstallStreamService } from '../../../core/install-stream.service';
import { InstallDialogComponent, InstallDialogData } from './install-dialog.component';

const GB = 1e9;
const plan = (extra: Partial<InstallPlan> = {}): InstallPlan => ({
  engine: 'diffrhythm2',
  backend: 'docker',
  parts: [{ part: 'weights', need_bytes: 9.5 * GB, licenses: ['CC-BY-NC-4.0 (MuQ-MuLan)'] }],
  total_bytes: 9.5 * GB,
  disk: [{ path: '/var/lib/mediaorquestator', parts: ['weights'], need_bytes: 9.5 * GB, free_bytes: 400 * GB, sufficient: true }],
  confirm_required: true,
  ...extra,
});
const job = (extra: Partial<InstallJob> = {}): InstallJob => ({ id: 'install-1', engine: 'diffrhythm2', backend: 'docker', state: 'running', parts: [{ part: 'weights', state: 'running' }], created_at: '2026-11-19T10:00:00Z', ...extra });
const refusal = (message: string, status = 422) => throwError(() => new HttpErrorResponse({ status, error: { error: { code: 'validation_failed', message } } }));

describe('InstallDialogComponent', () => {
  let fixture: ComponentFixture<InstallDialogComponent>;
  let api: Record<'planInstall' | 'startInstall' | 'cancelInstall' | 'getInstall', ReturnType<typeof vi.fn>>;
  let handlers: InstallStreamHandlers;
  let closed: { close: ReturnType<typeof vi.fn> };
  let connected: string[];
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => el().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  };

  async function open(data: Partial<InstallDialogData> = {}, planAnswer: InstallPlan | null = plan()) {
    connected = [];
    closed = { close: vi.fn() };
    api = {
      planInstall: vi.fn(() => (planAnswer ? of(planAnswer) : refusal('Docker does not answer on this machine'))),
      startInstall: vi.fn(() => of({ install: job() })),
      cancelInstall: vi.fn(() => of({ install: job({ state: 'cancelled', parts: [{ part: 'weights', state: 'cancelled' }] }) })),
      getInstall: vi.fn(() => of({ install: job() })),
    };
    await TestBed.configureTestingModule({
      imports: [InstallDialogComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: EnginesStore, useValue: { refresh: vi.fn(() => Promise.resolve()) } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { engine: 'diffrhythm2', backend: 'docker', ...data } },
        {
          provide: InstallStreamService,
          useValue: {
            connect: (id: string, h: InstallStreamHandlers) => {
              connected.push(id);
              handlers = h;
              return closed;
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InstallDialogComponent);
    await settle();
  }

  it('asks the server for the plan first and starts nothing: the parts with their sizes, the total and the disk', async () => {
    await open();
    expect(api.planInstall).toHaveBeenCalledWith('diffrhythm2', { backend: 'docker' });
    expect(api.startInstall).not.toHaveBeenCalled();
    expect(q('plan-part-weights')!.textContent).toContain('Pesos del modelo');
    expect(q('plan-part-weights')!.textContent).toContain('9.5 GB');
    expect(q('install-total')!.textContent).toContain('9.5 GB');
    expect(q('install-disk')!.textContent).toContain('400.0 GB');
    expect(connected).toEqual([]);
  });

  it('asks to accept the licences, and starts only after the box and Download and install', async () => {
    await open();
    expect(q('install-licenses')!.textContent).toContain('CC-BY-NC-4.0');
    expect((q('install-confirm') as HTMLButtonElement).disabled).toBe(true);
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    expect((q('install-confirm') as HTMLButtonElement).disabled).toBe(false);
    q('install-confirm')!.click();
    await settle();
    expect(api.startInstall).toHaveBeenCalledWith('diffrhythm2', { backend: 'docker' });
    expect(connected).toEqual(['install-1']);
    expect(q('install-parts')).not.toBeNull();
  });

  it('needs no box when the plan has no licence', async () => {
    await open({}, plan({ parts: [{ part: 'image', need_bytes: 14 * GB }], total_bytes: 14 * GB }));
    expect(q('install-licenses')).toBeNull();
    expect((q('install-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says how much disk is missing and does not offer to start', async () => {
    await open({}, plan({ disk: [{ path: '/var/lib/mediaorquestator', parts: ['weights'], need_bytes: 9.5 * GB, free_bytes: 2 * GB, sufficient: false }] }));
    expect(q('install-disk')!.textContent).toContain('7.5 GB');
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    expect((q('install-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says nothing is missing when the plan is empty, and offers no download', async () => {
    await open({}, plan({ parts: [], total_bytes: 0, disk: [], confirm_required: false }));
    expect(q('install-nothing')).not.toBeNull();
    expect(q('install-confirm')).toBeNull();
  });

  it('shows the server\'s refusal of the plan in its words (no Docker)', async () => {
    await open({}, null);
    expect(q('install-error')!.textContent).toContain('Docker does not answer on this machine');
    expect(q('install-confirm')).toBeNull();
  });

  it('shows the refusal of the start (another install runs) and stays on the plan', async () => {
    await open();
    api.startInstall.mockReturnValue(refusal('another install is running', 409));
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    q('install-confirm')!.click();
    await settle();
    expect(q('install-error')!.textContent).toContain('another install is running');
    expect(q('install-confirm')).not.toBeNull();
  });

  it('follows the job: the parts change state and the log lines appear as the events come', async () => {
    await open();
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    q('install-confirm')!.click();
    await settle();
    handlers.onLog('fetching the weights');
    handlers.onLog('checking the files');
    handlers.onState(job({ state: 'done', parts: [{ part: 'weights', state: 'done' }] }));
    await settle();
    expect(q('install-log')!.textContent).toBe('fetching the weights\nchecking the files');
    expect(q('install-part-weights')!.getAttribute('data-state')).toBe('done');
    expect(q('install-done')).not.toBeNull();
    expect(q('install-cancel')).toBeNull();
  });

  it('cancels the install, and the part that ran shows as cancelled', async () => {
    await open();
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    q('install-confirm')!.click();
    await settle();
    q('install-cancel')!.click();
    await settle();
    expect(api.cancelInstall).toHaveBeenCalledWith('install-1');
    expect(q('install-part-weights')!.getAttribute('data-state')).toBe('cancelled');
    expect(q('install-cancelled')).not.toBeNull();
    expect(q('install-repeat')).not.toBeNull();
  });

  it('names the part that failed and why, and the repeat asks for the plan again', async () => {
    await open();
    q('install-accept')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    q('install-confirm')!.click();
    await settle();
    handlers.onState(job({ state: 'failed', error: 'weights: the program exited with status 1', parts: [{ part: 'weights', state: 'failed', error: 'weights: the program exited with status 1' }] }));
    await settle();
    expect(q('install-failed')!.textContent).toContain('Pesos del modelo');
    expect(q('install-failed')!.textContent).toContain('exited with status 1');
    api.planInstall.mockClear();
    q('install-repeat')!.click();
    await settle();
    expect(api.planInstall).toHaveBeenCalledTimes(1);
    expect(q('install-plan')).not.toBeNull();
  });

  it('follows a job that already runs (a reload or reopening), with no plan', async () => {
    await open({ jobId: 'install-1' });
    expect(api.planInstall).not.toHaveBeenCalled();
    expect(api.getInstall).toHaveBeenCalledWith('install-1');
    expect(connected).toEqual(['install-1']);
    expect(q('install-cancel')).not.toBeNull();
  });

  it('closing the dialog stops reading the job but does not cancel it', async () => {
    await open({ jobId: 'install-1' });
    fixture.destroy();
    expect(closed.close).toHaveBeenCalled();
    expect(api.cancelInstall).not.toHaveBeenCalled();
  });
});
