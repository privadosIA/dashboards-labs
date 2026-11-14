import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MatPaginator } from '@angular/material/paginator';
import { By } from '@angular/platform-browser';

import { LibraryResponse } from '../../core/api.models';
import { LibraryPageComponent } from './library-page.component';

const LIB: LibraryResponse = {
  songs: [
    { key: 'rock/anthem/1', project: 'rock', track_id: 'anthem', variant: 0, seed: 1, title: 'Himno', file: 'out/rock/anthem.mp3', caption: 'rock guitar', audio_seconds: 125 },
    { key: 'rock/ballad/2', project: 'rock', track_id: 'ballad', variant: 0, seed: 2, title: 'Balada', file: 'out/rock/ballad.mp3', favorite: true, cover: 'out/rock/ballad.png' },
    { key: 'lofi/rain/3', project: 'lofi', track_id: 'rain', variant: 0, seed: 3, title: 'Lluvia', file: 'out/lofi/rain.mp3' },
  ],
  ratings: { 'rock/ballad/2': 4 },
  playlists: [{ id: 'night', name: 'Noche', songs: ['lofi/rain/3', 'rock/anthem/1'] }],
};

/** n songs of one project, titled "Canción 01", "Canción 02"… */
function many(n: number): LibraryResponse {
  return {
    songs: Array.from({ length: n }, (_, i) => ({
      key: `big/t${i}/${i}`, project: 'big', track_id: `t${i}`, variant: 0, seed: i, title: `Canción ${String(i + 1).padStart(2, '0')}`, file: `out/big/t${i}.mp3`,
    })),
    ratings: {},
    playlists: [{ id: 'all-night', name: 'Noche', songs: Array.from({ length: n }, (_, i) => `big/t${i}/${i}`) }],
  };
}

