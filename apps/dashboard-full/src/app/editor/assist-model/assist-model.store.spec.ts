import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { fakeStorage } from '../../core/storage-fake';
import { AssistModelStore, SLOW_MODEL_BYTES } from './assist-model.store';

const LIST = {
  default: 'qwen3:8b',
  models: [
    { name: 'huihui_ai/qwen3-abliterated:8b', size_bytes: 5e9, fits: true },
    { name: 'gemma4:31b', size_bytes: 19e9, fits: false },
    { name: 'big:20b', size_bytes: 20e9, fits: true },
  ],
};

describe('AssistModelStore', () => {
  let http: HttpTestingController;
  const make = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AssistModelStore);
  };

  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('reads the installed models once and knows the default', async () => {
    const store = make();
    const loading = store.load();
    http.expectOne('/api/assist/models').flush(LIST);
    await loading;
    await store.load(); // a second call asks for nothing
    expect(store.models().length).toBe(3);
    expect(store.defaultModel()).toBe('qwen3:8b');
    expect(store.loaded()).toBe(true);
  });

  it('remembers the choice in the browser, and an empty choice is the default', async () => {
    const store = make();
    const loading = store.load();
    http.expectOne('/api/assist/models').flush(LIST);
    await loading;
    expect(store.selected()).toBe('');
    store.choose('huihui_ai/qwen3-abliterated:8b');
    expect(store.selected()).toBe('huihui_ai/qwen3-abliterated:8b');
    expect(localStorage.getItem('mo.assistModel')).toBe('huihui_ai/qwen3-abliterated:8b');
    TestBed.resetTestingModule();
    expect(make().selected()).toBe('huihui_ai/qwen3-abliterated:8b'); // trusted until the list is read
    TestBed.inject(AssistModelStore).choose('');
    expect(localStorage.getItem('mo.assistModel')).toBeNull();
  });

  it('a choice that is no longer installed counts as the default once the list is known', async () => {
    localStorage.setItem('mo.assistModel', 'gone:1');
    const store = make();
    expect(store.selected()).toBe('gone:1');
    const loading = store.load();
    http.expectOne('/api/assist/models').flush(LIST);
    await loading;
    expect(store.selected()).toBe('');
  });

  it('works when the storage is unavailable', () => {
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = make();
    expect(store.selected()).toBe('');
    store.choose('x:1');
    expect(store.selected()).toBe('x:1'); // lasts until reload
    get.mockRestore();
    set.mockRestore();
  });

  it('an Ollama that does not answer leaves the default in use', async () => {
    const store = make();
    const loading = store.load();
    http.expectOne('/api/assist/models').flush({ error: { code: 'unavailable', message: 'down' } }, { status: 503, statusText: 'x' });
    await loading;
    expect(store.models()).toEqual([]);
    expect(store.loaded()).toBe(true);
    expect(store.selected()).toBe('');
  });

  it('warns about models that do not fit the memory or are too slow on the CPU', () => {
    expect(AssistModelStore.warning(LIST.models[0])).toBe('');
    expect(AssistModelStore.warning(LIST.models[1])).toBe('memory');
    expect(AssistModelStore.warning(LIST.models[2])).toBe('slow');
    expect(SLOW_MODEL_BYTES).toBe(14e9);
  });
});
