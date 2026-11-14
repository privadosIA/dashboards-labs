import { ComponentFixture, TestBed } from '@angular/core/testing';

import { stubStorage } from '../../../testing/memory-storage';
import type { Song, SongState } from '../../song/model';
import { SongCard } from './song-card';

const song = (state: SongState, over: Partial<Song> = {}): Song => ({ id: 'song-1', title: 'Night drive', style: 'lo-fi, chill, piano', lyrics: 'la', instrumental: false, generator: 'heartmula', createdAt: 1, state, ...over });

function draw(s: Song): ComponentFixture<SongCard> {
  stubStorage();
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SongCard);
  fixture.componentRef.setInput('song', s);
  fixture.detectChanges();
  return fixture;
}

const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector<T>(sel);

describe('SongCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the title, the generator and the tags of a HeartMuLa song as chips', () => {
    const f = draw(song({ phase: 'running' }));
    expect(q(f, '[data-testid=song-title]')!.textContent).toBe('Night drive');
    expect(q(f, '[data-testid=song-generator]')!.textContent).toBe('HeartMuLa');
    expect([...f.nativeElement.querySelectorAll('[data-testid=song-tags] li')].map((li) => (li as HTMLElement).textContent)).toEqual(['lo-fi', 'chill', 'piano']);
  });

  it('shows the style of an ACE-Step song as the sentence it is', () => {
    const f = draw(song({ phase: 'running' }, { generator: 'ace-step', style: 'A slow lo-fi piano piece' }));
    expect(q(f, '[data-testid=song-tags]')).toBeNull();
    expect(q(f, '[data-testid=song-style]')!.textContent).toBe('A slow lo-fi piano piece');
  });

  it('says where a queued or a running song is, and offers to cancel it', () => {
    const queued = draw(song({ phase: 'queued', position: 2 }));
    expect(q(queued, '[data-testid=song-status]')!.textContent).toContain('position 2');
    expect(q(queued, '[data-testid=song-cancel]')).toBeTruthy();
    expect(q(queued, '[data-testid=song-remove]')).toBeNull();
    const running = draw(song({ phase: 'running' }));
    expect(q(running, '[data-testid=song-status]')!.textContent).toContain('Generating');
  });

  it('gives a finished song a player, its length, a download and a delete', () => {
    const f = draw(song({ phase: 'done', url: 'http://server/a.mp3', seconds: 131 }));
    expect(q<HTMLAudioElement>(f, '[data-testid=song-audio]')!.getAttribute('src')).toBe('http://server/a.mp3');
    expect(q(f, '[data-testid=song-clock]')!.textContent).toBe('2:11');
    expect(q<HTMLAnchorElement>(f, '[data-testid=song-download]')!.getAttribute('href')).toBe('http://server/a.mp3');
    expect(q(f, '[data-testid=song-remove]')).toBeTruthy();
    expect(q(f, '[data-testid=song-cancel]')).toBeNull();
  });

  it('shows why a song failed and offers to try again and to delete it', () => {
    const f = draw(song({ phase: 'failed', reason: 'out of memory' }));
    expect(q(f, '[data-testid=song-status]')!.textContent).toBe('out of memory');
    expect(q(f, '[data-testid=song-retry]')).toBeTruthy();
    expect(q(f, '[data-testid=song-remove]')).toBeTruthy();
  });

  it('says a song was cancelled and offers to try again', () => {
    const f = draw(song({ phase: 'cancelled' }));
    expect(q(f, '[data-testid=song-status]')!.textContent).toBe('Cancelled');
    expect(q(f, '[data-testid=song-retry]')).toBeTruthy();
  });

  it('tells the panel what the user chose', () => {
    const f = draw(song({ phase: 'failed', reason: 'x' }));
    const seen: string[] = [];
    f.componentInstance.retry.subscribe(() => seen.push('retry'));
    f.componentInstance.remove.subscribe(() => seen.push('remove'));
    q<HTMLButtonElement>(f, '[data-testid=song-retry]')!.click();
    q<HTMLButtonElement>(f, '[data-testid=song-remove]')!.click();
    expect(seen).toEqual(['retry', 'remove']);
  });
});
