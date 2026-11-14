import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Mix, MixClip, PeaksResponse } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AudioPlayerService } from '../../core/audio-player.service';
import { MusicStore } from '../music.store';
import { ClipTrim, MixClipComponent } from './mix-clip.component';
import { GainRoute } from './audio-gain';
import { beatGrid, clipEnd, clock, liveGain, overlapFades, tickStep } from './mix-utils';

/** Pixels per second the zoom steps through. */
export const ZOOM_STEPS = [4, 8, 12, 20, 30, 50, 80, 120, 160];
/** Grid steps of the snap, in seconds; 0 is free. */
export const SNAP_STEPS = [0, 0.1, 0.5, 1, 5];

/**
 * The timeline of one mix: a time ruler and a row per clip. The waveform of
 * each clip comes from the server's peaks (read once per file). Each row has
 * a button to listen to that clip alone (its used part, at its volume, without
 * fades). It only edits the project through the store; the zoom and the snap
 * are view state.
 */
@Component({
  selector: 'app-mix-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MixClipComponent],
  templateUrl: './mix-timeline.component.html',
  styleUrl: './mix-timeline.component.scss',
})
export class MixTimelineComponent {
  readonly mix = input.required<Mix>();
  readonly mixIndex = input.required<number>();
  /** The selected clip of this mix, or null. */
  readonly selected = model<number | null>(null);
  /** Second of the rendered mix being played: a bar over every row; null hides it. */
  readonly playhead = input<number | null>(null);
  /** The user moved the mix bar (or clicked the ruler while no track plays alone): the second of the mix to play from. */
  readonly seek = output<number>();

  protected readonly store = inject(MusicStore);
  private readonly api = inject(ApiService);
  private readonly players = inject(AudioPlayerService);

  protected readonly px = signal(20);
  protected readonly snap = signal(1);
  /**
   * The tempo of the mix: the first song in it that has one. The grid can then
   * follow the beat and the bar, so a section lands exactly on the next.
   */
  protected readonly grid = computed(() => {
    for (const clip of this.mix().clips) {
      if (!clip.track) continue;
      const entry = this.store.resultsOf(clip.track).find((e) => e.variant === (clip.variant ?? 1) - 1);
      const g = beatGrid(entry?.bpm, entry?.timesignature);
      if (g) return g;
    }
    return null;
  });
  protected readonly snapOptions = computed(() => {
    const options = SNAP_STEPS.map((value) => ({ value, label: value === 0 ? 'libre' : `${value} s` }));
    const g = this.grid();
    if (g) {
      options.push({ value: g.beat, label: $localize`:@@mix.snapBeat:beat · ${g.bpm}:bpm: bpm` }, { value: g.bar, label: $localize`:@@mix.snapBar:bar · ${g.perBar}:perBar: beats` });
    }
    return options;
  });
  /** The snap follows the beat or the bar. */
  protected readonly followsBeat = computed(() => {
    const g = this.grid();
    return !!g && (this.snap() === g.beat || this.snap() === g.bar);
  });

  /** The tempo and pulse position of a clip's song, if it is a song of the project with a tempo. */
  private beatOf(clip: MixClip): { file: string; bpm: number } | null {
    if (!clip.track) return null;
    const file = this.store.clipFile(clip);
    const entry = this.store.resultsOf(clip.track).find((e) => e.variant === (clip.variant ?? 1) - 1);
    return file && entry?.bpm ? { file, bpm: entry.bpm } : null;
  }

  private readonly phases = signal<ReadonlyMap<string, number | null>>(new Map());
  private phaseRequested = new Set<string>();

  /**
   * What a clip anchors on when the snap follows the beat: where its song's
   * pulse falls when that could be found (and the song's beat), otherwise its
   * first audible sound. Nothing when the snap is in seconds.
   */
  protected anchorOf(clip: MixClip, peaks: PeaksResponse | null | undefined): { anchor: number; period: number } {
    if (!this.followsBeat()) return { anchor: 0, period: 0 };
    const b = this.beatOf(clip);
    const phase = b ? this.phases().get(`${b.file}|${b.bpm}`) : null;
    if (b && phase !== null && phase !== undefined) return { anchor: phase, period: 60 / b.bpm };
    return { anchor: peaks?.active?.start ?? 0, period: 0 };
  }

