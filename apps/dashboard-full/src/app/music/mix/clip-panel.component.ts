import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { MixClip } from '../../core/api.models';
import { MusicStore } from '../music.store';
import { MAX_CLIP_GAIN } from '../music-validators';

type NumberField = 'start' | 'gain' | 'fade_in' | 'fade_out' | 'trim_start' | 'trim_end';

/**
 * The numbers of the selected clip: start, volume, fades, trims and mute,
 * and "Recortar silencios", which sets the trims from the range where the
 * file has sound (the server reads it). Errors show next to the field.
 */
@Component({
  selector: 'app-clip-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './clip-panel.component.html',
  styleUrl: './clip-panel.component.scss',
})
export class ClipPanelComponent {
  readonly mixIndex = input.required<number>();
  readonly clipIndex = input.required<number>();

  protected readonly store = inject(MusicStore);
  protected readonly maxGain = MAX_CLIP_GAIN;
  protected readonly busy = signal(false);
  protected readonly note = signal<string | null>(null);

  protected readonly clip = computed<MixClip | null>(() => this.store.mixes()[this.mixIndex()]?.clips[this.clipIndex()] ?? null);
  protected readonly errors = computed(() => this.store.mixValidation().mixes[this.mixIndex()]?.clipErrors[this.clipIndex()] ?? {});

  protected set(field: NumberField, raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.store.updateClip(this.mixIndex(), this.clipIndex(), { [field]: value === undefined || Number.isNaN(value) ? undefined : value });
  }

  protected setMute(mute: boolean): void {
    this.store.updateClip(this.mixIndex(), this.clipIndex(), { mute: mute || undefined });
  }

  protected remove(): void {
    this.store.removeClip(this.mixIndex(), this.clipIndex());
  }

  /** Sets trim_start and trim_end to the audible range of the file; nothing changes when it has no silence to trim. */
  protected async trimSilences(): Promise<void> {
    const clip = this.clip();
    const file = clip ? this.store.clipFile(clip) : null;
    this.note.set(null);
    if (!file) {
      this.note.set($localize`:@@mix.trimNoAudio:This clip has no audio yet: create the track first.`);
      return;
    }
    this.busy.set(true);
    try {
      const p = await this.store.peaks(file);
      if (!p) {
        this.note.set($localize`:@@mix.trimUnreadable:The audio cannot be read.`);
        return;
      }
      if (!p.active) {
        this.note.set($localize`:@@mix.trimSilent:The audio is all silence.`);
        return;
      }
      const from = p.active.start > 0.05 ? p.active.start : undefined;
      const to = p.active.end < p.duration - 0.05 ? p.active.end : undefined;
      if (from === undefined && to === undefined) {
        this.note.set($localize`:@@mix.trimNothing:There is no silence to trim at the ends.`);
        return;
      }
      this.store.updateClip(this.mixIndex(), this.clipIndex(), { trim_start: from, trim_end: to });
    } finally {
      this.busy.set(false);
    }
  }
}
