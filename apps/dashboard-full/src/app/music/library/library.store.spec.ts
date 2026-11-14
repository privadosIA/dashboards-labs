import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LibraryResponse, LibrarySong } from '../../core/api.models';
import { LibraryStore, VIEW_FAVORITES, VIEW_RATED, fold, playlistId } from './library.store';

const song = (over: Partial<LibrarySong> & { key: string }): LibrarySong => {
  const [project, track, seed] = over.key.split('/');
  return { project, track_id: track, variant: 0, seed: +seed, title: track, file: `out/${project}/${track}.mp3`, ...over };
};

const LIB: LibraryResponse = {
  songs: [
    song({ key: 'rock/anthem/1', title: 'Himno del rock', caption: 'rock guitar', lyrics: 'canción de la noche' }),
    song({ key: 'rock/ballad/2', title: 'Balada', caption: 'piano ballad', favorite: true }),
    song({ key: 'lofi/rain/3', title: 'Lluvia', caption: 'lofi beats', keyscale: 'G minor' }),
  ],
  ratings: { 'rock/ballad/2': 5, 'lofi/rain/3': 3 },
  playlists: [{ id: 'night', name: 'Noche', songs: ['lofi/rain/3', 'rock/anthem/1', 'gone/x/9'] }],
};

describe('LibraryStore', () => {
  let store: LibraryStore;
  let http: HttpTestingController;

  async function load(lib: LibraryResponse = LIB) {
    TestBed.configureTestingModule({ providers: [LibraryStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(LibraryStore);
    http = TestBed.inject(HttpTestingController);
    const done = store.load();
    http.expectOne('/api/library').flush(structuredClone(lib));
    await done;
  }
  const saved = () => http.expectOne({ method: 'PUT', url: '/api/library/meta' });
  const keys = () => store.visible().map((s) => s.key);

  afterEach(() => http.verify());

  it('lists everything, most recent first as the server sent it', async () => {
    await load();
    expect(keys()).toEqual(['rock/anthem/1', 'rock/ballad/2', 'lofi/rain/3']);
    expect(store.projectNames()).toEqual(['lofi', 'rock']);
  });

  it('searches title, project, style, key and lyrics, ignoring case and accents, all the words', async () => {
    await load();
    store.search.set('CANCION noche');
    expect(keys()).toEqual(['rock/anthem/1']);
    store.search.set('lofi g minor');
    expect(keys()).toEqual(['lofi/rain/3']);
    store.search.set('piano');
    expect(keys()).toEqual(['rock/ballad/2']);
    store.search.set('nothing like this');
    expect(keys()).toEqual([]);
  });

  it('filters by generator, a song with none recorded counting as ACE-Step', async () => {
    await load({ ...LIB, songs: [song({ key: 'a/x/1', generator: 'heartmula' }), song({ key: 'a/y/2', generator: 'diffrhythm2' }), song({ key: 'a/z/3' })] });
    store.generator.set('heartmula');
    expect(keys()).toEqual(['a/x/1']);
    store.generator.set('ace-step');
    expect(keys()).toEqual(['a/z/3']);
    store.generator.set('');
    expect(keys()).toHaveLength(3);
  });

  it('deletes a song from its project and reloads the list', async () => {
    await load();
    const done = store.deleteSong(store.songs()[0]);
    http.expectOne({ method: 'DELETE', url: '/api/projects/rock/songs/anthem/0' }).flush(null);
    await vi.waitFor(() => http.expectOne('/api/library').flush({ ...structuredClone(LIB), songs: [] }));
    expect(await done).toBe(true);
    expect(store.songs()).toEqual([]);
  });

  it('filters by project, by minimum stars and by the favorite and rated views', async () => {
    await load();
    store.project.set('rock');
    expect(keys()).toEqual(['rock/anthem/1', 'rock/ballad/2']);
    store.minStars.set(4);
    expect(keys()).toEqual(['rock/ballad/2']);
    store.project.set('');
    store.minStars.set(0);
    store.view.set(VIEW_FAVORITES);
    expect(keys()).toEqual(['rock/ballad/2']);
    store.view.set(VIEW_RATED);
    expect(keys()).toEqual(['rock/ballad/2', 'lofi/rain/3']);
  });

  it('sorts by stars or by title', async () => {
    await load();
    store.sort.set('rating');
    expect(keys()).toEqual(['rock/ballad/2', 'lofi/rain/3', 'rock/anthem/1']);
    store.sort.set('title');
    expect(keys()).toEqual(['rock/ballad/2', 'rock/anthem/1', 'lofi/rain/3']);
  });

  it('a playlist keeps its own order and skips the songs that no longer exist', async () => {
    await load();
    store.view.set('night');
    store.sort.set('title'); // ignored inside a playlist
    expect(keys()).toEqual(['lofi/rain/3', 'rock/anthem/1']);
  });

  it('rating saves the whole document; the same stars again take them away', async () => {
    await load();
    store.rate('rock/anthem/1', 4);
    expect(saved().request.body.ratings).toEqual({ 'rock/ballad/2': 5, 'lofi/rain/3': 3, 'rock/anthem/1': 4 });
    store.rate('rock/anthem/1', 4);
    const req = saved();
    expect(req.request.body.ratings['rock/anthem/1']).toBeUndefined();
    req.flush({});
  });

  it('creates, fills, orders, renames and deletes playlists', async () => {
    await load();
    const id = store.createPlaylist('  Para correr! ', 'rock/ballad/2');
    expect(id).toBe('para-correr');
    expect(saved().request.body.playlists.at(-1)).toEqual({ id: 'para-correr', name: 'Para correr!', songs: ['rock/ballad/2'] });
    expect(store.createPlaylist('Para correr')).toBe('para-correr-2');
    saved();
    expect(store.createPlaylist('   ')).toBe('');
    store.togglePlaylistSong('para-correr', 'lofi/rain/3');
    saved();
    expect(store.playlists().find((p) => p.id === 'para-correr')?.songs).toEqual(['rock/ballad/2', 'lofi/rain/3']);
    store.moveInPlaylist('para-correr', 'lofi/rain/3', -1);
    saved();
    expect(store.playlists().find((p) => p.id === 'para-correr')?.songs).toEqual(['lofi/rain/3', 'rock/ballad/2']);
    store.moveInPlaylist('para-correr', 'lofi/rain/3', -1); // already first: nothing moves
    store.togglePlaylistSong('para-correr', 'lofi/rain/3');
    saved();
    expect(store.playlistsOf('lofi/rain/3')).toEqual(['night']);
    store.renamePlaylist('night', 'De noche');
    saved();
    store.view.set('night');
    store.deletePlaylist('night');
    saved();
    expect(store.view()).toBe('');
    expect(store.playlists().map((p) => p.id)).toEqual(['para-correr', 'para-correr-2']);
  });

  it('when the server refuses a change it shows what the server has', async () => {
    await load();
    store.rate('rock/anthem/1', 2);
    saved().flush({ error: { code: 'validation_failed', message: 'no' } }, { status: 422, statusText: 'Unprocessable' });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/library').flush(structuredClone(LIB));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.stars('rock/anthem/1')).toBe(0);
  });
});

describe('helpers', () => {
  it('folds accents and case', () => expect(fold('Canción ÁÉÍ')).toBe('cancion aei'));
  it('makes playlist ids from names, unique and valid', () => {
    expect(playlistId('Mis favoritas ★', [])).toBe('mis-favoritas');
    expect(playlistId('???', [])).toBe('lista');
    expect(playlistId('Rock', ['rock', 'rock-2'])).toBe('rock-3');
  });
});
