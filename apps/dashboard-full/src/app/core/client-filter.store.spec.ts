import { TestBed } from '@angular/core/testing';

import { ClientFilterStore, byClients } from './client-filter.store';

const p = (id: string, client?: string) => ({ id, client });

describe('byClients', () => {
  const list = [p('a', 'other-app'), p('b', 'embedded'), p('c'), p('d', 'claude-test')];

  it('keeps every project when no label is chosen', () => {
    expect(byClients(list, new Set()).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the projects of the chosen labels, and several labels add up', () => {
    expect(byClients(list, new Set(['other-app'])).map((x) => x.id)).toEqual(['a']);
    expect(byClients(list, new Set(['other-app', 'claude-test'])).map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('counts a project with no label as embedded', () => {
    expect(byClients(list, new Set(['embedded'])).map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('ClientFilterStore', () => {
  beforeEach(() => {
    localStorage.removeItem('mo.clients');
    TestBed.resetTestingModule();
  });

  it('starts with no label chosen', () => {
    expect(TestBed.inject(ClientFilterStore).chosen().size).toBe(0);
  });

  it('remembers what was chosen for the next visit', () => {
    TestBed.inject(ClientFilterStore).set(new Set(['other-app']));
    TestBed.resetTestingModule();
    expect([...TestBed.inject(ClientFilterStore).chosen()]).toEqual(['other-app']);
  });

  it('ignores what is stored when it is not a list of texts', () => {
    localStorage.setItem('mo.clients', '{"a":1}');
    expect(TestBed.inject(ClientFilterStore).chosen().size).toBe(0);
  });

  it('drops a chosen label the server no longer reports', () => {
    const store = TestBed.inject(ClientFilterStore);
    store.set(new Set(['gone', 'other-app']));
    store.keepOnly(['other-app', 'embedded']);
    expect([...store.chosen()]).toEqual(['other-app']);
  });
});
