import { TestBed } from '@angular/core/testing';

import { CONNECTION_STORES, ConnectionService, STORAGE_KEY, normalizeServer } from './connection.service';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

function setup(persistent = memory(), session = memory()) {
  TestBed.configureTestingModule({ providers: [{ provide: CONNECTION_STORES, useValue: { persistent, session } }] });
  return { service: TestBed.inject(ConnectionService), persistent, session };
}

describe('normalizeServer', () => {
  it('trims, drops a trailing slash or /api and leaves the rest', () => {
    expect(normalizeServer(' http://host:4666/api/ ')).toBe('http://host:4666');
    expect(normalizeServer('http://host:4666///')).toBe('http://host:4666');
    expect(normalizeServer('https://host/base')).toBe('https://host/base');
    expect(normalizeServer('')).toBe('');
    expect(normalizeServer(undefined)).toBe('');
  });
});

describe('ConnectionService', () => {
  it('starts on the page\'s own server with no token when nothing was saved', () => {
    const { service } = setup();
    expect(service.server()).toBe('');
    expect(service.token()).toBe('');
    expect(service.remote()).toBe(false);
    expect(service.hasToken()).toBe(false);
    expect(service.remember()).toBe(true);
  });

  it('keeps what is remembered in the persistent store only, and reads it back', () => {
    const { service, persistent, session } = setup();
    expect(service.save({ server: 'http://host:4666/api', token: 'abc' }, true)).toBe(true);
    expect(JSON.parse(persistent.getItem(STORAGE_KEY)!)).toEqual({ server: 'http://host:4666', token: 'abc' });
    expect(session.getItem(STORAGE_KEY)).toBeNull();

    TestBed.resetTestingModule();
    const again = setup(persistent, session).service;
    expect(again.server()).toBe('http://host:4666');
    expect(again.token()).toBe('abc');
    expect(again.remember()).toBe(true);
    expect(again.remote()).toBe(true);
  });

  it('keeps what is not remembered in the tab only, and moves it when the choice changes', () => {
    const { service, persistent, session } = setup();
    service.save({ server: 'http://a', token: 't' }, true);
    service.save({ server: 'http://a', token: 't' }, false);
    expect(persistent.getItem(STORAGE_KEY)).toBeNull();
    expect(session.getItem(STORAGE_KEY)).not.toBeNull();

    TestBed.resetTestingModule();
    const again = setup(persistent, session).service;
    expect(again.server()).toBe('http://a');
    expect(again.remember()).toBe(false);
  });

  it('prefers the persistent settings to the tab\'s', () => {
    const persistent = memory({ [STORAGE_KEY]: JSON.stringify({ server: 'http://p', token: 'p' }) });
    const session = memory({ [STORAGE_KEY]: JSON.stringify({ server: 'http://s', token: 's' }) });
    expect(setup(persistent, session).service.server()).toBe('http://p');
  });

  it('says whether the server or the token changed', () => {
    const { service } = setup();
    service.save({ server: 'http://a', token: 't' }, true);
    expect(service.save({ server: 'http://a/', token: 't' }, true)).toBe(false);
    expect(service.save({ server: 'http://a', token: 'other' }, true)).toBe(true);
    expect(service.save({ server: '', token: 'other' }, false)).toBe(true);
  });

  it('survives a corrupt entry and a store that throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
    const corrupt = memory({ [STORAGE_KEY]: '{not json' });
    const { service } = setup(corrupt, broken);
    expect(service.server()).toBe('');
    expect(() => service.save({ server: 'http://a', token: 't' }, true)).not.toThrow();
    expect(service.server()).toBe('http://a');
  });

  it('works with no storage at all', () => {
    TestBed.configureTestingModule({ providers: [{ provide: CONNECTION_STORES, useValue: { persistent: null, session: null } }] });
    const service = TestBed.inject(ConnectionService);
    service.save({ server: 'http://a', token: 't' }, true);
    expect(service.token()).toBe('t');
  });
});

describe('ConnectionService.loadDefaults (a deployment\'s config.json)', () => {
  const answer = (body: unknown, init: { ok?: boolean; type?: string } = {}) =>
    vi.fn().mockResolvedValue({ ok: init.ok ?? true, headers: { get: () => init.type ?? 'application/json' }, json: async () => body });
  afterEach(() => vi.unstubAllGlobals());

  it('takes the server and the token of the file when nothing was saved, asking next to the page and never from a cache', async () => {
    const fetchMock = answer({ server: 'http://host:4666/api/', token: 'abc' });
    vi.stubGlobal('fetch', fetchMock);
    const { service } = setup();
    await service.loadDefaults();
    expect(service.server()).toBe('http://host:4666');
    expect(service.token()).toBe('abc');
    expect(service.remote()).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(new URL('config.json', document.baseURI).href);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('does not ask for the file when the person saved a connection, and keeps theirs', async () => {
    const fetchMock = answer({ server: 'http://other:1', token: 'zzz' });
    vi.stubGlobal('fetch', fetchMock);
    const { service } = setup(memory({ [STORAGE_KEY]: JSON.stringify({ server: 'http://mine:2', token: 'mine' }) }));
    await service.loadDefaults();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.server()).toBe('http://mine:2');
    expect(service.token()).toBe('mine');
  });

  it('does not save what the file gave', async () => {
    vi.stubGlobal('fetch', answer({ server: 'http://host:4666', token: 'abc' }));
    const { service, persistent, session } = setup();
    await service.loadDefaults();
    expect(persistent.getItem(STORAGE_KEY)).toBeNull();
    expect(session.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores an answer that is not JSON (the server answers an unknown route with the page of the front end)', async () => {
    vi.stubGlobal('fetch', answer({ server: 'http://host:4666' }, { type: 'text/html; charset=utf-8' }));
    const { service } = setup();
    await service.loadDefaults();
    expect(service.server()).toBe('');
    expect(service.token()).toBe('');
  });

  it('ignores an error answer, a request that fails and a body that is not an object', async () => {
    for (const fetchMock of [answer({ server: 'x' }, { ok: false }), vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), answer(null), answer('text')]) {
      vi.stubGlobal('fetch', fetchMock);
      TestBed.resetTestingModule();
      const { service } = setup();
      await service.loadDefaults();
      expect(service.server()).toBe('');
      expect(service.token()).toBe('');
    }
  });

  it('takes only values that are text, one by one', async () => {
    vi.stubGlobal('fetch', answer({ server: 5, token: 'abc' }));
    const { service } = setup();
    await service.loadDefaults();
    expect(service.server()).toBe('');
    expect(service.token()).toBe('abc');
  });

  it('lets what the person saves afterwards win, and keeps only that', async () => {
    vi.stubGlobal('fetch', answer({ server: 'http://file:1', token: 'file' }));
    const { service, persistent } = setup();
    await service.loadDefaults();
    service.save({ server: 'http://mine:2', token: 'mine' }, true);
    expect(service.server()).toBe('http://mine:2');
    expect(JSON.parse(persistent.getItem(STORAGE_KEY)!)).toEqual({ server: 'http://mine:2', token: 'mine' });
  });
});
