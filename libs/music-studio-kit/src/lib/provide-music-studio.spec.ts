import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '@lab/api-client';

import { LanguageService } from './core/language';
import { provideMusicStudio } from './provide-music-studio';
import { InMemorySongs } from './song/in-memory.adapter';
import { ServerSongs } from './song/server.adapter';
import { SONGS } from './song/tokens';
import { isFinished, type Song } from './song/model';
import type { SongPort } from './song/port';

describe('provideMusicStudio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('speaks English when the host gave no language', () => {
    expect(TestBed.inject(LanguageService).lang).toBe('en');
  });

  it('gives the studio the language of the host', () => {
    TestBed.configureTestingModule({ providers: [provideMusicStudio({ lang: 'es' })] });
    expect(TestBed.inject(LanguageService).lang).toBe('es');
  });

  it('makes the songs through the server, with the API client, by default', () => {
    TestBed.configureTestingModule({ providers: [provideMusicStudio({ lang: 'en', client: 'dashboard-full' }), { provide: ApiClient, useValue: {} }] });
    expect(TestBed.inject(SONGS)).toBeInstanceOf(ServerSongs);
  });

  it('keeps the songs in the browser when the host asks for the in-memory adapter', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    TestBed.configureTestingModule({ providers: [provideMusicStudio({ lang: 'en', memory: true })] });
    expect(TestBed.inject(SONGS)).toBeInstanceOf(InMemorySongs);
  });

  it('lets a host make a song in memory through the exported port, with no routes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    TestBed.configureTestingModule({ providers: [provideMusicStudio({ lang: 'en', memory: true })] });
    const songs: SongPort = TestBed.inject(SONGS);
    const created = await firstValueFrom(songs.generate({ title: 'T', lyrics: '', style: 'calm', generator: 'ace-step', instrumental: true }));
    const seen: Song[] = [];
    songs.follow(created.id).subscribe((s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(60_000);
    vi.useRealTimers();
    expect(isFinished(seen.at(-1) as Song)).toBe(true);
    expect(seen.at(-1)?.state.phase).toBe('done');
  });
});
