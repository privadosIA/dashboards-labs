import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LibraryPlaylist, LibraryPlaylistSummary, LibrarySong, LibrarySongsPage, LibrarySongsQuery } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { LibraryStore, VIEW_FAVORITES, VIEW_RATED } from './library.store';

const song = (key: string, over: Partial<LibrarySong> = {}): LibrarySong => {
  const [project, track, seed] = key.split('/');
  return { key, project, track_id: track, variant: 0, seed: +seed, title: track, file: `out/${project}/${track}.mp3`, ...over };
};
const refusal = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { error: { code: 'x', message } } }));

describe('LibraryStore', () => {
  let store: LibraryStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let songs: LibrarySong[];
  let playlists: LibraryPlaylist[];

  /** A tiny server: the songs it holds, filtered and paged the way the contract says, and the playlists. */
  function fakeApi() {
    return {
      listLibrarySongs: vi.fn((q: LibrarySongsQuery): Observable<LibrarySongsPage> => {
        let list = songs.filter((s) => (!q.project || s.project === q.project) && (!q.min_rating || (s.rating ?? 0) >= q.min_rating) && (!q.favorite || s.favorite) && (!q.q || s.title.includes(q.q)));
        if (q.playlist) {
          const keys = playlists.find((p) => p.id === q.playlist)!.songs;
          list = keys.map((k) => list.find((s) => s.key === k)).filter((s): s is LibrarySong => !!s);
        }
        const offset = q.offset ?? 0;
        return of({ items: list.slice(offset, offset + (q.limit ?? list.length)), total: list.length });
      }),
      listPlaylists: vi.fn(() => of(playlists.map((p): LibraryPlaylistSummary => ({ id: p.id, name: p.name, songs: p.songs.length })))),
      getPlaylist: vi.fn((id: string) => of(structuredClone(playlists.find((p) => p.id === id)!))),
      createPlaylist: vi.fn((b: { name: string; songs?: string[] }) => {
        const made = { id: b.name.toLowerCase().replace(/\W+/g, '-'), name: b.name, songs: b.songs ?? [] };
        playlists.push(made);
        return of(structuredClone(made));
      }),
      savePlaylist: vi.fn((id: string, b: { name: string; songs: string[] }) => {
        const p = playlists.find((x) => x.id === id)!;
        Object.assign(p, b);
        return of(structuredClone(p));
      }),
      deletePlaylist: vi.fn((id: string) => {
        playlists = playlists.filter((p) => p.id !== id);
        return of(undefined);
      }),
      rateSong: vi.fn((key: string, stars: number) => of({ ...songs.find((s) => s.key === key)!, ...(stars ? { rating: stars } : {}) })),
      rescanLibrary: vi.fn(() => of({ added: 3, updated: 0, removed: 1 })),
      deleteSong: vi.fn(() => of(undefined)),
    };
  }

  async function open(options: { count?: number; remembered?: number } = {}) {
    songs = Array.from({ length: options.count ?? 25 }, (_, i) => song(`p${i % 3}/t${String(i).padStart(2, '0')}/${i}`));
    playlists = [{ id: 'mix', name: 'Mix', songs: ['p1/t01/1', 'p0/t00/0'] }];
    api = fakeApi();
    TestBed.configureTestingModule({
      providers: [
        LibraryStore,
        { provide: ApiService, useValue: api },
        { provide: ProjectsStore, useValue: { projects: signal([{ id: 'p0', mode: 'music' }, { id: 'v1', mode: 'video' }, { id: 'p1', mode: 'music' }]), load: vi.fn(() => Promise.resolve()) } },
      ],
    });
    sessionStorage.clear();
    if (options.remembered) sessionStorage.setItem('mo-paged-list-sizes', JSON.stringify({ library: options.remembered }));
    store = TestBed.inject(LibraryStore);
    await store.load();
  }
  const lastQuery = () => api['listLibrarySongs'].mock.calls.at(-1)![0] as LibrarySongsQuery;
  const pageReads = () => api['listLibrarySongs'].mock.calls.map((c) => c[0] as LibrarySongsQuery).filter((q) => q.limit !== 1);

  describe('reading a page at a time', () => {
    it('reads the first page with the remembered size and the default order, never the whole library', async () => {
      await open({ count: 135 });
      const reads = pageReads();
      expect(reads).toHaveLength(1);
      expect(reads[0]).toEqual({ limit: 10, offset: 0, sort: '-created_at' });
      expect(store.songs()).toHaveLength(10);
      expect(store.total()).toBe(135);
      expect(store.loaded()).toBe(true);
    });

    it('takes the page size the list remembers', async () => {
      await open({ remembered: 20 });
      expect(store.pageSize()).toBe(20);
      expect(pageReads().at(-1)!.limit).toBe(20);
    });

    it('goes to another page or size when the person asks', async () => {
      await open({ count: 135 });
      store.goTo({ pageIndex: 2, pageSize: 20 });
      expect(lastQuery()).toMatchObject({ limit: 20, offset: 40 });
    });

    it('counts the views apart from the page: all, favourites and rated', async () => {
      songs = [];
      await open();
      songs = Array.from({ length: 12 }, (_, i) => song(`p0/t${i}/${i}`, { favorite: i < 2, ...(i < 5 ? { rating: 4 } : {}) }));
      await store.load();
      expect(store.counts()).toEqual({ all: 12, favorites: 2, rated: 5 });
    });

    it('says the page could not be read and keeps the previous one on screen', async () => {
      await open();
      const before = store.songs();
      api['listLibrarySongs'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      await store.read();
      expect(store.error()).toBe('load');
      expect(store.songs()).toBe(before);
      await store.read();
      expect(store.error()).toBe('');
    });

    it('lists the music projects of the projects store for the selector', async () => {
      await open();
      expect(store.projectNames()).toEqual(['p0', 'p1']);
    });
  });

  describe('filters', () => {
    it('a view, a project and the stars go to the server and back to the first page', async () => {
      await open({ count: 60 });
      store.goTo({ pageIndex: 3, pageSize: 10 });
      store.setView(VIEW_FAVORITES);
      expect(lastQuery()).toEqual({ limit: 10, offset: 0, sort: '-created_at', favorite: true });
      store.setView(VIEW_RATED);
      expect(lastQuery()).toMatchObject({ min_rating: 1 });
      expect(lastQuery().favorite).toBeUndefined();
      store.setMinStars(3);
      expect(lastQuery()).toMatchObject({ min_rating: 3 });
      store.setView('');
      store.setMinStars(0);
      store.setProject('p1');
      expect(lastQuery()).toMatchObject({ project: 'p1', offset: 0 });
      expect(lastQuery().min_rating).toBeUndefined();
    });

    it('sends the generator asked for, goes back to the first page, and sends nothing for any', async () => {
      await open();
      store.goTo({ pageIndex: 1, pageSize: 10 });
      store.setGenerator('heartmula');
      expect(lastQuery()).toMatchObject({ generator: 'heartmula', offset: 0 });
      store.setProject('p1');
      expect(lastQuery()).toMatchObject({ generator: 'heartmula', project: 'p1' });
      store.setGenerator('');
      expect(lastQuery().generator).toBeUndefined();
    });

    it('sends the generator asked for, goes back to the first page, and sends nothing for any', async () => {
      await open();
      store.goTo({ pageIndex: 1, pageSize: 10 });
      store.setGenerator('heartmula');
      expect(lastQuery()).toMatchObject({ generator: 'heartmula', offset: 0 });
      store.setProject('p1');
      expect(lastQuery()).toMatchObject({ generator: 'heartmula', project: 'p1' });
      store.setGenerator('');
      expect(lastQuery().generator).toBeUndefined();
    });

    it('the stars selector and the Rated view send the larger minimum', async () => {
      await open();
      store.setView(VIEW_RATED);
      store.setMinStars(2);
      expect(lastQuery().min_rating).toBe(2);
      store.setMinStars(0);
      expect(lastQuery().min_rating).toBe(1);
    });

    it('the sort goes to the server as the contract names it', async () => {
      await open();
      store.setSort('rating');
      expect(lastQuery().sort).toBe('-rating');
      store.setSort('title');
      expect(lastQuery().sort).toBe('title');
      store.setSort('recent');
      expect(lastQuery().sort).toBe('-created_at');
    });

    it('opening a playlist reads its songs once, for the move buttons', async () => {
      await open();
      store.setView('mix');
      await store.read();
      expect(api['getPlaylist']).toHaveBeenCalledTimes(1);
      expect(store.keysOf('mix')).toEqual(['p1/t01/1', 'p0/t00/0']);
      store.setView('');
      store.setView('mix');
      expect(api['getPlaylist']).toHaveBeenCalledTimes(1);
    });

    it('a playlist asks for its songs and sends no sort, so they come in its order', async () => {
      await open();
      store.setSort('title');
      store.setView('mix');
      await store.read();
      expect(lastQuery()).toMatchObject({ playlist: 'mix', limit: 10, offset: 0 });
      expect(lastQuery().sort).toBeUndefined();
      expect(store.songs().map((s) => s.key)).toEqual(['p1/t01/1', 'p0/t00/0']);
    });

    it('a search waits for the person to stop typing, then asks once from the first page', async () => {
      vi.useFakeTimers();
      try {
        await open({ count: 60 });
        store.goTo({ pageIndex: 2, pageSize: 10 });
        const reads = pageReads().length;
        store.setSearch('t0');
        vi.advanceTimersByTime(200);
        store.setSearch('t05');
        vi.advanceTimersByTime(200);
        expect(pageReads().length).toBe(reads);
        expect(store.search()).toBe('t05');
        vi.advanceTimersByTime(150);
        expect(pageReads().length).toBe(reads + 1);
        expect(lastQuery()).toMatchObject({ q: 't05', offset: 0 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('two quick changes: the answer of the last one is the one shown', async () => {
      await open({ count: 60 });
      const slow = new Subject<LibrarySongsPage>();
      api['listLibrarySongs'].mockReturnValueOnce(slow).mockReturnValueOnce(of({ items: [song('p2/last/9')], total: 1 }));
      store.setProject('p0');
      store.setProject('p2');
      await Promise.resolve();
      expect(store.songs().map((s) => s.key)).toEqual(['p2/last/9']);
      slow.next({ items: [song('p0/stale/1')], total: 40 });
      slow.complete();
      await Promise.resolve();
      expect(store.songs().map((s) => s.key)).toEqual(['p2/last/9']);
      expect(store.total()).toBe(1);
    });

    it('goes back to the last page when the one asked for no longer exists', async () => {
      await open({ count: 25 });
      store.goTo({ pageIndex: 2, pageSize: 10 });
      await Promise.resolve();
      songs = songs.slice(0, 12);
      store.goTo({ pageIndex: 2, pageSize: 10 });
      await new Promise((ok) => setTimeout(ok));
      expect(store.pageIndex()).toBe(1);
      expect(store.songs()).toHaveLength(2);
    });
  });

  describe('stars', () => {
    it('saves one song and draws the stars the server answers', async () => {
      await open();
      const key = store.songs()[0].key;
      await store.rate(key, 4);
      expect(api['rateSong']).toHaveBeenCalledTimes(1);
      expect(api['rateSong']).toHaveBeenCalledWith(key, 4);
      expect(store.stars(key)).toBe(4);
      expect(store.stars(store.songs()[1].key)).toBe(0);
    });

    it('the same stars again take them away', async () => {
      await open();
      const key = store.songs()[0].key;
      await store.rate(key, 4);
      await store.rate(key, 4);
      expect(api['rateSong']).toHaveBeenLastCalledWith(key, 0);
      expect(store.stars(key)).toBe(0);
    });

    it('a rejected rating leaves the stars as they were and says the server\'s reason', async () => {
      await open();
      const key = store.songs()[0].key;
      await store.rate(key, 3);
      api['rateSong'].mockReturnValueOnce(refusal(404, 'song not found'));
      await store.rate(key, 5);
      expect(store.stars(key)).toBe(3);
      expect(store.problem()).toBe('song not found');
    });
  });

  describe('playlists', () => {
    it('lists them with how many songs each has, and reads a playlist\'s songs only when needed', async () => {
      await open();
      expect(store.playlists()).toEqual([{ id: 'mix', name: 'Mix', songs: 2 }]);
      expect(api['getPlaylist']).not.toHaveBeenCalled();
      await store.ensureKeys('mix');
      await store.ensureKeys('mix');
      expect(api['getPlaylist']).toHaveBeenCalledTimes(1);
      expect(store.keysOf('mix')).toEqual(['p1/t01/1', 'p0/t00/0']);
    });

    it('reads every playlist for the menu «Add to a playlist»', async () => {
      await open();
      playlists.push({ id: 'two', name: 'Two', songs: ['p2/t02/2'] });
      await store.load();
      await store.ensureAllKeys();
      expect(store.inPlaylist('two', 'p2/t02/2')).toBe(true);
      expect(store.inPlaylist('mix', 'p2/t02/2')).toBe(false);
    });

    it('adds a song to one playlist only, at the end, and shows it in', async () => {
      await open();
      playlists.push({ id: 'other', name: 'Other', songs: [] });
      await store.load();
      expect(await store.togglePlaylistSong('mix', 'p2/t02/2')).toBe(true);
      expect(api['savePlaylist']).toHaveBeenCalledTimes(1);
      expect(api['savePlaylist']).toHaveBeenCalledWith('mix', { name: 'Mix', songs: ['p1/t01/1', 'p0/t00/0', 'p2/t02/2'] });
      expect(store.inPlaylist('mix', 'p2/t02/2')).toBe(true);
      expect(store.playlists().find((p) => p.id === 'mix')!.songs).toBe(3);
      expect(store.playlists().find((p) => p.id === 'other')!.songs).toBe(0);
    });

    it('takes a song out when it is already in', async () => {
      await open();
      await store.togglePlaylistSong('mix', 'p0/t00/0');
      expect(api['savePlaylist']).toHaveBeenCalledWith('mix', { name: 'Mix', songs: ['p1/t01/1'] });
    });

    it('makes a playlist, with a first song when it starts from a song\'s menu', async () => {
      await open();
      const id = await store.createPlaylist('  Night drive  ', 'p0/t00/0');
      expect(api['createPlaylist']).toHaveBeenCalledWith({ name: 'Night drive', songs: ['p0/t00/0'] });
      expect(id).toBe('night-drive');
      expect(store.playlists().map((p) => p.id)).toContain('night-drive');
      expect(store.inPlaylist('night-drive', 'p0/t00/0')).toBe(true);
    });

    it('asks nothing for an empty name, and says a name the server refuses (409) leaving the list as it was', async () => {
      await open();
      expect(await store.createPlaylist('   ')).toBe('');
      expect(api['createPlaylist']).not.toHaveBeenCalled();
      api['createPlaylist'].mockReturnValueOnce(refusal(409, 'playlist "mix" already exists'));
      expect(await store.createPlaylist('Mix')).toBe('');
      expect(store.problem()).toBe('playlist "mix" already exists');
      expect(store.playlists()).toHaveLength(1);
    });

    it('meets the limits before asking: 200 playlists, 2000 songs, 80 characters', async () => {
      await open();
      store.playlists.set(Array.from({ length: 200 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, songs: 0 })));
      expect(await store.createPlaylist('One more')).toBe('');
      expect(api['createPlaylist']).not.toHaveBeenCalled();
      store.playlists.set([{ id: 'big', name: 'Big', songs: 2000 }]);
      playlists = [{ id: 'big', name: 'Big', songs: Array.from({ length: 2000 }, (_, i) => `a/b/${i}`) }];
      expect(await store.togglePlaylistSong('big', 'p0/t00/0')).toBe(false);
      expect(api['savePlaylist']).not.toHaveBeenCalled();
      store.playlists.set([]);
      await store.createPlaylist('x'.repeat(100));
      expect(api['createPlaylist'].mock.calls.at(-1)![0].name).toHaveLength(80);
    });

    it('renames a playlist keeping its songs, and moves a song one place', async () => {
      await open();
      expect(await store.renamePlaylist('mix', 'Mixed')).toBe(true);
      expect(api['savePlaylist']).toHaveBeenLastCalledWith('mix', { name: 'Mixed', songs: ['p1/t01/1', 'p0/t00/0'] });
      expect(store.canMove('mix', 'p1/t01/1', -1)).toBe(false);
      expect(store.canMove('mix', 'p1/t01/1', 1)).toBe(true);
      expect(await store.moveInPlaylist('mix', 'p1/t01/1', 1)).toBe(true);
      expect(api['savePlaylist']).toHaveBeenLastCalledWith('mix', { name: 'Mixed', songs: ['p0/t00/0', 'p1/t01/1'] });
      expect(await store.moveInPlaylist('mix', 'p1/t01/1', 1)).toBe(false);
    });

    it('deleting the open playlist goes back to all the songs, and the songs stay', async () => {
      await open();
      store.setView('mix');
      expect(await store.deletePlaylist('mix')).toBe(true);
      expect(store.view()).toBe('');
      expect(store.playlists()).toEqual([]);
      expect(lastQuery().playlist).toBeUndefined();
      expect(api['deleteSong']).not.toHaveBeenCalled();
    });

    it('a playlist that is gone from the server stops being the view when the library is read again', async () => {
      await open();
      store.setView('mix');
      playlists = [];
      await store.load();
      expect(store.view()).toBe('');
    });
  });

  describe('rescan', () => {
    it('answers what it found, reads the page again, and is not offered twice at once', async () => {
      await open();
      const before = pageReads().length;
      const first = store.rescan();
      expect(store.rescanning()).toBe(true);
      expect(await store.rescan()).toBeNull();
      expect(await first).toEqual({ added: 3, updated: 0, removed: 1 });
      expect(api['rescanLibrary']).toHaveBeenCalledTimes(1);
      expect(pageReads().length).toBeGreaterThan(before);
      expect(store.rescanning()).toBe(false);
    });

    it('says why a rescan failed', async () => {
      await open();
      api['rescanLibrary'].mockReturnValueOnce(refusal(500, 'ffmpeg is missing'));
      expect(await store.rescan()).toBeNull();
      expect(store.problem()).toBe('ffmpeg is missing');
      expect(store.rescanning()).toBe(false);
    });
  });

  describe('play all', () => {
    it('reads the matching songs in blocks of 500 with the order and filters of the view', async () => {
      await open({ count: 135 });
      store.setProject('p1');
      store.setSort('title');
      const block = await store.readMatching(0);
      expect(lastQuery()).toMatchObject({ project: 'p1', sort: 'title', limit: 500, offset: 0 });
      expect(block.total).toBe(45);
      expect(block.items).toHaveLength(45);
    });

    it('a playlist is read in its own order', async () => {
      await open();
      store.setView('mix');
      const block = await store.readMatching(0);
      expect(block.items.map((s) => s.key)).toEqual(['p1/t01/1', 'p0/t00/0']);
      expect(lastQuery().sort).toBeUndefined();
    });
  });

  it('deletes a song and reads the page, the counts and the playlists again', async () => {
    await open();
    const reads = api['listLibrarySongs'].mock.calls.length;
    expect(await store.deleteSong(store.songs()[0])).toBe(true);
    expect(api['deleteSong']).toHaveBeenCalledOnce();
    expect(api['listLibrarySongs'].mock.calls.length).toBeGreaterThan(reads);
  });
});