  /** Lines of the beat or bar grid behind the clips, when the snap follows one of them. */
  protected readonly gridLines = computed(() => {
    const g = this.grid();
    const step = this.snap();
    if (!g || (step !== g.beat && step !== g.bar) || step * this.px() < 6) return [];
    const lines: { x: number; bar: boolean }[] = [];
    for (let i = 0; i * g.beat <= this.seconds() && lines.length < 2000; i++) {
      if (step === g.bar && i % g.perBar !== 0) continue;
      lines.push({ x: i * g.beat * this.px(), bar: i % g.perBar === 0 });
    }
    return lines;
  });
  protected readonly clock = clock;

  private readonly peaksByFile = signal<ReadonlyMap<string, PeaksResponse | null>>(new Map());
  private requested = new Set<string>();

  protected readonly rows = computed(() =>
    this.mix().clips.map((clip, i) => {
      const file = this.store.clipFile(clip);
      const peaks = file ? this.peaksByFile().get(file) : null;
      return { clip, i, label: this.labelOf(clip), peaks, playable: !!file && peaks !== null };
    }),
  );

  protected readonly seconds = computed(() => {
    let end = 0;
    for (const r of this.rows()) end = Math.max(end, clipEnd(r.clip, r.peaks?.duration ?? null));
    return Math.max(30, Math.ceil(end + 10));
  });
  protected readonly width = computed(() => this.seconds() * this.px());
  protected readonly ticks = computed(() => {
    const step = tickStep(this.px());
    return Array.from({ length: Math.floor(this.seconds() / step) + 1 }, (_, i) => i * step);
  });

  /** The fades that would crossfade the clips that overlap, if any change. */
  protected readonly pendingCrossfades = computed(() =>
    overlapFades(
      this.mix().clips,
      this.rows().map((r) => r.peaks?.duration ?? null),
    ),
  );

  protected crossfade(): void {
    this.store.updateClips(this.mixIndex(), this.pendingCrossfades());
  }

  /** The row being listened to alone, or null. */
  protected readonly playing = signal<number | null>(null);
  protected readonly playLabel = $localize`:@@mix.play:Listen`;
  protected readonly stopLabel = $localize`:@@mix.stop:Stop`;
  protected readonly mixLabel = $localize`:@@mix.mixPosition:Mix position`;
  protected readonly soloLabel = $localize`:@@mix.soloPosition:Track position`;
  protected readonly crossfadeTip = $localize`:@@mix.crossfadeTip:Where a track starts before the previous one ends, the first fades out and the second fades in throughout the whole overlap. It can be undone.`;
  protected readonly noAudioLabel = $localize`:@@mix.playNoAudio:This track has no audio yet`;
  /** Second of the file being listened to alone (drives the small marker of its row). */
  private readonly soloTime = signal<number | null>(null);
  private frame = 0;
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');
  private audio: HTMLAudioElement | null = null;
  /** The level of what plays: Web Audio gain (up to 2) when allowed, the element's volume otherwise. */
  private route: GainRoute | null = null;
  /** Second of the file where the listening ends (the clip's trim_end), or null for the whole file. */
  private stopAt: number | null = null;

  /** Pixel of the mix bar, or null. */
  protected readonly playheadX = computed(() => {
    const t = this.playhead();
    return t === null ? null : t * this.px();
  });

