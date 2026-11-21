import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let events: Subject<{ type: string }>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let activateUpdate: ReturnType<typeof vi.fn>;

  function setup(isEnabled = true): AppUpdateService {
    events = new Subject();
    checkForUpdate = vi.fn().mockResolvedValue(false);
    activateUpdate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: { isEnabled, versionUpdates: events, checkForUpdate, activateUpdate } }],
    });
    return TestBed.inject(AppUpdateService);
  }

  afterEach(() => vi.useRealTimers());

  it('is not ready until the worker has a new version downloaded', () => {
    const svc = setup();
    svc.watch();
    expect(svc.ready()).toBe(false);
    events.next({ type: 'VERSION_DETECTED' });
    expect(svc.ready()).toBe(false);
    events.next({ type: 'VERSION_READY' });
    expect(svc.ready()).toBe(true);
  });

  it('asks for a new version at start and when the app comes back to the front', () => {
    const svc = setup();
    svc.watch();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a worker (dev server, plain HTTP)', () => {
    const svc = setup(false);
    svc.watch();
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(svc.ready()).toBe(false);
  });

  it('survives a failed check (the server cannot be reached)', async () => {
    const svc = setup();
    checkForUpdate.mockRejectedValue(new Error('offline'));
    expect(() => svc.watch()).not.toThrow();
    await Promise.resolve();
    expect(svc.ready()).toBe(false);
  });
});
