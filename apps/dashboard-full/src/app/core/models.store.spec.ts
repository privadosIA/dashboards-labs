import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AssetKindListing, CatalogEntry, DownloadRecord } from './api.models';
import { DownloadStreamHandlers, DownloadStreamService } from './download-stream.service';
import { ModelsStore } from './models.store';
import { fakeStorage } from './storage-fake';

const KINDS: AssetKindListing[] = [
  { kind: 'model', dir: 'models', extensions: ['.safetensors'], assets: [] },
  { kind: 'voice', dir: 'voices', extensions: ['.onnx'], assets: [] },
  { kind: 'lora', dir: 'models/loras', extensions: ['.safetensors'], note: 'no aplicado', assets: [] },
];
const CATALOG: CatalogEntry[] = [
  {
    id: 'sd-1-5',
    kind: 'model',
    name: 'Stable Diffusion 1.5',
    description: 'base',
    size_bytes: 100,
    files: [{ name: 'a.safetensors', url: 'https://h/a.safetensors' }],
    installed: false,
  },
];
const rec = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  id: 'dl-1',
  state: 'queued',
  kind: 'model',
  name: 'a.safetensors',
  files: ['a.safetensors'],
  source: 'catalog:sd-1-5',
  bytes: 0,
  created_at: '2026-10-09T10:00:00Z',
  ...over,
});

describe('ModelsStore', () => {
  let store: ModelsStore;
  let http: HttpTestingController;
  let handlers: Map<string, DownloadStreamHandlers>;
  let closed: string[];

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    handlers = new Map();
    closed = [];
    TestBed.inject(DownloadStreamService).connect = (id, h) => {
      handlers.set(id, h);
      return { close: () => closed.push(id) };
    };
    store = TestBed.inject(ModelsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the inventory refresh a success/deletion triggers, env included. */
  async function flushInventory(installed: boolean): Promise<void> {
    await vi.waitFor(() => http.expectOne('/api/assets').flush({ kinds: KINDS }));
    http.expectOne('/api/assets/catalog').flush({ entries: [{ ...CATALOG[0], installed }] });
    await vi.waitFor(() =>
      http.expectOne('/api/environment').flush({ binaries: [], models: [], voices: [], loras: [], gpus: [] }),
    );
  }

  async function load(downloads: DownloadRecord[] = []): Promise<void> {
    const p = store.refresh();
    http.expectOne('/api/assets').flush({ kinds: KINDS });
    http.expectOne('/api/assets/catalog').flush({ entries: CATALOG });
    http.expectOne('/api/downloads').flush({ downloads });
    await p;
  }

  it('loads inventories, catalog and downloads', async () => {
    await load();
    expect(store.kinds().map((k) => k.kind)).toEqual(['model', 'voice', 'lora']);
    expect(store.catalog()[0].id).toBe('sd-1-5');
    expect(store.downloads()).toEqual([]);
  });

  it('re-attaches streams to downloads still active after a page reload', async () => {
    await load([rec({ state: 'running' }), rec({ id: 'dl-0', state: 'succeeded' })]);
    expect([...handlers.keys()]).toEqual(['dl-1']);
    expect(store.activeByCatalog().get('sd-1-5')?.id).toBe('dl-1');
  });

  it('start() posts, lists the download first and follows it', async () => {
    await load();
    const p = store.start({ id: 'sd-1-5' });
    const req = http.expectOne('/api/downloads');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 'sd-1-5' });
    req.flush({ download: rec() }, { status: 202, statusText: 'Accepted' });
    await p;
    expect(store.downloads()[0].id).toBe('dl-1');
    expect(handlers.has('dl-1')).toBe(true);
  });

  it('start() rejects with the server error and leaves the list untouched', async () => {
    await load();
    const p = store.start({ kind: 'model', url: 'https://h/a.safetensors' });
    http
      .expectOne('/api/downloads')
      .flush({ error: { code: 'conflict', message: 'a.safetensors already exists' } }, { status: 409, statusText: 'Conflict' });
    await expect(p).rejects.toMatchObject({ status: 409 });
    expect(store.downloads()).toEqual([]);
  });

  it('applies progress and state events and refreshes inventories on success', async () => {
    await load([rec({ state: 'running' })]);
    const h = handlers.get('dl-1')!;
    h.onProgress({ id: 'dl-1', bytes: 50, total: 100 });
    expect(store.downloads()[0]).toMatchObject({ bytes: 50, total: 100 });
    h.onProgress({ id: 'dl-1', bytes: 60, total: 0 });
    expect(store.downloads()[0].total).toBeUndefined();

    h.onState({ id: 'dl-1', state: 'succeeded', error: '' });
    expect(store.downloads()[0].state).toBe('succeeded');
    await flushInventory(true);
    expect(store.catalog()[0].installed).toBe(true);
    h.onEnd();
    expect(store.activeByCatalog().size).toBe(0);
  });

  it('keeps the failure message for failed downloads', async () => {
    await load([rec({ state: 'running' })]);
    handlers.get('dl-1')!.onState({ id: 'dl-1', state: 'failed', error: 'remote answered 404' });
    expect(store.downloads()[0]).toMatchObject({ state: 'failed', error: 'remote answered 404' });
  });

  it('cancel() posts and marks the download cancelled', async () => {
    await load([rec({ state: 'running' })]);
    const p = store.cancel('dl-1');
    http.expectOne('/api/downloads/dl-1/cancel').flush({ download: rec({ state: 'cancelled' }) });
    await p;
    expect(store.downloads()[0].state).toBe('cancelled');
  });

  it('remove() deletes, then refreshes inventories and the environment report', async () => {
    await load();
    const p = store.remove('model', 'a b.safetensors');
    const del = http.expectOne('/api/assets/model/a%20b.safetensors');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await flushInventory(false);
    await p;
  });

  it('remove() surfaces 409 without refreshing', async () => {
    await load();
    const p = store.remove('model', 'a.safetensors');
    http
      .expectOne('/api/assets/model/a.safetensors')
      .flush({ error: { code: 'conflict', message: 'run r1 is queued or active' } }, { status: 409, statusText: 'Conflict' });
    await expect(p).rejects.toMatchObject({ status: 409 });
  });
});
