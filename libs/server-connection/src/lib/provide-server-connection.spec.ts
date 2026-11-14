import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@lab/api-client';

import { CONNECTION_STORES } from './connection.service';
import { provideServerConnection } from './provide-server-connection';

function setup(saved: { server: string; token: string } | null) {
  const store = { getItem: () => (saved ? JSON.stringify(saved) : null), setItem: () => undefined, removeItem: () => undefined };
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideServerConnection({ lang: 'en' }), { provide: CONNECTION_STORES, useValue: { persistent: store, session: null } }],
  });
  return { api: TestBed.inject(ApiClient), http: TestBed.inject(HttpTestingController) };
}

describe('provideServerConnection', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('points the API client at the saved server and sends the saved token as a Bearer header', () => {
    const { api, http } = setup({ server: 'http://host:4666', token: 'abc' });
    api.get('/api/settings').subscribe();
    const req = http.expectOne('http://host:4666/api/settings');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush({});
  });

  it('uses the page\'s own server and sends no header when nothing was saved', () => {
    const { api, http } = setup(null);
    api.get('/api/settings').subscribe();
    const req = http.expectOne('/api/settings');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('takes the server and the token of a deployment\'s config.json before the first call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ server: 'http://deploy:4666', token: 'dep' }) }));
    try {
      const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideServerConnection({ lang: 'en' }), { provide: CONNECTION_STORES, useValue: { persistent: store, session: null } }],
      });
      // An application waits for its initializers before it makes its first call; the test does the same.
      await TestBed.inject(ApplicationInitStatus).donePromise;
      const api = TestBed.inject(ApiClient);
      const http = TestBed.inject(HttpTestingController);
      api.get('/api/settings').subscribe();
      const req = http.expectOne('http://deploy:4666/api/settings');
      expect(req.request.headers.get('Authorization')).toBe('Bearer dep');
      req.flush({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
