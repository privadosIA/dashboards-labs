import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MotionCatalogJson } from './api.models';
import { MotionCatalogStore, toPart } from './motion-catalog.store';

const CATALOG: MotionCatalogJson = {
  parts: [
    { name: 'counter', description: 'A counter', levels: ['simple', 'medium', 'advanced'], cost_ms: 55, params: [{ name: 'to', type: 'int', default: '100', min: 1, max: 999 }, { name: 'label', type: 'string', default: 'x', max_length: 20, description: 'Shown' }] },
    { name: 'timeline-strip', description: 'A strip', levels: ['simple', 'huge'], cost_ms: 77, manual: true, params: [{ name: 'align', type: 'enum', default: 'left', options: ['left', 'right'] }] },
  ],
  fonts: ['Inter', 'Space Grotesk'],
};

describe('MotionCatalogStore', () => {
  let store: MotionCatalogStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(MotionCatalogStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('has no parts until the server answers', () => {
    expect(store.known()).toBe(false);
    expect(store.available()).toBe(false);
    expect(store.parts()).toEqual([]);
  });

  it('reads the catalog once and gives its parts, typefaces and a part by name', async () => {
    const p = store.load();
    http.expectOne('/api/music-motion/catalog').flush(CATALOG);
    await p;
    await store.load(); // not asked again
    expect(store.known()).toBe(true);
    expect(store.available()).toBe(true);
    expect(store.parts().map((x) => x.name)).toEqual(['counter', 'timeline-strip']);
    expect(store.fonts()).toEqual(['Inter', 'Space Grotesk']);
    expect(store.part('counter')?.params[0]).toMatchObject({ name: 'to', min: 1, max: 999 });
    expect(store.part('nope')).toBeUndefined();
  });

  it('reads it again after invalidate(), so a part approved meanwhile is offered', async () => {
    const first = store.load();
    http.expectOne('/api/music-motion/catalog').flush(CATALOG);
    await first;
    store.invalidate();
    const again = store.load();
    http.expectOne('/api/music-motion/catalog').flush({ ...CATALOG, parts: [...CATALOG.parts, { name: 'fresh', description: 'New', levels: ['simple'], cost_ms: 10, params: [] }] });
    await again;
    expect(store.parts().map((x) => x.name)).toContain('fresh');
  });

  it('offers nothing from a server that has no catalog (404) or does not answer', async () => {
    const p = store.load();
    http.expectOne('/api/music-motion/catalog').flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(store.known()).toBe(true);
    expect(store.available()).toBe(false);
    expect(store.parts()).toEqual([]);
    expect(store.fonts()).toEqual([]);
  });

  it('offers nothing from a catalog with no parts', async () => {
    const p = store.load();
    http.expectOne('/api/music-motion/catalog').flush({ parts: [] });
    await p;
    expect(store.available()).toBe(false);
  });
});

describe('toPart', () => {
  it('maps the server\'s names, keeps the marks and drops a level it does not know', () => {
    const [counter, strip] = CATALOG.parts.map(toPart);
    expect(counter).toMatchObject({ name: 'counter', costMs: 55, manual: false, levels: ['simple', 'medium', 'advanced'] });
    expect(counter.params[1]).toEqual({ name: 'label', type: 'string', default: 'x', description: 'Shown', maxLength: 20 });
    expect(strip).toMatchObject({ manual: true, levels: ['simple'] });
    expect(strip.params[0].options).toEqual(['left', 'right']);
  });
});
