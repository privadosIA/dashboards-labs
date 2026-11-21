import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ALL_AVAILABLE, missing } from './availability.fake';
import { AvailabilityStore } from './availability.store';

describe('AvailabilityStore', () => {
  let store: AvailabilityStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(AvailabilityStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('has nothing available until an answer arrives', () => {
    expect(store.known()).toBe(false);
    expect(store.available('assistant')).toBe(false);
    expect(store.missingModel('describe_image')).toBeNull();
    expect(store.anyAvailable(['describe_image', 'describe_video'])).toBe(false);
  });

  it('reads it once and answers per task', async () => {
    const p = store.load();
    http.expectOne('/api/models/availability').flush(missing('describe_image', 'no_vision_model'));
    await p;
    await store.load(); // not asked again
    expect(store.known()).toBe(true);
    expect(store.available('assistant')).toBe(true);
    expect(store.available('describe_image')).toBe(false);
    expect(store.anyAvailable(['describe_image', 'describe_video'])).toBe(true);
  });

  it('keeps everything hidden when the server does not answer', async () => {
    const p = store.load();
    http.expectOne('/api/models/availability').flush({}, { status: 500, statusText: 'Server Error' });
    await p;
    expect(store.known()).toBe(false);
    expect(store.available('assistant')).toBe(false);
  });

  it('refresh asks again, and a task can become available', async () => {
    store.data.set(missing('assistant', 'unreachable'));
    expect(store.available('assistant')).toBe(false);
    const p = store.refresh();
    http.expectOne('/api/models/availability').flush(ALL_AVAILABLE);
    await p;
    expect(store.available('assistant')).toBe(true);
  });

  it('a notice is for a missing model only: not for an unreachable provider, a rejected key or a missing consent', () => {
    for (const reason of ['no_models', 'no_vision_model', 'no_model'] as const) {
      store.data.set(missing('assistant', reason));
      expect(store.missingModel('assistant')?.reason).toBe(reason);
    }
    for (const reason of ['unreachable', 'key_rejected', 'no_consent'] as const) {
      store.data.set({ tasks: { ...ALL_AVAILABLE.tasks, assistant: { available: false, reason, provider: { id: 'x', name: 'X', type: 'openai' } } } });
      expect(store.missingModel('assistant')).toBeNull();
      expect(store.available('assistant')).toBe(false);
    }
  });

  it('refreshes when the window regains the focus', async () => {
    store.watchFocus();
    store.watchFocus(); // once
    window.dispatchEvent(new Event('focus'));
    const req = http.expectOne('/api/models/availability');
    req.flush(ALL_AVAILABLE);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.available('assistant')).toBe(true);
  });
});
