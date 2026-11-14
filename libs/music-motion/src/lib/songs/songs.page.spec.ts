import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TicketService } from '@lab/server-connection';
import { Subject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { AnimationFailure, type AnimationPort, type Song } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { SongsPage } from './songs.page';

const song = (variant: number, extra: Partial<Song> = {}): Song => ({ key: `demo/t/${variant}`, project: 'demo', trackId: 't', variant, title: 'Quiet Town', seconds: 65, instrumental: false, audio: 'http://server/a.mp3', ...extra });

function create(songs: () => unknown, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      { provide: ANIMATION, useValue: { songs } as unknown as AnimationPort },
      { provide: Router, useValue: { navigate } },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
    ],
  });
  const fixture = TestBed.createComponent(SongsPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, navigate, text: () => el.textContent ?? '' };
}

describe('SongsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says it is loading until the library answers', () => {
    const answer = new Subject<readonly Song[]>();
    const { fixture, text } = create(() => answer);
    expect(text()).toContain('Loading');
    answer.next([song(0)]);
    fixture.detectChanges();
    expect(text()).not.toContain('Loading');
    expect(text()).toContain('Quiet Town');
  });

  it('lists a card per track, with the versions together and the length of the chosen one', () => {
    const { el, text } = create(() => of([song(0), song(1, { seconds: 70, instrumental: true }), song(0, { key: 'x/u/0', project: 'x', trackId: 'u', title: 'Morning Light' })]));
    expect(el.querySelectorAll('app-song-card')).toHaveLength(2);
    expect(text()).toContain('1:05');
    const select = el.querySelector<HTMLSelectElement>('[data-testid="version"]')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Version 1 · 1:05', 'Version 2 · 1:10 · instrumental']);
    expect(el.querySelectorAll('[data-testid="version"]')).toHaveLength(1);
  });

  it('shows the chosen version and animates that one', () => {
    const { fixture, el, navigate } = create(() => of([song(0), song(1, { title: 'Quiet Town (2)', seconds: 70 })]));
    const select = el.querySelector<HTMLSelectElement>('[data-testid="version"]')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('h2')!.textContent).toContain('Quiet Town (2)');
    expect(el.querySelector('.meta')!.textContent).toContain('1:10');
    el.querySelector<HTMLButtonElement>('[data-testid="animate"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/new'], { queryParams: { project: 'demo', track: 't', variant: 1 } });
  });

  it('plays the audio with the ticket the server asks for', () => {
    const { el } = create(() => of([song(0, { cover: 'http://server/c.png' })]));
    expect(el.querySelector('audio')!.getAttribute('src')).toBe('http://server/a.mp3?ticket=T');
    expect(el.querySelector('img.cover')!.getAttribute('src')).toBe('http://server/c.png?ticket=T');
  });

  it('shows no player for a song with no audio address', () => {
    const { el } = create(() => of([song(0, { audio: undefined })]));
    expect(el.querySelector('audio')).toBeNull();
  });

  it('says there are no songs, that they are made elsewhere, and offers no way to make one', () => {
    const { el, text } = create(() => of([]));
    expect(el.querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(text()).toContain('The library has no songs.');
    expect(text()).toContain('made in a music dashboard');
    expect(el.querySelector('[data-testid="animate"]')).toBeNull();
  });

  it('shows the server\'s reason when the library cannot be read, and tries again on the button', () => {
    let fail = true;
    const { fixture, el, text } = create(() => (fail ? throwError(() => new AnimationFailure('other', 'connection refused')) : of([song(0)])));
    expect(el.querySelector('[data-testid="load-failed"]')).not.toBeNull();
    expect(text()).toContain('The library could not be read.');
    expect(text()).toContain('connection refused');
    expect(el.querySelector('[data-testid="empty"]')).toBeNull();
    fail = false;
    el.querySelector<HTMLButtonElement>('[data-testid="retry"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="load-failed"]')).toBeNull();
    expect(text()).toContain('Quiet Town');
  });

  it('speaks Spanish when the language is Spanish', () => {
    const { text } = create(() => of([]), 'es');
    expect(text()).toContain('La biblioteca no tiene canciones.');
  });

  it('pages by track, not by version: 12 tracks of two versions are 10 cards and then 2', () => {
    sessionStorage.clear();
    const songs = Array.from({ length: 12 }, (_, i) => [song(0, { key: `p${i}/t/0`, project: `p${i}` }), song(1, { key: `p${i}/t/1`, project: `p${i}` })]).flat();
    const { fixture, el } = create(() => of(songs));
    expect(el.querySelectorAll('app-song-card')).toHaveLength(10);
    el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('app-song-card')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="version"]')).toHaveLength(2);
  });
});
