import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * From and To (seconds) to use only part of a video, with a preview whose
 * paused instant can be taken as either end and the length of the part. The
 * fields work without the preview (a video that is not there is not shown).
 */
@Component({
  selector: 'app-clip-trim',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  templateUrl: './clip-trim.component.html',
  styleUrl: './clip-trim.component.scss',
})
export class ClipTrimComponent {
  /** The video to scrub; null shows only the fields. */
  readonly src = input<string | null>(null);
  /** The video is a ping-pong (forward then reverse): only its first half can be used. */
  readonly half = input(false);
  readonly start = input<number | undefined>(undefined);
  readonly end = input<number | undefined>(undefined);
  readonly speed = input<number | undefined>(undefined);
  readonly error = input<string | undefined>(undefined);
  readonly speedError = input<string | undefined>(undefined);
  /** Prefix of the data-testid of the parts (`-preview`, `-start`, `-end`, `-mark-start`, `-mark-end`, `-part`). */
  readonly testId = input('clip');
  readonly trimmed = output<{ clip_start?: number; clip_end?: number; clip_speed?: number }>();

  /** The length of the usable video, once the preview knows it. */
  protected readonly usable = signal<number | null>(null);
  protected readonly failed = signal(false);
  protected readonly partSeconds = computed(() => {
    const total = this.usable();
    if (total === null) return null;
    const part = (this.end() ?? total) - (this.start() ?? 0);
    return part > 0 ? Math.round(part * 100) / 100 : null;
  });

  protected onMetadata(video: HTMLVideoElement): void {
    this.failed.set(false);
    this.usable.set(Number.isFinite(video.duration) ? (this.half() ? video.duration / 2 : video.duration) : null);
  }

  /** Sets or clears (empty text) one end of the part. */
  protected set(which: 'clip_start' | 'clip_end' | 'clip_speed', raw: string): void {
    const n = raw.trim() === '' ? undefined : Number(raw);
    this.trimmed.emit({ [which]: n !== undefined && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined });
  }

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('vid');

  /** Takes the instant the preview is at as the start or the end of the part. */
  protected mark(which: 'clip_start' | 'clip_end'): void {
    const v = this.video()?.nativeElement;
    if (v) this.set(which, String(v.currentTime));
  }
}