  /** Pixel of the marker in the row being listened to alone: where the file's second falls on the timeline. */
  protected readonly soloX = computed(() => {
    const i = this.playing();
    const t = this.soloTime();
    const clip = i === null ? undefined : this.mix().clips[i];
    if (!clip || t === null) return null;
    const at = (clip.start ?? 0) + Math.max(0, t - (clip.trim_start ?? 0));
    return at * this.px();
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPreview());
    // What is changed on the track being listened to is heard at once: volume, fades and trims.
    effect(() => {
      this.mix();
      this.playing();
      untracked(() => this.applyLive());
    });
    // Keep the moving bar in view when it runs past the visible part.
    effect(() => {
      const x = this.playheadX() ?? this.soloX();
      const el = this.scroller()?.nativeElement;
      if (x === null || !el) return;
      if (x > el.scrollLeft + el.clientWidth - 24 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 48);
    });
    // The songs were read again (a run ended): their peaks may have changed.
    effect(() => {
      this.store.results();
      untracked(() => {
        this.requested = new Set();
        this.peaksByFile.set(new Map());
      });
    });
    // The songs were read again: their pulse may have changed.
    effect(() => {
      this.store.results();
      untracked(() => {
        this.phaseRequested = new Set();
        this.phases.set(new Map());
      });
    });
    // While the snap follows the beat, find where each song's pulse falls (once per song and tempo).
    effect(() => {
      this.phases();
      if (!this.followsBeat()) return;
      for (const clip of this.mix().clips) {
        const b = this.beatOf(clip);
        const key = b ? `${b.file}|${b.bpm}` : '';
        if (b && !this.phaseRequested.has(key)) {
          this.phaseRequested.add(key);
          void this.store.beatPhase(b.file, b.bpm).then((p) => this.phases.update((m) => new Map(m).set(key, p)));
        }
      }
    });
    // Ask for the peaks of each clip's file once.
    effect(() => {
      this.peaksByFile(); // re-run when a load ends or the map is reset
      for (const clip of this.mix().clips) {
        const file = this.store.clipFile(clip);
        if (file && !this.requested.has(file)) {
          this.requested.add(file);
          void this.store.peaks(file).then((p) => this.peaksByFile.update((m) => new Map(m).set(file, p)));
        }
      }
    });
  }

  /** Listens to one clip alone; asking again for the one that plays stops it. */
  protected preview(i: number): void {
    if (this.playing() === i) {
      this.stopPreview();
      return;
    }
    const clip = this.mix().clips[i];
    const file = clip && this.store.clipFile(clip);
    if (!file) return;
    this.stopPreview();
    const audio = (this.audio ??= this.createAudio());
    const from = Math.max(0, clip.trim_start ?? 0);
    this.stopAt = clip.trim_end ?? null;
    audio.src = this.api.artifactUrl(this.store.projectId(), file);
    (this.route ??= new GainRoute(audio)).attach();
    audio.addEventListener(
      'loadedmetadata',
      () => {
        audio.currentTime = from;
        this.route?.resume();
        void audio.play().catch(() => this.playing.set(null));
      },
      { once: true },
    );
    this.playing.set(i);
    this.applyLive();
  }

  /**
   * Applies the clip's current numbers to what is playing: volume and fades
   * (every frame), the end of the used part, and a start moved past the playhead.
   * The clip is read from the project as it is now, so an edit is heard at once.
   */
  private applyLive(): void {
    const i = this.playing();
    const audio = this.audio;
    const clip = i === null ? undefined : this.mix().clips[i];
    if (!audio || !clip) return;
    const length = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const from = Math.max(0, clip.trim_start ?? 0);
    const to = Math.min(clip.trim_end ?? length, length);
    this.stopAt = clip.trim_end ?? null;
    if (audio.currentTime < from - 0.05) audio.currentTime = from;
    const gain = liveGain(clip, audio.currentTime, from, to);
    this.route?.set(gain);
    if (this.stopAt !== null && audio.currentTime >= this.stopAt) this.stopPreview();
  }

