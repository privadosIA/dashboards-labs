import { TestBed } from '@angular/core/testing';

import { ConnectionService } from '@lab/server-connection';
import { OBRAS_NAVIGATE, ServerLinkService } from './server-link.service';

describe('ServerLinkService', () => {
  afterEach(() => vi.unstubAllGlobals());

  const navigate = vi.fn();

  function setup(): ServerLinkService {
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ConnectionService, useValue: { server: () => 'http://srv:4666' } },
        { provide: OBRAS_NAVIGATE, useValue: navigate },
      ],
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

  describe('the VPS says the server at home is off', () => {
    const answer = (status: number, body: () => Promise<unknown>) => vi.fn().mockResolvedValue({ ok: false, status, json: body });

    it('goes to /obras.html only for 503 {"error":"offline"}', async () => {
      vi.stubGlobal('fetch', answer(503, () => Promise.resolve({ error: 'offline' })));
      const svc = setup();
      await svc.check();
      expect(svc.reachable()).toBe(false);
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/obras.html');
    });

    it('stays on the page for a 503 with another body, a body that is not JSON, other errors and a failed request', async () => {
      const svc = setup();
      for (const f of [
        answer(503, () => Promise.resolve({ error: 'maintenance' })),
        answer(503, () => Promise.resolve(null)),
        answer(503, () => Promise.reject(new SyntaxError('not json'))),
        answer(500, () => Promise.resolve({ error: 'offline' })),
        answer(502, () => Promise.resolve({ error: 'offline' })),
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      ]) {
        vi.stubGlobal('fetch', f);
        await svc.check();
        expect(svc.reachable()).toBe(false); // the banner still shows
      }
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not go anywhere when the server answers', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
      const svc = setup();
      await svc.check();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
