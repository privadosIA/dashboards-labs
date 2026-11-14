import { TestBed } from '@angular/core/testing';

import { ProjectSummary } from './api.models';
import { ModeFilterStore, hiddenModes, hiddenRunModes, originOf, visibleProjects, visibleRuns } from './mode-filter.store';

const P = (id: string, mode: ProjectSummary['mode']): ProjectSummary => ({ id, name: id, mode, scene_count: 1 });
const LIST = [P('v1', 'video'), P('v2', 'video'), P('i1', 'images'), P('m1', 'music'), P('roto', '')];

/** A storage the test controls (the test environment has none). */
function fakeStorage(initial: Record<string, string> = {}, broken = false) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal('localStorage', storage);
  return data;
}

describe('ModeFilterStore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows only video by default', () => {
    fakeStorage();
    const store = TestBed.inject(ModeFilterStore);
    expect([...store.modes()]).toEqual(['video']);
  });

  it('remembers what was chosen and reads it back', () => {
    const data = fakeStorage();
    TestBed.inject(ModeFilterStore).set(['music', 'video']);
    expect(JSON.parse(data.get('mo.modes')!)).toEqual(['video', 'music']);
    TestBed.resetTestingModule();
    expect([...TestBed.inject(ModeFilterStore).modes()]).toEqual(['video', 'music']);
  });

  it('ignores what is stored when it is not a list of modes', () => {
    fakeStorage({ 'mo.modes': '{"nope":1}' });
    expect([...TestBed.inject(ModeFilterStore).modes()]).toEqual(['video']);
    TestBed.resetTestingModule();
    fakeStorage({ 'mo.modes': '["music","bogus"]' });
    expect([...TestBed.inject(ModeFilterStore).modes()]).toEqual(['music']);
  });

  it('works with the default, and holds for the visit, when the browser refuses storage', () => {
    fakeStorage({}, true);
    const store = TestBed.inject(ModeFilterStore);
    expect([...store.modes()]).toEqual(['video']);
    expect(() => store.set(['images'])).not.toThrow();
    expect([...store.modes()]).toEqual(['images']);
  });

  it('adds a mode, shows them all, and ignores what is not a mode', () => {
    fakeStorage();
    const store = TestBed.inject(ModeFilterStore);
    store.add('music');
    store.add('bogus');
    store.add('');
    expect([...store.modes()].sort()).toEqual(['music', 'video']);
    store.showAll();
    expect(store.modes().size).toBe(3);
  });

  it('a project that was not there before adds its mode; the first listing only records what exists', () => {
    fakeStorage();
    const store = TestBed.inject(ModeFilterStore);
    store.revealNew(LIST);
    expect([...store.modes()]).toEqual(['video']); // nothing added by the first listing
    store.revealNew([...LIST, P('nuevo', 'music')]);
    expect([...store.modes()].sort()).toEqual(['music', 'video']);
    store.revealNew([...LIST, P('nuevo', 'music'), P('otro', '')]); // a project with no mode adds nothing
    expect(store.modes().size).toBe(2);
  });
});

describe('visibleProjects and hiddenModes', () => {
  it('lists the chosen modes and always the projects with no mode', () => {
    expect(visibleProjects(LIST, new Set(['video'])).map((p) => p.id)).toEqual(['v1', 'v2', 'roto']);
    expect(visibleProjects(LIST, new Set(['music', 'images'])).map((p) => p.id)).toEqual(['i1', 'm1', 'roto']);
    expect(visibleProjects(LIST, new Set()).map((p) => p.id)).toEqual(['roto']);
  });

  it('says which modes with projects are hidden and how many', () => {
    expect(hiddenModes(LIST, new Set(['video']))).toEqual([{ mode: 'images', count: 1 }, { mode: 'music', count: 1 }]);
    expect(hiddenModes(LIST, new Set(['video', 'images', 'music']))).toEqual([]);
    expect(hiddenModes([P('v', 'video')], new Set(['music']))).toEqual([{ mode: 'video', count: 1 }]);
  });
});

describe('where a project was made', () => {
  const MIXED = [P('v1', 'video'), P('mobile-20261022-gato', 'video'), P('mobile-20261022-cancion', 'music'), P('m1', 'music')];

  it('the projects the Create page makes are the mobile ones, whatever the device', () => {
    expect(originOf('mobile-20261022-gato')).toBe('mobile');
    expect(originOf('gato')).toBe('desktop');
    expect(originOf('mi-mobile-gato')).toBe('desktop');
  });

  it('lists the projects of the origins chosen, together with the modes', () => {
    const all = new Set(['video', 'images', 'music'] as const);
    expect(visibleProjects(MIXED, all, new Set(['desktop'])).map((p) => p.id)).toEqual(['v1', 'm1']);
    expect(visibleProjects(MIXED, all, new Set(['mobile'])).map((p) => p.id)).toEqual(['mobile-20261022-gato', 'mobile-20261022-cancion']);
    expect(visibleProjects(MIXED, new Set(['music']), new Set(['mobile'])).map((p) => p.id)).toEqual(['mobile-20261022-cancion']);
    expect(visibleProjects(MIXED, all).length).toBe(4); // both origins unless told otherwise
    expect(visibleProjects(MIXED, all, new Set()).length).toBe(0);
  });

  it('the runs follow their project, and the hidden modes are counted among the origins chosen', () => {
    const runs = MIXED.map((p) => ({ project: p.id }));
    expect(visibleRuns(runs, MIXED, new Set(['video']), new Set(['mobile'])).map((r) => r.project)).toEqual(['mobile-20261022-gato']);
    expect(hiddenRunModes(runs, MIXED, new Set(['video']), new Set(['mobile']))).toEqual([{ mode: 'music', count: 1 }]);
    expect(hiddenModes(MIXED, new Set(['video']), new Set(['desktop']))).toEqual([{ mode: 'music', count: 1 }]);
  });

  describe('the preference', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('shows both origins by default, remembers a choice and shows all again with showAll', () => {
      const data = fakeStorage();
      const store = TestBed.inject(ModeFilterStore);
      expect([...store.origins()].sort()).toEqual(['desktop', 'mobile']);
      store.setOrigins(['mobile']);
      expect(JSON.parse(data.get('mo.origins')!)).toEqual(['mobile']);
      store.showAll();
      expect([...store.origins()].sort()).toEqual(['desktop', 'mobile']);
    });

    it('a new mobile project shows its origin again, so what was just made is not hidden', () => {
      fakeStorage({ 'mo.origins': '["desktop"]' });
      const store = TestBed.inject(ModeFilterStore);
      store.revealNew([P('v1', 'video')]);
      store.revealNew([P('v1', 'video'), P('mobile-20261022-gato', 'video')]);
      expect([...store.origins()].sort()).toEqual(['desktop', 'mobile']);
    });
  });
});
