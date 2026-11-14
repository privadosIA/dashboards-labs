import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { SongMap } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../../provide-motion-editor';
import { motionEditorTexts } from '../../texts';
import { beatAt, timeText } from '../beat-at';
import type { PreviewClock } from '../clock';
import { transportKey } from './keys';

/** The controls under the canvas: play and pause, a frame back and forward, to the start and the end, the quantise toggle and the readout. */
@Component({
  selector: 'lab-preview-transport',
  templateUrl: './transport.html',
  styleUrl: './transport.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', tabindex: '0', '(keydown)': 'key($event)' },
})
export class Transport {
  readonly clock = input.required<PreviewClock>();
  readonly songMap = input.required<Pick<SongMap, 'beats' | 'beatBase' | 'sections'>>();

  protected readonly t = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  protected readonly reading = computed(() => beatAt(this.songMap(), this.clock().time()));
  protected readonly timeLabel = computed(() => timeText(this.clock().time()));
  protected readonly lengthLabel = computed(() => timeText(this.clock().duration()));

  protected key(event: KeyboardEvent): void {
    if (transportKey(this.clock(), event)) event.preventDefault();
  }

  protected toStart(): void {
    this.clock().pause();
    this.clock().seek(0);
  }

  protected toEnd(): void {
    this.clock().pause();
    this.clock().seek(this.clock().duration());
  }

  /** The seek bar moved: the clock goes there, keeping the state it was in. */
  protected scrub(event: Event): void {
    this.clock().seek(Number((event.target as HTMLInputElement).value));
  }

  protected toggleSnap(): void {
    this.clock().snapToFrames.update((v) => !v);
  }
}
