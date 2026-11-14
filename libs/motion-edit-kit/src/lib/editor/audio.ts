import { InjectionToken } from '@angular/core';
import type { ClockAudio } from '@lab/motion-editor';

/** Makes the audio element of a song from its address. A test provides its own, so no sound is made. */
export type AudioFactory = (src: string) => ClockAudio;

export const AUDIO_FACTORY = new InjectionToken<AudioFactory>('AUDIO_FACTORY', {
  providedIn: 'root',
  factory: () => (src: string) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = src;
    return audio;
  },
});
