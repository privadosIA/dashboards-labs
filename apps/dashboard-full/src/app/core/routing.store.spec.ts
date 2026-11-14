import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RoutingResponse } from './api.models';
import { RoutingStore } from './routing.store';

const local = { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' };
const ROUTING: RoutingResponse = {
  routing: {
    assistant: { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-mini' },
    describe_image: { provider: 'lan', name: 'LAN', remote: false, consented: true, model: 'v' },
    describe_video: local,
    quality: local,
    motion_graphics: local,
  },
  max_calls: 30,
};

describe('RoutingStore', () => {
  let store: RoutingStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(RoutingStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the routing once and answers per task', async () => {
    const p = store.load();
    http.expectOne('/api/routing').flush(ROUTING);
    await p;
    await store.load(); // a second load does not ask again
    expect(store.maxCalls()).toBe(30);
    expect(store.remoteName('assistant')).toBe('Cloud');
    expect(store.remoteName('describe_image')).toBeNull(); // on this machine
    expect(store.remoteName('quality')).toBeNull();
    expect(store.external('describe_image')).toBe(true); // not the built-in one
    expect(store.external('quality')).toBe(false);
  });

  it('shows nothing when the server does not answer', async () => {
    const p = store.load();
    http.expectOne('/api/routing').flush({}, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(store.remoteName('assistant')).toBeNull();
    expect(store.external('assistant')).toBe(false);
    expect(store.maxCalls()).toBe(60);
  });

  it('refresh reads it again and set replaces it', async () => {
    store.set(ROUTING);
    expect(store.remoteName('assistant')).toBe('Cloud');
    const p = store.refresh();
    http.expectOne('/api/routing').flush({ ...ROUTING, routing: { ...ROUTING.routing, assistant: local } });
    await p;
    expect(store.remoteName('assistant')).toBeNull();
  });
});
