import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { PageSizeStore } from '@lab/paged-list';
import { firstValueFrom } from 'rxjs';

import { LibraryPlaylistSummary, LibrarySong, LibrarySongsPage, LibrarySongsQuery, RescanResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';

/** How the list is ordered. */
export type LibrarySort = 'recent' | 'rating' | 'title';

/** The special views of the list next to the playlists. */
export const VIEW_ALL = '';
export const VIEW_FAVORITES = '*favorites';
export const VIEW_RATED = '*rated';

/** The id of the list in `@lab/paged-list`, which remembers the page size the person chose. */
export const LIBRARY_LIST_ID = 'library';
/** What a read of every matching song asks for at a time. */
export const QUEUE_PAGE = 500;

/** The limits the server states for the playlists. */
const MAX_PLAYLISTS = 200;
const MAX_SONGS = 2000;
const MAX_NAME = 80;
/** How long a typed search waits after the last key before asking. */
const SEARCH_WAIT_MS = 300;

const SORT_PARAM: Record<LibrarySort, string> = { recent: '-created_at', rating: '-rating', title: 'title' };

/**
 * The song library, read a page at a time from the server: the page, the total, the playlists and the counts of the views. A
 * filter, the search or the sort asks the server again from the first page; the stars and each playlist are saved on their own.
 */
@Injectable()
export class LibraryStore {
  private readonly api = inject(ApiService);
  private readonly projectsStore = inject(ProjectsStore);
  private readonly sizes = inject(PageSizeStore);

  /** The songs of the page on screen. */
  readonly songs = signal<LibrarySong[]>([]);
  /** How many songs match in all (the server's `X-Total-Count`). */
  readonly total = signal(0);
  readonly playlists = signal<LibraryPlaylistSummary[]>([]);
  /** How many songs each special view holds, whatever the other filters say. */
  readonly counts = signal({ all: 0, favorites: 0, rated: 0 });
  readonly loading = signal(false);
  readonly loaded = signal(false);
  /** The page could not be read. */
  readonly error = signal('');
  /** What the server refused, in its words (a star, a playlist); empty when nothing is. */
  readonly problem = signal('');
  readonly rescanning = signal(false);

  // the page asked for
  readonly pageIndex = signal(0);
  readonly pageSize = signal(this.sizes.get(LIBRARY_LIST_ID, 10));

  // the filters
  /** What is in the search box (the read waits for the person to stop typing). */
  readonly search = signal('');
  readonly project = signal('');
  /** The generator that made the songs asked for (`''`: any). */
  readonly generator = signal('');
  readonly minStars = signal(0);
  readonly view = signal(VIEW_ALL);
  readonly sort = signal<LibrarySort>('recent');

  /** The music projects, for the project selector (the page no longer holds every song to learn them from). */
  readonly projectNames = computed(() =>
    this.projectsStore
      .projects()
      .filter((p) => p.mode === 'music')
      .map((p) => p.id)
      .sort((a, b) => a.localeCompare(b)),
  );
  readonly activePlaylist = computed(() => this.playlists().find((p) => p.id === this.view()) ?? null);

  /** The keys of the playlists read so far, in play order. A playlist is read when it is needed. */
  private readonly keys = signal<Record<string, string[]>>({});

  private seq = 0;
  private applied = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** What the server is asked, without a page: the filters of the view. */
  private filters(): LibrarySongsQuery {
    const view = this.view();
    const playlist = this.activePlaylist();
    const min = Math.max(view === VIEW_RATED ? 1 : 0, this.minStars());
    return {
      ...(this.applied ? { q: this.applied } : {}),
      ...(this.project() ? { project: this.project() } : {}),
      ...(this.generator() ? { generator: this.generator() } : {}),
      ...(min > 0 ? { min_rating: min } : {}),
      ...(view === VIEW_FAVORITES ? { favorite: true } : {}),
      ...(playlist ? { playlist: playlist.id } : {}),
    };
  }

  /** The query of the page on screen. A playlist sends no `sort`, so its songs come in its own order. */
  private query(): LibrarySongsQuery {
    return {
      ...this.filters(),
      limit: this.pageSize(),
      offset: this.pageIndex() * this.pageSize(),
      ...(this.activePlaylist() ? {} : { sort: SORT_PARAM[this.sort()] }),
    };
  }

  /** Reads everything the page shows: its page, the playlists, the counts of the views and the projects. */
  async load(): Promise<void> {
    await Promise.all([this.loadPlaylists(), this.projectsStore.load().catch(() => undefined)]);
    // a playlist that is gone cannot stay the view
    if (this.view() && !this.view().startsWith('*') && !this.activePlaylist()) this.view.set(VIEW_ALL);
    await Promise.all([this.read(), this.loadCounts()]);
  }

  /** Reads the page asked for. Only the last read counts, and the previous page stays on screen while it runs. */
  async read(): Promise<void> {
    const mine = ++this.seq;
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await firstValueFrom(this.api.listLibrarySongs(this.query()));
      if (mine !== this.seq) return;
      this.songs.set(page.items);
      this.total.set(page.total);
      // a page that no longer exists (songs were removed) goes back to the last one
      const last = Math.max(0, Math.ceil(page.total / this.pageSize()) - 1);
      if (this.pageIndex() > last) {
        this.pageIndex.set(last);
        void this.read();
        return;
      }
    } catch {
      if (mine !== this.seq) return;
      this.error.set('load');
    } finally {
      if (mine === this.seq) {
        this.loading.set(false);
        this.loaded.set(true);
      }
    }
  }

  private async loadCounts(): Promise<void> {
    const total = async (q: LibrarySongsQuery) => (await firstValueFrom(this.api.listLibrarySongs({ ...q, limit: 1 }))).total;
    try {
      const [all, favorites, rated] = await Promise.all([total({}), total({ favorite: true }), total({ min_rating: 1 })]);
      this.counts.set({ all, favorites, rated });
    } catch {
      // the counts are a convenience: the page itself says if it cannot be read
    }
  }

  private async loadPlaylists(): Promise<void> {
    try {
      this.playlists.set(await firstValueFrom(this.api.listPlaylists()));
    } catch {
      this.problem.set($localize`:@@library.playlistsFailed:The playlists could not be read.`);
    }
  }

  // --- the filters: each one goes back to the first page and asks again ---------------------------
  /** The search follows what is typed, but the server is asked once the person stops. */
  setSearch(text: string): void {
    this.search.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.applied = text.trim();
      this.restart();
    }, SEARCH_WAIT_MS);
  }
  setProject(project: string): void {
    this.project.set(project);
    this.restart();
  }
  setGenerator(generator: string): void {
    this.generator.set(generator);
    this.restart();
  }
  setMinStars(stars: number): void {
    this.minStars.set(stars);
    this.restart();
  }
  setSort(sort: LibrarySort): void {
    this.sort.set(sort);
    this.restart();
  }
  setView(view: string): void {
    this.view.set(view);
    // opening a playlist reads its songs (their order is what the move buttons need)
    if (view && !view.startsWith('*')) void this.ensureKeys(view);
    this.restart();
  }
  /** The person asked for another page or size. */
  goTo(e: { pageIndex: number; pageSize: number }): void {
    this.pageSize.set(e.pageSize);
    this.pageIndex.set(e.pageIndex);
    void this.read();
  }
  private restart(): void {
    this.pageIndex.set(0);
    void this.read();
  }

  /** The next block of the songs that match the filters and the order of the view (not the page on screen), for the "play all" queue. */
  readMatching(offset: number): Promise<LibrarySongsPage> {
    return firstValueFrom(this.api.listLibrarySongs({ ...this.query(), limit: QUEUE_PAGE, offset }));
  }

  // --- songs -----------------------------------------------------------------------------------------
  /** Deletes the song's audio from its project, then reads the page again. */
  async deleteSong(s: LibrarySong): Promise<boolean> {
    try {
      await firstValueFrom(this.api.deleteSong(s.project, s.track_id, s.variant));
    } catch {
      return false; // the error toast already told the user
    } finally {
      await Promise.all([this.read(), this.loadCounts(), this.loadPlaylists()]);
    }
    return true;
  }

  stars(key: string): number {
    return this.songs().find((s) => s.key === key)?.rating ?? 0;
  }

  /** Gives a song n stars; the same number again takes them away. Only that song is sent, and the stars drawn are the ones the server answers. */
  async rate(key: string, n: number): Promise<void> {
    const before = this.songs();
    const stars = this.stars(key) === n || n < 1 ? 0 : Math.min(5, n);
    this.problem.set('');
    this.songs.update((l) => l.map((s) => (s.key === key ? withRating(s, stars) : s)));
    try {
      const answer = await firstValueFrom(this.api.rateSong(key, stars));
      this.songs.update((l) => l.map((s) => (s.key === key ? withRating(s, answer.rating ?? 0) : s)));
      void this.loadCounts();
    } catch (e) {
      this.songs.set(before);
      this.problem.set(reasonOf(e, $localize`:@@library.rateFailed:The stars could not be saved.`));
    }
  }

  // --- rescan ----------------------------------------------------------------------------------------
  /** Reads the projects again for audio put or removed by hand, then the page. Not twice at once. */
  async rescan(): Promise<RescanResult | null> {
    if (this.rescanning()) return null;
    this.rescanning.set(true);
    this.problem.set('');
    try {
      const result = await firstValueFrom(this.api.rescanLibrary());
      await this.load();
      return result;
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@library.rescanFailed:The library could not be rescanned.`));
      return null;
    } finally {
      this.rescanning.set(false);
    }
  }

  // --- playlists: one at a time, read when they are needed -----------------------------------------
  /** The keys of a playlist, in order, once it has been read. */
  keysOf(id: string): string[] | undefined {
    return this.keys()[id];
  }

  inPlaylist(id: string, key: string): boolean {
    return this.keys()[id]?.includes(key) ?? false;
  }

  /** Reads a playlist's songs unless they are already known. */
  async ensureKeys(id: string): Promise<string[] | null> {
    const known = this.keys()[id];
    if (known) return known;
    try {
      const playlist = await firstValueFrom(this.api.getPlaylist(id));
      this.keys.update((k) => ({ ...k, [id]: playlist.songs }));
      return playlist.songs;
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@library.playlistFailed:The playlist could not be read.`));
      return null;
    }
  }

  /** Reads every playlist that is not known yet (the menu «Add to a playlist» needs to say which hold the song). */
  async ensureAllKeys(): Promise<void> {
    await Promise.all(this.playlists().map((p) => this.ensureKeys(p.id)));
  }

  /** Makes a playlist (optionally with a first song) and answers its id; '' when the name is empty, a limit is met or the server refuses. */
  async createPlaylist(name: string, firstSong?: string): Promise<string> {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) return '';
    if (this.playlists().length >= MAX_PLAYLISTS) {
      this.problem.set($localize`:@@library.tooManyLists:There can be up to ${MAX_PLAYLISTS}:max: playlists.`);
      return '';
    }
    this.problem.set('');
    try {
      const made = await firstValueFrom(this.api.createPlaylist({ name: clean, songs: firstSong ? [firstSong] : [] }));
      this.keys.update((k) => ({ ...k, [made.id]: made.songs }));
      await this.loadPlaylists();
      return made.id;
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@library.createListFailed:The playlist could not be created.`));
      return '';
    }
  }

  async renamePlaylist(id: string, name: string): Promise<boolean> {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) return false;
    const songs = await this.ensureKeys(id);
    return songs ? this.save(id, clean, songs) : false;
  }

  /** Puts the song in the playlist, or takes it out when it is already there. */
  async togglePlaylistSong(id: string, key: string): Promise<boolean> {
    const songs = await this.ensureKeys(id);
    const name = this.playlists().find((p) => p.id === id)?.name;
    if (!songs || name === undefined) return false;
    if (!songs.includes(key) && songs.length >= MAX_SONGS) {
      this.problem.set($localize`:@@library.tooManySongs:A playlist can hold up to ${MAX_SONGS}:max: songs.`);
      return false;
    }
    return this.save(id, name, songs.includes(key) ? songs.filter((k) => k !== key) : [...songs, key]);
  }

  /** Whether the song can move one place up (-1) or down (+1) in the playlist. */
  canMove(id: string, key: string, delta: -1 | 1): boolean {
    const songs = this.keys()[id];
    const at = songs?.indexOf(key) ?? -1;
    return !!songs && at >= 0 && at + delta >= 0 && at + delta < songs.length;
  }

  /** Moves a song of the playlist one place up (-1) or down (+1); at the end of the list nothing happens. */
  async moveInPlaylist(id: string, key: string, delta: -1 | 1): Promise<boolean> {
    const songs = await this.ensureKeys(id);
    const name = this.playlists().find((p) => p.id === id)?.name;
    if (!songs || name === undefined || !this.canMove(id, key, delta)) return false;
    const at = songs.indexOf(key);
    const next = [...songs];
    [next[at], next[at + delta]] = [next[at + delta], next[at]];
    const ok = await this.save(id, name, next);
    if (ok && this.view() === id) await this.read();
    return ok;
  }

  async deletePlaylist(id: string): Promise<boolean> {
    this.problem.set('');
    try {
      await firstValueFrom(this.api.deletePlaylist(id));
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@library.deleteListFailed:The playlist could not be deleted.`));
      return false;
    }
    this.keys.update(({ [id]: _gone, ...rest }) => rest);
    await this.loadPlaylists();
    if (this.view() === id) this.setView(VIEW_ALL);
    return true;
  }

  /** Replaces the name and the songs of one playlist; its answer is what the cache and the list then hold. */
  private async save(id: string, name: string, songs: string[]): Promise<boolean> {
    this.problem.set('');
    try {
      const saved = await firstValueFrom(this.api.savePlaylist(id, { name, songs }));
      this.keys.update((k) => ({ ...k, [id]: saved.songs }));
      this.playlists.update((l) => l.map((p) => (p.id === id ? { ...p, name: saved.name, songs: saved.songs.length } : p)));
      return true;
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@library.saveListFailed:The playlist could not be saved.`));
      return false;
    }
  }
}

/** A song with the stars given (none when 0): the answer of the server has no `rating` for an unrated song. */
function withRating(s: LibrarySong, stars: number): LibrarySong {
  const { rating: _old, ...rest } = s;
  return stars > 0 ? { ...rest, rating: stars } : rest;
}

/** The server's reason, as it wrote it. */
function reasonOf(e: unknown, fallback: string): string {
  return (e as HttpErrorResponse)?.error?.error?.message ?? fallback;
}
