import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AudioPlayerService } from '../../core/audio-player.service';
import { AudioPlayerComponent } from './audio-player.component';

@Component({
  imports: [AudioPlayerComponent],
  template: `<mo-audio-player [src]="src()" label="balada" (failed)="failures.set(failures() + 1)" (position)="positions.push($event)" />`,
})
class HostComponent {
  src = signal('/api/projects/p/artifacts/out/p/a.mp3');
  failures = signal(0);
  positions: (number | null)[] = [];
}

describe('mo-audio-player', () => {
  function setup() {
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    const audio = (f.nativeElement as HTMLElement).querySelector('audio') as HTMLAudioElement;
    return { f, audio };
  }

  it('renders the native controls on the given source, labelled for assistive technology', () => {
    const { audio } = setup();
    expect(audio.controls).toBe(true);
    expect(audio.getAttribute('src')).toBe('/api/projects/p/artifacts/out/p/a.mp3');
    expect(audio.getAttribute('aria-label')).toBe('balada');
  });

  it('tells the service when it plays, pauses and ends', () => {
    const service = TestBed.inject(AudioPlayerService);
    const started = vi.spyOn(service, 'started');
    const stopped = vi.spyOn(service, 'stopped');
    const { audio } = setup();
    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('pause'));
    audio.dispatchEvent(new Event('ended'));
    expect(started).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith(audio);
    expect(stopped).toHaveBeenCalledTimes(2);
  });

  it('reports where it is: while it plays, when it pauses or is moved, and null when it ends', () => {
    const { f, audio } = setup();
    audio.currentTime = 12;
    audio.dispatchEvent(new Event('play'));
    expect(f.componentInstance.positions.at(-1)).toBe(12);
    audio.currentTime = 20;
    audio.dispatchEvent(new Event('pause'));
    expect(f.componentInstance.positions.at(-1)).toBe(20);
    audio.currentTime = 5;
    audio.dispatchEvent(new Event('seeked'));
    expect(f.componentInstance.positions.at(-1)).toBe(5);
    audio.dispatchEvent(new Event('ended'));
    expect(f.componentInstance.positions.at(-1)).toBeNull();
  });

  it('seek moves the playback and the position follows', () => {
    const { f, audio } = setup();
    const player = f.debugElement.children[0].componentInstance as AudioPlayerComponent;
    player.seek(42);
    expect(audio.currentTime).toBe(42);
    audio.dispatchEvent(new Event('seeked'));
    expect(f.componentInstance.positions.at(-1)).toBe(42);
  });

  it('reports a file that cannot be loaded', () => {
    const { f, audio } = setup();
    audio.dispatchEvent(new Event('error'));
    expect(f.componentInstance.failures()).toBe(1);
  });

  it('lets go of the service when it is destroyed', () => {
    const service = TestBed.inject(AudioPlayerService);
    const stopped = vi.spyOn(service, 'stopped');
    const { f } = setup();
    f.destroy();
    expect(stopped).toHaveBeenCalled();
  });
});
