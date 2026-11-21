import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';

describe('ApiService: the song library', () => {
  let http: HttpTestingController;
  let api: ApiService;
  const skipsToast = (context: HttpContext) => context.get(SKIP_ERROR_TOAST) === true;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
  });
  afterEach(() => http.verify());

  describe('the songs, a page at a time', () => {
    it('sends the page, the order, the text and the filters, and leaves out what is not asked', () => {
      api.listLibrarySongs({ limit: 10, offset: 20, sort: '-rating', q: 'night', project: 'demo', min_rating: 3, favorite: true, playlist: 'mix' }).subscribe();
      const req = http.expectOne((r) => r.url === '/api/library/songs');
      expect(req.request.method).toBe('GET');
      const p = req.request.params;
      expect(p.get('limit')).toBe('10');
      expect(p.get('offset')).toBe('20');
      expect(p.get('sort')).toBe('-rating');
      expect(p.get('q')).toBe('night');
      expect(p.get('project')).toBe('demo');
      expect(p.get('min_rating')).toBe('3');
      expect(p.get('favorite')).toBe('true');
      expect(p.get('playlist')).toBe('mix');
      expect(skipsToast(req.request.context)).toBe(true);
      req.flush([]);
    });

    it('sends nothing for an empty text, an empty project or a favourite that is not asked', () => {
      api.listLibrarySongs({ limit: 5, q: '', project: '', favorite: false }).subscribe();
      const req = http.expectOne((r) => r.url === '/api/library/songs');
      expect(req.request.params.keys()).toEqual(['limit']);
      req.flush([]);
    });

    it('takes the total from X-Total-Count', () => {
      let page: { items: unknown[]; total: number } | undefined;
      api.listLibrarySongs({ limit: 2 }).subscribe((p) => (page = p));
      http.expectOne((r) => r.url === '/api/library/songs').flush([{ key: 'a' }, { key: 'b' }], { headers: { 'X-Total-Count': '135' } });
      expect(page).toEqual({ items: [{ key: 'a' }, { key: 'b' }], total: 135 });
    });

    it('counts the songs it received when the header is absent', () => {
      let page: { items: unknown[]; total: number } | undefined;
      api.listLibrarySongs({}).subscribe((p) => (page = p));
      http.expectOne((r) => r.url === '/api/library/songs').flush([{ key: 'a' }, { key: 'b' }, { key: 'c' }]);
      expect(page?.total).toBe(3);
    });
  });

  it('rates one song with its key encoded in the address, and 0 removes the stars', () => {
    api.rateSong('demo/track-1/7', 4).subscribe();
    const req = http.expectOne('/api/library/songs/demo%2Ftrack-1%2F7/rating');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ stars: 4 });
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({});
    api.rateSong('demo/track-1/7', 0).subscribe();
    expect(http.expectOne('/api/library/songs/demo%2Ftrack-1%2F7/rating').request.body).toEqual({ stars: 0 });
  });

  it('rescans the library', () => {
    api.rescanLibrary().subscribe();
    const req = http.expectOne('/api/library/rescan');
    expect(req.request.method).toBe('POST');
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({ added: 0, updated: 0, removed: 0 });
  });

  describe('the playlists, one at a time', () => {
    it('lists them, reads one and makes one', () => {
      api.listPlaylists().subscribe();
      expect(http.expectOne('/api/library/playlists').request.method).toBe('GET');
      api.getPlaylist('night-drive').subscribe();
      expect(http.expectOne('/api/library/playlists/night-drive').request.method).toBe('GET');
      api.createPlaylist({ name: 'Night drive', songs: ['a'] }).subscribe();
      const post = http.expectOne('/api/library/playlists');
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ name: 'Night drive', songs: ['a'] });
      http.match(() => true).forEach((r) => r.flush([]));
    });

    it('replaces the name and the songs of one playlist and deletes one', () => {
      api.savePlaylist('night-drive', { name: 'Night', songs: ['a', 'b'] }).subscribe();
      const put = http.expectOne('/api/library/playlists/night-drive');
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ name: 'Night', songs: ['a', 'b'] });
      expect(skipsToast(put.request.context)).toBe(true);
      put.flush({});
      api.deletePlaylist('night-drive').subscribe();
      const del = http.expectOne('/api/library/playlists/night-drive');
      expect(del.request.method).toBe('DELETE');
      del.flush(null);
    });
  });
});
