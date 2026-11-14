import { TestBed } from '@angular/core/testing';

import { AudioPlayerService } from './audio-player.service';

function fakeAudio(): HTMLMediaElement & { paused$: number } {
  const el = { paused$: 0, pause() { this.paused$++; } };
  return el as unknown as HTMLMediaElement & { paused$: number };
}

describe('AudioPlayerService', () => {
  const service = () => TestBed.inject(AudioPlayerService);

  it('pauses the player that was playing when another one starts', () => {
    const s = service();
    const a = fakeAudio();
    const b = fakeAudio();
    s.started(a);
    s.started(b);
    expect(a.paused$).toBe(1);
    expect(b.paused$).toBe(0);
  });

  it('does not pause a player that starts again by itself', () => {
    const s = service();
    const a = fakeAudio();
    s.started(a);
    s.started(a);
    expect(a.paused$).toBe(0);
  });

  it('forgets a player that stopped, so the next one pauses nothing', () => {
    const s = service();
    const a = fakeAudio();
    const b = fakeAudio();
    s.started(a);
    s.stopped(a);
    s.started(b);
    expect(a.paused$).toBe(0);
  });

  it('ignores the stop of a player that is no longer the current one', () => {
    const s = service();
    const a = fakeAudio();
    const b = fakeAudio();
    s.started(a);
    s.started(b);
    s.stopped(a); // a was already replaced by b
    const c = fakeAudio();
    s.started(c);
    expect(b.paused$).toBe(1);
  });
});