describe('LibraryPageComponent', () => {
  let fixture: ComponentFixture<LibraryPageComponent>;
  let http: HttpTestingController;
  let confirm = true;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el().querySelector(sel) as T;
  const qa = (sel: string) => Array.from(el().querySelectorAll<HTMLElement>(sel));
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const click = async (sel: string) => {
    q(sel).click();
    await settle();
  };
  const titles = () => qa('.song__title').map((n) => n.textContent?.trim());

  async function open(lib: LibraryResponse = LIB) {
    fixture = TestBed.createComponent(LibraryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/library').flush(structuredClone(lib));
    await settle();
  }

  beforeEach(async () => {
    confirm = true;
    await TestBed.configureTestingModule({
      imports: [LibraryPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirm) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match('/api/library/meta').forEach((r) => r.flush({}));
    http.verify();
  });

  describe('paging', () => {
    beforeEach(() => sessionStorage.clear());

    it('shows 10 songs a page by default and offers 5, 10, 20 and 100', async () => {
      await open(many(37));
      expect(titles().length).toBe(10);
      expect(titles()[0]).toBe('Canción 01');
      const paginator = fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
      expect(paginator.pageSizeOptions).toEqual([5, 10, 20, 100]);
      expect(paginator.length).toBe(37);
    });

    it('changing the page size shows that many songs, and goes through the pages', async () => {
      await open(many(37));
      const paginator = fixture.debugElement.query(By.directive(MatPaginator)).componentInstance as MatPaginator;
      paginator.page.emit({ pageIndex: 0, pageSize: 5, length: 37, previousPageIndex: 0 });
      await settle();
      expect(titles()).toEqual(['Canción 01', 'Canción 02', 'Canción 03', 'Canción 04', 'Canción 05']);
      paginator.page.emit({ pageIndex: 7, pageSize: 5, length: 37, previousPageIndex: 0 });
      await settle();
      expect(titles()).toEqual(['Canción 36', 'Canción 37']);
      paginator.page.emit({ pageIndex: 0, pageSize: 100, length: 37, previousPageIndex: 7 });
      await settle();
      expect(titles().length).toBe(37);
    });

    it('"Play all" still queues every song, not only the page', async () => {
      await open(many(37));
      await click('[data-testid="play-all"]');
      expect(q('[data-testid="now-playing"]').textContent).toContain('1/37');
    });

    it('moving a song up or down in a list uses its place in the whole list, not in the page', async () => {
      await open(many(37));
      await click('[data-testid="view-all-night"]');
      // the first song of the page is the first of the list: it cannot go up; the second can
      const ups = qa('[data-testid="move-up"]');
      expect(ups.length).toBeGreaterThan(0);
      expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
      expect((ups[1] as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('lists the songs of every project with their stars, the favorite mark and the counts of the views', async () => {
    await open();
    expect(titles()).toEqual(['Himno', 'Balada', 'Lluvia']);
    expect(q('[data-testid="view-all"]').textContent).toContain('3');
    expect(q('[data-testid="view-favorites"]').textContent).toContain('1');
    expect(q('[data-testid="view-night"]').textContent).toContain('Noche');
    const ballad = q('[data-testid="song-rock/ballad/2"]');
    expect(ballad.querySelectorAll('.stars__star--on').length).toBe(4);
    expect(ballad.querySelector('.song__fav')).not.toBeNull();
    expect(ballad.querySelector('img.song__cover')?.getAttribute('src')).toContain('/api/projects/rock/artifacts/out/rock/ballad.png');
    expect(q('[data-testid="song-rock/anthem/1"]').textContent).toContain('2:05');
  });

  it('says so when there are no songs yet', async () => {
    await open({ songs: [], ratings: {}, playlists: [] });
    expect(el().textContent).toContain('Todavía no hay canciones');
    expect(qa('.song').length).toBe(0);
  });

  it('searches as you type and says when nothing matches', async () => {
    await open();
    const input = q<HTMLInputElement>('[data-testid="search"]');
    input.value = 'lluvia';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(titles()).toEqual(['Lluvia']);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(q('[data-testid="no-results"]')).not.toBeNull();
  });

  it('a click on a star saves the rating; the same star again clears it', async () => {
    await open();
    await click('[data-testid="song-rock/anthem/1"] [data-testid="star-3"]');
    let req = http.expectOne({ method: 'PUT', url: '/api/library/meta' });
    expect(req.request.body.ratings).toEqual({ 'rock/ballad/2': 4, 'rock/anthem/1': 3 });
    req.flush({});
    await settle();
    expect(qa('[data-testid="song-rock/anthem/1"] .stars__star--on').length).toBe(3);
    await click('[data-testid="song-rock/anthem/1"] [data-testid="star-3"]');
    req = http.expectOne({ method: 'PUT', url: '/api/library/meta' });
    expect(req.request.body.ratings).toEqual({ 'rock/ballad/2': 4 });
    req.flush({});
  });

  it('a new playlist is created from the name and opens', async () => {
    await open();
    await click('[data-testid="new-list"]');
    const name = q<HTMLInputElement>('[data-testid="new-list-name"]');
    name.value = 'Para correr';
    name.dispatchEvent(new Event('input'));
    await settle();
    await click('[data-testid="new-list-create"]');
    const req = http.expectOne({ method: 'PUT', url: '/api/library/meta' });
    expect(req.request.body.playlists.map((p: { id: string }) => p.id)).toEqual(['night', 'para-correr']);
    req.flush({});
    await settle();
    expect(q('.listbar__title').textContent).toContain('Para correr');
    expect(q('[data-testid="view-para-correr"]')).not.toBeNull();
  });

  it('inside a playlist the songs keep its order, move up and down, and the list can be deleted', async () => {
    await open();
    await click('[data-testid="view-night"]');
    expect(titles()).toEqual(['Lluvia', 'Himno']);
    await click('[data-testid="song-lofi/rain/3"] [data-testid="move-down"]');
    let req = http.expectOne({ method: 'PUT', url: '/api/library/meta' });
    expect(req.request.body.playlists[0].songs).toEqual(['rock/anthem/1', 'lofi/rain/3']);
    req.flush({});
    await settle();
    expect(titles()).toEqual(['Himno', 'Lluvia']);
    await click('[data-testid="delete-list"]');
    req = http.expectOne({ method: 'PUT', url: '/api/library/meta' });
    expect(req.request.body.playlists).toEqual([]);
    req.flush({});
    await settle();
    expect(q('[data-testid="view-night"]')).toBeNull();
    expect(titles().length).toBe(3);
  });

  it('keeps the playlist when the deletion is not confirmed', async () => {
    confirm = false;
    await open();
    await click('[data-testid="view-night"]');
    await click('[data-testid="delete-list"]');
    expect(q('[data-testid="view-night"]')).not.toBeNull();
  });

  it('play all goes through the list: next, previous, and ends when the list does', async () => {
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
    await click('[data-testid="next"]'); // past the last one
    expect(q('[data-testid="now-playing"]')).toBeNull();
  });

  it('plays from the chosen song and only what the filters leave', async () => {
    await open();
    const input = q<HTMLInputElement>('[data-testid="search"]');
    input.value = 'rock';
    input.dispatchEvent(new Event('input'));
    await settle();
    await click('[data-testid="song-rock/ballad/2"] [data-testid="play-from"]');
    expect(q('[data-testid="now-playing"]').textContent).toContain('Balada');
    expect(q('[data-testid="now-playing"]').textContent).toContain('2/2');
  });

  it('offers Animar on each song, which opens the new piece of the Animación section for it, and not on one whose file is gone', async () => {
    await open();
    const animate = q<HTMLAnchorElement>('[data-testid="song-rock/anthem/1"] [data-testid="animate"]');
    const href = new URL(animate.href, 'http://x');
    expect(href.pathname).toBe('/animation/new');
    expect(Object.fromEntries(href.searchParams)).toEqual({ project: 'rock', track: 'anthem', variant: '0' });
    q('[data-testid="song-rock/anthem/1"] audio').dispatchEvent(new Event('error'));
    await settle();
    expect(q('[data-testid="song-rock/anthem/1"] [data-testid="animate"]')).toBeNull();
    expect(q('[data-testid="song-rock/ballad/2"] [data-testid="animate"]')).not.toBeNull();
  });

  it('marks a song whose file cannot be loaded and skips it', async () => {
    await open();
    q('[data-testid="song-rock/anthem/1"] audio').dispatchEvent(new Event('error'));
    await settle();
    expect(q('[data-testid="song-rock/anthem/1"] [data-testid="song-missing"]')).not.toBeNull();
    await click('[data-testid="play-all"]');
    expect(q('[data-testid="now-playing"]').textContent).toContain('Balada');
  });
});
