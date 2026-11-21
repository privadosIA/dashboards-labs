import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { LibraryPlaylist, LibrarySong, LibrarySongsPage, LibrarySongsQuery } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { LibraryPageComponent } from './library-page.component';

const song = (key: string, over: Partial<LibrarySong> = {}): LibrarySong => {
  const [project, track] = key.split('/');
  return { key, project, track_id: track, variant: 0, seed: 1, title: track, file: `out/${project}/${track}.mp3`, ...over };
};
const refusal = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { error: { code: 'x', message } } }));

const THREE = (): LibrarySong[] => [
  song('rock/anthem/1', { title: 'Himno', caption: 'rock guitar', audio_seconds: 125, generator: 'heartmula' }),
  song('rock/ballad/2', { title: 'Balada', favorite: true, rating: 4, cover: 'out/rock/ballad.png' }),
  song('lofi/rain/3', { title: 'Lluvia' }),
];
const many = (n: number): LibrarySong[] => Array.from({ length: n }, (_, i) => song(`big/t${i}/${i}`, { title: `Canción ${String(i + 1).padStart(2, '0')}` }));

describe('LibraryPageComponent', () => {
  let fixture: ComponentFixture<LibraryPageComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let songs: LibrarySong[];
  let playlists: LibraryPlaylist[];
  let confirm = true;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el().querySelector(sel) as T;
  const qa = (sel: string) => Array.from(el().querySelectorAll<HTMLElement>(sel));
  const overlay = (sel: string) => document.querySelector<HTMLElement>(sel);
  /** The store chains several promises (playlists, projects, page, counts): let them all run before looking at the page. */
  const settle = async () => {
    if (!vi.isFakeTimers()) await fixture.whenStable();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const click = async (sel: string) => {
    q(sel).click();
    await settle();
  };
  const titles = () => qa('.song__title').map((n) => n.textContent?.trim());
  const reads = () => api['listLibrarySongs'].mock.calls.map((c) => c[0] as LibrarySongsQuery);
  const pageReads = () => reads().filter((r) => r.limit !== 1 && r.limit !== 500);
  const lastRead = () => pageReads().at(-1)!;

  /** A server that holds `songs` and `playlists` and answers as the contract says. */
  function fakeApi() {
    return {
      listLibrarySongs: vi.fn((qy: LibrarySongsQuery): Observable<LibrarySongsPage> => {
        let list = songs.filter((s) => (!qy.project || s.project === qy.project) && (!qy.generator || (s.generator ?? 'ace-step') === qy.generator) && (!qy.min_rating || (s.rating ?? 0) >= qy.min_rating) && (!qy.favorite || s.favorite) && (!qy.q || `${s.title} ${s.project} ${s.caption ?? ''}`.toLowerCase().includes(qy.q.toLowerCase())));
        if (qy.playlist) list = playlists.find((p) => p.id === qy.playlist)!.songs.map((k) => list.find((s) => s.key === k)).filter((s): s is LibrarySong => !!s);
        const offset = qy.offset ?? 0;
        return of({ items: list.slice(offset, offset + (qy.limit ?? list.length)), total: list.length });
      }),
      listPlaylists: vi.fn(() => of(playlists.map((p) => ({ id: p.id, name: p.name, songs: p.songs.length })))),
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
      artifactUrl: vi.fn((project: string, rel: string) => `/api/projects/${project}/artifacts/${rel}`),
    };
  }

  async function open(list: LibrarySong[] = THREE()) {
    songs = list;
    api = fakeApi();
    sessionStorage.clear();
    fixture = TestBed.createComponent(LibraryPageComponent);
    fixture.detectChanges();
    await settle();
    await settle();
  }

  beforeEach(async () => {
    confirm = true;
    playlists = [{ id: 'night', name: 'Noche', songs: ['lofi/rain/3', 'rock/anthem/1'] }];
    await TestBed.configureTestingModule({
      imports: [LibraryPageComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useFactory: () => api },
        { provide: ProjectsStore, useValue: { projects: signal([{ id: 'rock', mode: 'music' }, { id: 'lofi', mode: 'music' }]), load: () => Promise.resolve() } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirm) }) } },
      ],
    }).compileComponents();
  });

  describe('reading and paging', () => {
    it('reads one page of 10, never every song, and shows the total of the server', async () => {
      await open(many(37));
      expect(pageReads()).toHaveLength(1);
      expect(lastRead()).toMatchObject({ limit: 10, offset: 0 });
      expect(titles()).toHaveLength(10);
      expect(titles()[0]).toBe('Canción 01');
      expect(q('[data-testid="total"]').textContent).toContain('37');
      const paginator = fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
      expect(paginator.pageSizeOptions).toEqual([5, 10, 20, 100]);
      expect(paginator.length).toBe(37);
    });

    it('asks the server for the page and the size the person chooses', async () => {
      await open(many(37));
      const paginator = fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
      paginator.page.emit({ pageIndex: 7, pageSize: 5, length: 37, previousPageIndex: 0 });
      await settle();
      expect(lastRead()).toMatchObject({ limit: 5, offset: 35 });
      expect(titles()).toEqual(['Canción 36', 'Canción 37']);
      paginator.page.emit({ pageIndex: 0, pageSize: 100, length: 37, previousPageIndex: 7 });
      await settle();
      expect(titles()).toHaveLength(37);
    });

    it('lists the songs with their stars, the favorite mark, their generator and the counts of the views', async () => {
      await open();
      expect(titles()).toEqual(['Himno', 'Balada', 'Lluvia']);
      expect(q('[data-testid="view-all"]').textContent).toContain('3');
      expect(q('[data-testid="view-favorites"]').textContent).toContain('1');
      expect(q('[data-testid="view-rated"]').textContent).toContain('1');
      expect(q('[data-testid="view-night"]').textContent).toContain('Noche');
      expect(q('[data-testid="view-night"]').textContent).toContain('2');
      const ballad = q('[data-testid="song-rock/ballad/2"]');
      expect(ballad.querySelectorAll('.stars__star--on').length).toBe(4);
      expect(ballad.querySelector('.song__fav')).not.toBeNull();
      expect(ballad.querySelector('img.song__cover')?.getAttribute('src')).toContain('/api/projects/rock/artifacts/out/rock/ballad.png');
      expect(q('[data-testid="song-rock/anthem/1"]').textContent).toContain('2:05');
      expect(q('[data-testid="song-rock/anthem/1"]').textContent).toContain('HeartMuLa');
      expect(q('[data-testid="song-lofi/rain/3"]').textContent).toContain('ACE-Step');
    });

    it('has a generator selector, and no origin scope: the contract cannot filter by it', async () => {
      await open();
      expect(q('[data-testid="generator"]')).not.toBeNull();
      expect(el().querySelector('app-mode-select')).toBeNull();
    });

    it('asks the server for the songs of the generator chosen, with the total it answers', async () => {
      await open();
      fixture.componentInstance['store'].setGenerator('heartmula');
      await settle();
      expect(lastRead().generator).toBe('heartmula');
      expect(lastRead().offset).toBe(0);
      fixture.componentInstance['store'].setGenerator('');
      await settle();
      expect(lastRead().generator).toBeUndefined();
    });

    it('offers the music projects in the selector and sends the one chosen', async () => {
      await open();
      q('[data-testid="project"]').dispatchEvent(new Event('click'));
      fixture.componentInstance['store'].setProject('rock');
      await settle();
      expect(lastRead().project).toBe('rock');
      expect(titles()).toEqual(['Himno', 'Balada']);
    });

    it('says so when the library has no songs', async () => {
      await open([]);
      expect(q('mo-empty-state')).not.toBeNull();
      expect(q('.library')).toBeNull();
    });

    it('says the songs could not be read and tries again', async () => {
      songs = THREE();
      api = fakeApi();
      api['listLibrarySongs'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
        fixture = TestBed.createComponent(LibraryPageComponent);
      fixture.detectChanges();
      await settle();
      await settle();
      expect(q('[data-testid="library-error"]')).not.toBeNull();
      await click('[data-testid="library-retry"]');
      expect(q('[data-testid="library-error"]')).toBeNull();
      expect(titles()).toHaveLength(3);
    });
  });

  describe('searching and filtering', () => {
    it('searches after a pause, from the first page, and says when nothing matches', async () => {
      vi.useFakeTimers();
      try {
        await open();
        const reads0 = pageReads().length;
        const input = q<HTMLInputElement>('[data-testid="search"]');
        input.value = 'rock';
        input.dispatchEvent(new Event('input'));
        vi.advanceTimersByTime(100);
        expect(pageReads().length).toBe(reads0);
        vi.advanceTimersByTime(250);
        await settle();
        expect(lastRead()).toMatchObject({ q: 'rock', offset: 0 });
        input.value = 'zzz';
        input.dispatchEvent(new Event('input'));
        vi.advanceTimersByTime(400);
        await settle();
        expect(q('[data-testid="no-results"]')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a view that is a filter goes to the server', async () => {
      await open();
      await click('[data-testid="view-favorites"]');
      expect(lastRead()).toMatchObject({ favorite: true });
      expect(titles()).toEqual(['Balada']);
      await click('[data-testid="view-rated"]');
      expect(lastRead()).toMatchObject({ min_rating: 1 });
    });
  });

  describe('stars', () => {
    it('a click on a star saves that song only; the same star again clears it', async () => {
      await open();
      await click('[data-testid="song-lofi/rain/3"] [data-testid="star-3"]');
      expect(api['rateSong']).toHaveBeenCalledTimes(1);
      expect(api['rateSong']).toHaveBeenCalledWith('lofi/rain/3', 3);
      expect(q('[data-testid="song-lofi/rain/3"]').querySelectorAll('.stars__star--on').length).toBe(3);
      await click('[data-testid="song-lofi/rain/3"] [data-testid="star-3"]');
      expect(api['rateSong']).toHaveBeenLastCalledWith('lofi/rain/3', 0);
      expect(q('[data-testid="song-lofi/rain/3"]').querySelectorAll('.stars__star--on').length).toBe(0);
    });

    it('a rejected rating keeps the stars and offers to read the list again', async () => {
      await open();
      api['rateSong'].mockReturnValueOnce(refusal(404, 'song not found'));
      await click('[data-testid="song-rock/ballad/2"] [data-testid="star-5"]');
      expect(q('[data-testid="song-rock/ballad/2"]').querySelectorAll('.stars__star--on').length).toBe(4);
      expect(q('[data-testid="library-problem"]').textContent).toContain('song not found');
      const before = reads().length;
      await click('[data-testid="library-problem-reload"]');
      expect(reads().length).toBeGreaterThan(before);
    });
  });

  describe('playlists', () => {
    it('a new playlist is created from the name and opens', async () => {
      await open();
      await click('[data-testid="new-list"]');
      const input = q<HTMLInputElement>('[data-testid="new-list-name"]');
      input.value = 'Para correr';
      input.dispatchEvent(new Event('input'));
      await settle();
      await click('[data-testid="new-list-create"]');
      expect(api['createPlaylist']).toHaveBeenCalledWith({ name: 'Para correr', songs: [] });
      expect(q('[data-testid="view-para-correr"]')).not.toBeNull();
      expect(lastRead()).toMatchObject({ playlist: 'para-correr' });
    });

    it('a name the server refuses is explained and the form stays open to change it', async () => {
      await open();
      await click('[data-testid="new-list"]');
      api['createPlaylist'].mockReturnValueOnce(refusal(409, 'playlist "noche" already exists'));
      const input = q<HTMLInputElement>('[data-testid="new-list-name"]');
      input.value = 'Noche';
      input.dispatchEvent(new Event('input'));
      await settle();
      await click('[data-testid="new-list-create"]');
      expect(q('[data-testid="library-problem"]').textContent).toContain('already exists');
      expect(q('[data-testid="new-list-form"]')).not.toBeNull();
    });

    it('inside a playlist the songs come in its order, with no sort selector, and move up and down', async () => {
      await open();
      await click('[data-testid="view-night"]');
      expect(lastRead().sort).toBeUndefined();
      expect(q('[data-testid="sort"]')).toBeNull();
      expect(q('[data-testid="playlist-order"]')).not.toBeNull();
      expect(titles()).toEqual(['Lluvia', 'Himno']);
      expect((q('[data-testid="song-lofi/rain/3"] [data-testid="move-up"]') as HTMLButtonElement).disabled).toBe(true);
      await click('[data-testid="song-lofi/rain/3"] [data-testid="move-down"]');
      expect(api['savePlaylist']).toHaveBeenCalledWith('night', { name: 'Noche', songs: ['rock/anthem/1', 'lofi/rain/3'] });
      expect(titles()).toEqual(['Himno', 'Lluvia']);
    });

    it('moving a song uses its place in the whole playlist, not in the page', async () => {
      playlists = [{ id: 'long', name: 'Larga', songs: many(37).map((s) => s.key) }];
      await open(many(37));
      await click('[data-testid="view-long"]');
      const ups = qa('[data-testid="move-up"]') as HTMLButtonElement[];
      expect(ups[0].disabled).toBe(true);
      expect(ups[1].disabled).toBe(false);
    });

    it('the menu «Add to a playlist» says which hold the song, and a click changes that playlist only', async () => {
      await open();
      await click('[data-testid="song-rock/ballad/2"] [data-testid="add-to-list"]');
      await settle();
      expect(api['getPlaylist']).toHaveBeenCalledWith('night');
      overlay('[data-testid="menu-list-night"]')!.click();
      await settle();
      expect(api['savePlaylist']).toHaveBeenCalledTimes(1);
      expect(api['savePlaylist']).toHaveBeenCalledWith('night', { name: 'Noche', songs: ['lofi/rain/3', 'rock/anthem/1', 'rock/ballad/2'] });
    });

    it('deletes the open playlist after confirming and goes back to all the songs, or keeps it when declined', async () => {
      await open();
      confirm = false;
      await click('[data-testid="view-night"]');
      await click('[data-testid="delete-list"]');
      expect(api['deletePlaylist']).not.toHaveBeenCalled();
      expect(q('[data-testid="view-night"]')).not.toBeNull();
      confirm = true;
      await click('[data-testid="delete-list"]');
      expect(api['deletePlaylist']).toHaveBeenCalledWith('night');
      expect(q('[data-testid="view-night"]')).toBeNull();
      expect(titles()).toHaveLength(3);
    });
  });

  describe('rescan', () => {
    it('rescans, says what it found and reads the page again; the button waits while it works', async () => {
      await open();
      const before = reads().length;
      await click('[data-testid="library-rescan"]');
      expect(api['rescanLibrary']).toHaveBeenCalledTimes(1);
      expect(reads().length).toBeGreaterThan(before);
      const text = document.querySelector('simple-snack-bar')?.textContent ?? '';
      expect(text).toContain('3');
      expect(text).toContain('1');
      expect((q('[data-testid="library-rescan"]') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('play all', () => {
    it('queues every song that matches, not only the page, reading blocks of 500', async () => {
      await open(many(37));
      await click('[data-testid="play-all"]');
      expect(reads().some((r) => r.limit === 500 && r.offset === 0)).toBe(true);
      expect(q('[data-testid="now-playing"]').textContent).toContain('1/37');
    });

    it('goes through the list: next, previous, and ends when the list does', async () => {
      await open();
      expect(q('[data-testid="now-playing"]')).toBeNull();
      await click('[data-testid="play-all"]');
      const now = () => q('[data-testid="now-playing"]')?.textContent ?? '';
      expect(now()).toContain('Himno');
      expect(now()).toContain('1/3');
      await click('[data-testid="next"]');
      expect(now()).toContain('Balada');
      await click('[data-testid="previous"]');
      expect(now()).toContain('Himno');
      await click('[data-testid="next"]');
      await click('[data-testid="next"]');
      expect(now()).toContain('Lluvia');
      await click('[data-testid="next"]');
      expect(q('[data-testid="now-playing"]')).toBeNull();
    });

    it('plays from the chosen song and only what the filters leave', async () => {
      vi.useFakeTimers();
      try {
        await open();
        const input = q<HTMLInputElement>('[data-testid="search"]');
        input.value = 'rock';
        input.dispatchEvent(new Event('input'));
        vi.advanceTimersByTime(400);
        await settle();
      } finally {
        vi.useRealTimers();
      }
      await click('[data-testid="song-rock/ballad/2"] [data-testid="play-from"]');
      expect(q('[data-testid="now-playing"]').textContent).toContain('Balada');
      expect(q('[data-testid="now-playing"]').textContent).toContain('2/2');
    });

    it('starts the queue at the song asked for even when it is past the first block', async () => {
      await open(many(37));
      const calls = api['listLibrarySongs'];
      // a block of 500 would hold them all; the queue still starts at the asked song
      await click('[data-testid="song-big/t3/3"] [data-testid="play-from"]');
      expect(q('[data-testid="now-playing"]').textContent).toContain('4/37');
      expect(calls).toHaveBeenCalled();
    });

    it('a playlist is queued in its order', async () => {
      await open();
      await click('[data-testid="view-night"]');
      await click('[data-testid="play-all"]');
      expect(q('[data-testid="now-playing"]').textContent).toContain('Lluvia');
    });
  });

  describe('songs', () => {
    it('marks a song whose file cannot be loaded and skips it', async () => {
      await open();
      q('[data-testid="song-rock/anthem/1"] audio').dispatchEvent(new Event('error'));
      await settle();
      expect(q('[data-testid="song-rock/anthem/1"] [data-testid="song-missing"]')).not.toBeNull();
      await click('[data-testid="play-all"]');
      expect(q('[data-testid="now-playing"]').textContent).toContain('Balada');
    });

    it('deletes a song after confirming and reads the page again', async () => {
      await open();
      const before = pageReads().length;
      await click('[data-testid="song-lofi/rain/3"] [data-testid="delete-song"]');
      expect(api['deleteSong']).toHaveBeenCalledWith('lofi', 'rain', 0);
      expect(pageReads().length).toBeGreaterThan(before);
    });
  });
});
