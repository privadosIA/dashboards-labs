import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { BehaviorSubject, NEVER, firstValueFrom, throwError } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { InMemorySongs } from '../song/in-memory.adapter';
import type { SongRequest } from '../song/model';
import type { SongPort } from '../song/port';
import { SONGS } from '../song/tokens';
import { SongsPanel } from './songs-panel';

const REQUEST: SongRequest = { title: 'Night drive', lyrics: '[verse]\nla', style: 'lo-fi, chill', generator: 'heartmula', instrumental: false };

async function draw(port: SongPort = new InMemorySongs({ pace: 10 })): Promise<{ fixture: ComponentFixture<SongsPanel>; port: SongPort }> {
  stubStorage();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: port }] });
  const fixture = TestBed.createComponent(SongsPanel);
  await settle(fixture);
  return { fixture, port };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector<T>(sel);
const all = (f: ComponentFixture<unknown>, sel: string) => [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(sel)];

describe('SongsPanel', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says it is loading until the history is read', async () => {
    const { fixture } = await draw({ songs: () => NEVER } as unknown as SongPort);
    expect(q(fixture, '[data-testid=songs-loading]')).toBeTruthy();
  });

  it('invites to generate when there are no songs', async () => {
    const { fixture } = await draw();
    expect(q(fixture, '[data-testid=songs-empty]')!.textContent).toContain('No songs yet');
    expect(q(fixture, '[data-testid=songs-loading]')).toBeNull();
  });

  it('lists the songs, newest first', async () => {
    const { fixture, port } = await draw();
    await firstValueFrom(port.generate({ ...REQUEST, title: 'One' }));
    await vi.advanceTimersByTimeAsync(5);
    await firstValueFrom(port.generate({ ...REQUEST, title: 'Two' }));
    await settle(fixture);
    expect(all(fixture, '[data-testid=song-title]').map((e) => e.textContent)).toEqual(['Two', 'One']);
    expect(q(fixture, '[data-testid=songs-empty]')).toBeNull();
  });

  it('follows a song from queued to done, with its player', async () => {
    const { fixture, port } = await draw();
    await firstValueFrom(port.generate(REQUEST));
    await settle(fixture);
    expect(q(fixture, '[data-testid=song-status]')!.textContent).toContain('position');
    await vi.advanceTimersByTimeAsync(100);
    await settle(fixture);
    expect(q(fixture, '[data-testid=song-audio]')).toBeTruthy();
  });

  it('cancels a song that is being made', async () => {
    const { fixture, port } = await draw();
    await firstValueFrom(port.generate(REQUEST));
    await settle(fixture);
    q<HTMLButtonElement>(fixture, '[data-testid=song-cancel]')!.click();
    await settle(fixture);
    expect(q(fixture, '[data-testid=song-status]')!.textContent).toBe('Cancelled');
  });

  it('asks for a cancelled song again as a new one', async () => {
    const { fixture, port } = await draw();
    await firstValueFrom(port.generate(REQUEST));
    await settle(fixture);
    q<HTMLButtonElement>(fixture, '[data-testid=song-cancel]')!.click();
    await settle(fixture);
    q<HTMLButtonElement>(fixture, '[data-testid=song-retry]')!.click();
    await settle(fixture);
    expect(all(fixture, '[data-testid=song-title]')).toHaveLength(2);
  });

  describe('deleting', () => {
    async function finished() {
      const made = await draw();
      await firstValueFrom(made.port.generate(REQUEST));
      await vi.advanceTimersByTimeAsync(100);
      await settle(made.fixture);
      return made;
    }
    const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.confirm button')].find((b) => b.textContent?.trim() === text)!;

    it('asks first, and deletes the song when the answer is yes', async () => {
      const { fixture } = await finished();
      q<HTMLButtonElement>(fixture, '[data-testid=song-remove]')!.click();
      await settle(fixture);
      expect(document.querySelector('.confirm h2')!.textContent).toContain('Delete the song?');
      button('Delete').click();
      await vi.advanceTimersByTimeAsync(500);
      await settle(fixture);
      expect(q(fixture, '[data-testid=songs-empty]')).toBeTruthy();
    });

    it('keeps the song when the answer is no', async () => {
      const { fixture } = await finished();
      q<HTMLButtonElement>(fixture, '[data-testid=song-remove]')!.click();
      await settle(fixture);
      button('Cancel').click();
      await vi.advanceTimersByTimeAsync(500);
      await settle(fixture);
      expect(all(fixture, '[data-testid=song-title]')).toHaveLength(1);
    });
  });

  it('says so when the server does not do what was asked', async () => {
    const real = new InMemorySongs({ pace: 10 });
    const { fixture } = await draw({ songs: () => real.songs(), generate: (r: SongRequest) => real.generate(r), cancel: () => throwError(() => new Error('down')) } as unknown as SongPort);
    await firstValueFrom(real.generate(REQUEST));
    await settle(fixture);
    q<HTMLButtonElement>(fixture, '[data-testid=song-cancel]')!.click();
    await settle(fixture);
    expect(q(fixture, '[data-testid=songs-error]')!.textContent).toContain('did not work');
  });

  it('pages the songs ten at a time and stays on the page when one of them changes', async () => {
    sessionStorage.clear();
    const make = (n: number, phase: 'running' | 'queued' = 'queued') => ({ id: `s${n}`, title: `Song ${n}`, style: 'lo-fi', lyrics: '', instrumental: true, generator: 'heartmula' as const, createdAt: n, state: { phase } });
    const songs$ = new BehaviorSubject(Array.from({ length: 23 }, (_, i) => make(i)));
    const { fixture } = await draw({ songs: () => songs$.asObservable() } as unknown as SongPort);
    expect(all(fixture, 'app-song-card')).toHaveLength(10);
    q<HTMLButtonElement>(fixture, 'button.mat-mdc-paginator-navigation-next')!.click();
    await settle(fixture);
    expect(all(fixture, 'app-song-card')).toHaveLength(10);
    songs$.next(Array.from({ length: 23 }, (_, i) => make(i, i === 12 ? 'running' : 'queued')));
    await settle(fixture);
    expect(all(fixture, 'app-song-card')).toHaveLength(10);
    expect(all(fixture, 'app-song-card')[0].textContent).toContain('Song 10');
  });
});
