import { TestBed } from '@angular/core/testing';

import { ConnectionService } from '@lab/server-connection';
import { ServerLinkService } from './server-link.service';

describe('ServerLinkService', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(): ServerLinkService {
    TestBed.configureTestingModule({
      providers: [{ provide: ConnectionService, useValue: { server: () => 'http://srv:4666' } }],
    });
    return TestBed.inject(ServerLinkService);
  }

  it('is reachable when /api/health answers, asking without a token and never from a cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const svc = setup();
    await svc.check();
    expect(svc.reachable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://srv:4666/api/health', { cache: 'no-store' });
  });

  it('is unreachable when the request fails or the server answers an error', async () => {
    const svc = setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await svc.check();
    expect(svc.reachable()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await svc.check();
    expect(svc.reachable()).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await svc.check();
    expect(svc.reachable()).toBe(false);
  });

  it('turns unreachable when the device goes offline and checks again when it comes back', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const svc = setup();
    svc.watch();
    await vi.waitFor(() => expect(svc.checking()).toBe(false)); // the check made at start has ended
    fetchMock.mockClear();
    window.dispatchEvent(new Event('offline'));
    expect(svc.reachable()).toBe(false);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(svc.reachable()).toBe(true));
    expect(svc.checking()).toBe(false);
    // Services created by other specs may still listen to the shared window, so "at least" this one asked.
    expect(fetchMock).toHaveBeenCalledWith('http://srv:4666/api/health', { cache: 'no-store' });
  });
});
