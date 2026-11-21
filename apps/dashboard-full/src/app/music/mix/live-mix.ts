import { signal } from '@angular/core';

import { MixClip } from '../../core/api.models';
import { AudioPlayerService } from '../../core/audio-player.service';
import { GainRoute } from './audio-gain';
import { clipEnd, liveGain, usedRange } from './mix-utils';

/** One clip of the preview: its own `<audio>` element, and how loud it is. */
interface Voice {
  file: string;
  audio: HTMLAudioElement;
  route: GainRoute;
}

/** Seconds the playback of a clip may drift from where the mix says it should be before it is put back. */
const DRIFT = 0.2;

/**
 * The mix heard in the browser, without rendering it: every clip that is not
 * muted plays at its place on the timeline with its trims, volume and fades,
 * summed like the server's mix does (scaled by the mix's master volume, no
 * normalisation, then a limiter). Each
 * frame it reads the clips as they are now, so what the user edits is heard
 * at once. It is an approximation of the render (the browser's decoding and
 * the file the server writes are not bit for bit the same); «Mezclar» is still
 * what produces the file.
 */
export class LiveMix {
  /** Second of the mix being played or paused at; null when it is stopped. */
  readonly position = signal<number | null>(null);
  readonly playing = signal(false);

  private readonly voices = new Map<number, Voice>();
  private frame = 0;
  private last = 0;
  private pos = 0;
  private readonly stopper = () => this.pause();

  constructor(
    /** The clips as they are now. */
    private readonly clips: () => MixClip[],
    /** The URL a clip's audio is read from; null while its track has no song yet. */
    private readonly urlOf: (clip: MixClip) => string | null,
    private readonly players: AudioPlayerService,
    /** The mix's master volume, as it is now (1 leaves the clips as they are). */
    private readonly master: () => number = () => 1,
  ) {}

  /** Plays from where it is (or from the start, after the end). */
  play(): void {
    if (this.playing()) return;
    const from = this.position() ?? 0;
    this.pos = from >= this.end() ? 0 : from;
    this.players.claim(this.stopper);
    this.playing.set(true);
    this.syncVoices(false); // creates the elements, so their lengths start loading
    this.last = performance.now();
    this.position.set(this.pos);
    this.loop(this.last);
  }

  pause(): void {
    if (!this.playing()) return;
    this.halt();
    this.playing.set(false);
    for (const v of this.voices.values()) v.audio.pause();
  }

  /** Stops and forgets the position. */
  stop(): void {
    this.pause();
    this.position.set(null);
  }

  /** Moves to a second of the mix: it plays from there if it was playing. */
  seek(seconds: number): void {
    this.pos = Math.max(0, seconds);
    this.position.set(this.pos);
    this.last = performance.now();
    if (!this.playing()) this.syncVoices(false);
    else this.syncVoices(true);
  }

  /** Frees the elements. */
  dispose(): void {
    this.stop();
    for (const v of this.voices.values()) {
      v.audio.removeAttribute('src');
      v.audio.load();
    }
    this.voices.clear();
  }

  private halt(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.players.release(this.stopper);
  }

  /** The second where the last audible clip ends. */
  end(): number {
    let end = 0;
    for (const [i, c] of this.clips().entries()) {
      if (c.mute) continue;
      const d = this.voices.get(i)?.audio.duration;
      end = Math.max(end, clipEnd(c, Number.isFinite(d) ? (d as number) : null));
    }
    return end;
  }

  private loop = (now: number): void => {
    if (!this.playing()) return;
    this.pos += (now - this.last) / 1000;
    this.last = now;
    if (this.pos >= this.end()) {
      this.finish();
      return;
    }
    this.position.set(this.pos);
    this.syncVoices(true);
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(this.loop);
  };

  private finish(): void {
    this.halt();
    this.playing.set(false);
    for (const v of this.voices.values()) v.audio.pause();
    this.position.set(null);
  }

  private voice(i: number, clip: MixClip): Voice | null {
    const url = this.urlOf(clip);
    const have = this.voices.get(i);
    if (!url) {
      if (have) this.drop(i);
      return null;
    }
    if (have && have.file === url) return have;
    if (have) this.drop(i);
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    const route = new GainRoute(audio);
    route.attach();
    route.resume();
    const v = { file: url, audio, route };
    this.voices.set(i, v);
    return v;
  }

  private drop(i: number): void {
    const v = this.voices.get(i);
    if (!v) return;
    v.audio.pause();
    v.audio.removeAttribute('src');
    v.audio.load();
    this.voices.delete(i);
  }

  /** Puts every clip where the mix is: playing inside its part, paused outside it, at its level. */
  private syncVoices(playing: boolean): void {
    const clips = this.clips();
    for (const i of [...this.voices.keys()]) if (i >= clips.length) this.drop(i);
    clips.forEach((clip, i) => {
      if (clip.mute) {
        this.voices.get(i)?.audio.pause(); // a muted clip is neither heard nor loaded
        return;
      }
      const v = this.voice(i, clip);
      if (!v) return;
      const d = v.audio.duration;
      const { from, to, used } = usedRange(clip, Number.isFinite(d) ? d : null);
      const start = clip.start ?? 0;
      const inside = !clip.mute && this.pos >= start && this.pos < start + used;
      if (!inside) {
        if (!v.audio.paused) v.audio.pause();
        return;
      }
      const at = from + (this.pos - start);
      v.route.set(liveGain(clip, at, from, to) * Math.max(0, this.master()));
      if (!playing) return;
      if (v.audio.paused) {
        v.audio.currentTime = at;
        void v.audio.play().catch(() => undefined);
      } else if (Math.abs(v.audio.currentTime - at) > DRIFT) {
        v.audio.currentTime = at;
      }
    });
  }
}
