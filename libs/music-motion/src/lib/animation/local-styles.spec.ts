import { TestBed } from '@angular/core/testing';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { LocalStyles, MAX_LOCAL_STYLES, type LocalStyleInput } from './local-styles';
import type { Design } from '@lab/animation-core';

const design: Design = { dark: '#1d1425', light: '#c7ad93', accent: '#6e58db', display: 'condensed', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: 'c' };
const input = (name: string, extra: Partial<LocalStyleInput> = {}): LocalStyleInput => ({ name, design, rhythm: 8, parts: ['synth-sun'], ...extra });

const service = (client = 'video-anim') => {
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'en', client } }] });
  return TestBed.inject(LocalStyles);
};

afterEach(() => vi.unstubAllGlobals());

describe('LocalStyles', () => {
  it('keeps a style, lists the newest first, edits it and removes it', () => {
    stubStorage();
    const store = service();
    const a = store.add(input('A'), 1)!;
    const b = store.add(input('B'), 2)!;
    expect(store.styles().map((s) => s.name)).toEqual(['B', 'A']);
    store.update(a.id, input('A2', { rhythm: 5 }));
    expect(store.styles().find((s) => s.id === a.id)).toMatchObject({ name: 'A2', rhythm: 5, createdAt: 1 });
    store.remove(b.id);
    expect(store.styles().map((s) => s.name)).toEqual(['A2']);
    expect(store.durable()).toBe(true);
  });

  it('survives a reload, and is kept apart for each dashboard', () => {
    const storage = stubStorage();
    service('video-anim').add(input('Mine'), 1);
    TestBed.resetTestingModule();
    expect(service('video-anim').styles().map((s) => s.name)).toEqual(['Mine']);
    TestBed.resetTestingModule();
    expect(service('another-dashboard').styles()).toEqual([]);
    expect(Object.keys([...Array(storage.length).keys()].reduce((o, i) => ({ ...o, [storage.key(i)!]: 1 }), {}))).toEqual(['music-motion.styles.video-anim']);
  });

  it('keeps at most 100 and says no to one more', () => {
    stubStorage();
    const store = service();
    for (let i = 0; i < MAX_LOCAL_STYLES; i++) expect(store.add(input(`S${i}`), i)).not.toBeNull();
    expect(store.add(input('one more'))).toBeNull();
    expect(store.styles()).toHaveLength(MAX_LOCAL_STYLES);
  });

  it('ignores what the storage holds that is not a style', () => {
    stubStorage({ 'music-motion.styles.video-anim': JSON.stringify([{ nope: 1 }, 'x', null]) });
    expect(service().styles()).toEqual([]);
    TestBed.resetTestingModule();
    stubStorage({ 'music-motion.styles.video-anim': '{ not json' });
    const store = service();
    expect(store.styles()).toEqual([]);
    expect(store.durable()).toBe(false);
  });

  it('keeps working until the page is closed, and says so, when the storage cannot be used', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const store = service();
    expect(store.durable()).toBe(false);
    store.add(input('Only here'), 1);
    expect(store.styles().map((s) => s.name)).toEqual(['Only here']);
    expect(store.durable()).toBe(false);
  });

  it('remembers which piece started from which style, across a reload, and forgets the oldest past 200', () => {
    stubStorage();
    const store = service();
    store.noteStart('piece-1', 'Neon');
    expect(store.startedFrom('piece-1')).toBe('Neon');
    expect(store.startedFrom('piece-2')).toBeUndefined();
    TestBed.resetTestingModule();
    const again = service();
    expect(again.startedFrom('piece-1')).toBe('Neon');
    for (let i = 0; i < 205; i++) again.noteStart(`p${i}`, 'x');
    expect(again.startedFrom('piece-1')).toBeUndefined();
    expect(again.startedFrom('p204')).toBe('x');
    expect(Object.keys(JSON.parse(localStorage.getItem('music-motion.styles.video-anim.started')!))).toHaveLength(200);
  });

  it('keeps that note in memory when the storage cannot be used', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const store = service();
    store.noteStart('piece-1', 'Neon');
    expect(store.startedFrom('piece-1')).toBe('Neon');
    expect(store.durable()).toBe(false);
  });
});
