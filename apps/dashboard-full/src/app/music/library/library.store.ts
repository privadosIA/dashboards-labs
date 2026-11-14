import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LibraryMeta, LibraryPlaylist, LibrarySong } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ModeFilterStore, originOf } from '../../core/mode-filter.store';

/** How the list is ordered. */
export type LibrarySort = 'recent' | 'rating' | 'title';

/** The special views of the list next to the playlists. */
export const VIEW_ALL = '';
export const VIEW_FAVORITES = '*favorites';
export const VIEW_RATED = '*rated';

/** Lower-cases and strips the accents, so «cancion» finds «Canción». */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** The id a playlist gets from its name: lowercase, digits and hyphens, unique among the others. */
export function playlistId(name: string, taken: readonly string[]): string {
  const base = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'lista';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The song library: every song of every music project with its stars and playlists, searched and
 * filtered on the client. The stars and playlists are saved whole after every change.
 */
@Injectable()
export class LibraryStore {
  private readonly api = inject(ApiService);
  private readonly filter = inject(ModeFilterStore);

  readonly songs = signal<LibrarySong[]>([]);
  readonly ratings = signal<Record<string, number>>({});
  readonly playlists = signal<LibraryPlaylist[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');

  // the filters
  readonly search = signal('');
  readonly project = signal('');
  /** '' = every generator. */
  readonly generator = signal('');
  readonly minStars = signal(0);
  readonly view = signal(VIEW_ALL);
  readonly sort = signal<LibrarySort>('recent');

  /** The songs made where the user wants to look (desktop, phone): the shared choice of the screens that tell origins apart. */
  readonly scoped = computed(() => {
    const origins = this.filter.origins();
    return this.songs().filter((s) => origins.has(originOf(s.project)));
  });

  readonly projectNames = computed(() => [...new Set(this.scoped().map((s) => s.project))].sort());
  readonly byKey = computed(() => new Map(this.songs().map((s) => [s.key, s])));

  readonly activePlaylist = computed(() => this.playlists().find((p) => p.id === this.view()) ?? null);

  /** The songs the filters leave, in the order chosen (a playlist keeps its own order). */
  readonly visible = computed<LibrarySong[]>(() => {
    const view = this.view();
    const ratings = this.ratings();
    const words = fold(this.search()).split(/\s+/).filter(Boolean);
    const project = this.project();
    const generator = this.generator();
    const min = this.minStars();
    let list: LibrarySong[];
    const playlist = this.activePlaylist();
    if (playlist) {
      const byKey = this.byKey();
      const origins = this.filter.origins();
      list = playlist.songs.map((k) => byKey.get(k)).filter((s): s is LibrarySong => !!s && origins.has(originOf(s.project)));
    } else {
      list = [...this.scoped()];
    }
    list = list.filter((s) => {
      if (view === VIEW_FAVORITES && !s.favorite) return false;
      if (view === VIEW_RATED && !ratings[s.key]) return false;
      if (project && s.project !== project) return false;
      if (generator && (s.generator ?? 'ace-step') !== generator) return false;
      if (min > 0 && (ratings[s.key] ?? 0) < min) return false;
      if (words.length === 0) return true;
      const hay = fold(`${s.title} ${s.project} ${s.track_id} ${s.caption ?? ''} ${s.lyrics ?? ''} ${s.keyscale ?? ''}`);
      return words.every((w) => hay.includes(w));
    });
    if (!playlist) {
      const sort = this.sort();
      if (sort === 'rating') list.sort((a, b) => (ratings[b.key] ?? 0) - (ratings[a.key] ?? 0));
      else if (sort === 'title') list.sort((a, b) => fold(a.title).localeCompare(fold(b.title)));
    }
    return list;
  });

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const lib = await firstValueFrom(this.api.getLibrary());
      this.songs.set(lib.songs);
      this.ratings.set(lib.ratings);
      this.playlists.set(lib.playlists);
      if (this.view() && !this.view().startsWith('*') && !lib.playlists.some((p) => p.id === this.view())) this.view.set(VIEW_ALL);
    } catch {
      this.error.set('load');
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }

  /** Deletes the song's audio from its project and takes it out of the list. */
  async deleteSong(s: LibrarySong): Promise<boolean> {
    try {
      await firstValueFrom(this.api.deleteSong(s.project, s.track_id, s.variant));
    } catch {
      return false; // the error toast already told the user
    } finally {
      await this.load();
    }
    return true;
  }

  stars(key: string): number {
    return this.ratings()[key] ?? 0;
  }

  /** Gives a song n stars; the same number again takes them away. */
  rate(key: string, n: number): void {
    const next = { ...this.ratings() };
    if (this.stars(key) === n || n < 1) delete next[key];
    else next[key] = Math.min(5, n);
    this.ratings.set(next);
    void this.persist();
  }

  playlistsOf(key: string): string[] {
    return this.playlists().filter((p) => p.songs.includes(key)).map((p) => p.id);
  }

  /** Creates a playlist (optionally with a first song) and returns its id; '' when the name is empty. */
  createPlaylist(name: string, firstSong?: string): string {
    const clean = name.trim().slice(0, 80);
    if (!clean) return '';
    const id = playlistId(clean, this.playlists().map((p) => p.id));
    this.playlists.update((l) => [...l, { id, name: clean, songs: firstSong ? [firstSong] : [] }]);
    void this.persist();
    return id;
  }

  renamePlaylist(id: string, name: string): void {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    this.playlists.update((l) => l.map((p) => (p.id === id ? { ...p, name: clean } : p)));
    void this.persist();
  }

  deletePlaylist(id: string): void {
    this.playlists.update((l) => l.filter((p) => p.id !== id));
    if (this.view() === id) this.view.set(VIEW_ALL);
    void this.persist();
  }

  /** Puts the song in the playlist, or takes it out when it is already there. */
  togglePlaylistSong(id: string, key: string): void {
    this.playlists.update((l) =>
      l.map((p) => (p.id !== id ? p : { ...p, songs: p.songs.includes(key) ? p.songs.filter((k) => k !== key) : [...p.songs, key] })),
    );
    void this.persist();
  }

  /** Moves a song of the playlist one place up (-1) or down (+1); at the end of the list nothing happens. */
  moveInPlaylist(id: string, key: string, delta: -1 | 1): void {
    const p = this.playlists().find((x) => x.id === id);
    const at = p?.songs.indexOf(key) ?? -1;
    const to = at + delta;
    if (!p || at < 0 || to < 0 || to >= p.songs.length) return;
    const songs = [...p.songs];
    [songs[at], songs[to]] = [songs[to], songs[at]];
    this.playlists.update((l) => l.map((x) => (x.id === id ? { ...x, songs } : x)));
    void this.persist();
  }

  private async persist(): Promise<void> {
    const meta: LibraryMeta = { ratings: this.ratings(), playlists: this.playlists() };
    try {
      await firstValueFrom(this.api.saveLibraryMeta(meta));
    } catch {
      // the error toast already told the user; the server's copy is the truth
      await this.load();
    }
  }
}