  private createAudio(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('play', () => this.players.started(audio));
    audio.addEventListener('timeupdate', () => {
      this.soloTime.set(audio.currentTime);
      this.applyLive();
    });
    audio.addEventListener('play', () => this.follow());
    for (const ev of ['ended', 'pause', 'error']) {
      audio.addEventListener(ev, () => {
        this.players.stopped(audio);
        this.playing.set(null);
      });
    }
    return audio;
  }

  // --- moving what is playing ----------------------------------------------------

  /** Second of the timeline under a pointer. */
  private secondsAt(clientX: number): number {
    const left = this.canvas()?.nativeElement.getBoundingClientRect().left ?? 0;
    return Math.max(0, (clientX - left) / this.px());
  }

  /** Moves the mix bar, or the marker of the track that plays alone, to a second of the timeline. */
  private seekTo(kind: 'mix' | 'solo', at: number): void {
    if (kind === 'mix') {
      this.seek.emit(at);
      return;
    }
    const i = this.playing();
    const clip = i === null ? undefined : this.mix().clips[i];
    const audio = this.audio;
    if (!clip || !audio) return;
    const from = Math.max(0, clip.trim_start ?? 0);
    const length = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const to = Math.min(clip.trim_end ?? length, length);
    // The second of the file that sits at `at` on the timeline, kept inside the part the clip uses.
    const t = Math.max(from, Math.min(to - 0.05, from + (at - (clip.start ?? 0))));
    audio.currentTime = t;
    this.soloTime.set(t);
  }

  /** Drags a bar: the sound follows the pointer while it moves. */
  protected dragStart(ev: PointerEvent, kind: 'mix' | 'solo'): void {
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture?.(ev.pointerId);
    const move = (e: PointerEvent) => this.seekTo(kind, this.secondsAt(e.clientX));
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    move(ev);
  }

  /** A click on the ruler plays from there: the track that is playing alone, else the mix. */
  protected rulerClick(ev: MouseEvent): void {
    this.seekTo(this.playing() !== null ? 'solo' : 'mix', this.secondsAt(ev.clientX));
  }

  /** Arrow keys on a bar: a second, ten with shift. */
  protected nudge(ev: KeyboardEvent, kind: 'mix' | 'solo'): void {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const step = (ev.shiftKey ? 10 : 1) * (ev.key === 'ArrowRight' ? 1 : -1);
    const x = kind === 'mix' ? this.playheadX() : this.soloX();
    this.seekTo(kind, Math.max(0, (x ?? 0) / this.px() + step));
  }

  /** Moves the marker every frame while the clip plays (timeupdate alone is too coarse). */
  private follow = (): void => {
    if (!this.audio || this.audio.paused || typeof requestAnimationFrame !== 'function') return;
    this.soloTime.set(this.audio.currentTime);
    this.applyLive();
    this.frame = requestAnimationFrame(this.follow);
  };

  private stopPreview(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.soloTime.set(null);
    if (this.audio) {
      this.audio.pause();
      this.players.stopped(this.audio);
    }
    this.playing.set(null);
  }

  protected labelOf(clip: MixClip): string {
    if (clip.file) return clip.file;
    return clip.variant && clip.variant > 1 ? `${clip.track} · v${clip.variant}` : (clip.track ?? '');
  }

  protected zoom(direction: 1 | -1): void {
    const i = ZOOM_STEPS.indexOf(this.px());
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 3 : i) + direction))];
    this.px.set(next);
  }

  protected setSnap(value: string): void {
    this.snap.set(Number(value));
  }

  protected move(clip: number, start: number): void {
    this.store.updateClip(this.mixIndex(), clip, { start: start > 0 ? start : undefined });
    this.selected.set(clip);
  }

  protected trim(clip: number, t: ClipTrim): void {
    const patch: Partial<MixClip> = {};
    if ('trim_start' in t) patch.trim_start = t.trim_start;
    if ('trim_end' in t) patch.trim_end = t.trim_end;
    if ('start' in t) patch.start = t.start && t.start > 0 ? t.start : undefined;
    this.store.updateClip(this.mixIndex(), clip, patch);
    this.selected.set(clip);
  }
}
