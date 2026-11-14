import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input, output, viewChild } from '@angular/core';

import { AudioPlayerService } from '../../core/audio-player.service';

/**
 * A song player: the browser's own audio controls (play, pause, seek), with
 * the rule that only one player in the app plays at a time. While it plays it
 * reports its position (every frame) through `position`, and null once it ends. A file that
 * cannot be loaded is reported through `failed` so the owner can show it as
 * missing without breaking the rest of its list.
 */
@Component({
  selector: 'mo-audio-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audio-player.component.html',
  styleUrl: './audio-player.component.scss',
})
export class AudioPlayerComponent implements OnDestroy {
  readonly src = input.required<string>();
  readonly label = input<string>('');
  readonly failed = output<void>();
  /** The file played to its end (not when the user pauses it). */
  readonly finished = output<void>();
  /** Seconds into the file while it plays, when it pauses or is moved; null when it ended. */
  readonly position = output<number | null>();

  private readonly player = inject(AudioPlayerService);
  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  private frame = 0;

  /** Moves the playback to a second of the file (the position output follows). */
  seek(seconds: number): void {
    this.audio().nativeElement.currentTime = Math.max(0, seconds);
  }

  /** Whether it is playing now. */
  isPlaying(): boolean {
    const a = this.audio().nativeElement;
    return !a.paused && !a.ended;
  }

  /** Pauses it. */
  pause(): void {
    this.audio().nativeElement.pause();
  }

  /** Starts playing (a refusal by the browser, such as no earlier user action, is ignored). */
  play(): void {
    void this.audio().nativeElement.play()?.catch(() => undefined);
  }

  protected onPlay(): void {
    this.player.started(this.audio().nativeElement);
    this.tick();
  }

  private tick = (): void => {
    this.position.emit(this.audio().nativeElement.currentTime);
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(this.tick);
  };

  protected onStop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.player.stopped(this.audio().nativeElement);
  }

  protected onPause(): void {
    this.onStop();
    this.position.emit(this.audio().nativeElement.currentTime);
  }

  protected onEnded(): void {
    this.onStop();
    this.position.emit(null);
    this.finished.emit();
  }

  protected onSeeked(): void {
    this.position.emit(this.audio().nativeElement.currentTime);
  }

  ngOnDestroy(): void {
    this.onStop();
  }
}
