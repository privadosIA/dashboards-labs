import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MixClip } from '../../core/api.models';
import { MAX_CLIP_GAIN } from '../music-validators';
import { ApiService } from '../../core/api.service';
import { AudioPlayerService } from '../../core/audio-player.service';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { MusicStore } from '../music.store';
import { LiveMix } from './live-mix';
import { ClipPanelComponent } from './clip-panel.component';
import { MixTimelineComponent } from './mix-timeline.component';
import { NORMALIZE_LUFS, estimateLoudness, mixIsCurrent, usedRange } from './mix-utils';

/** One choice of the "Add track" menu: a track song or a source of the project. */
export interface ClipChoice {
  label: string;
  clip: MixClip;
  /** The song is marked as a favorite. */
  favorite?: boolean;
}

/**
 * One mix: its name, the clips (added from the project's songs and sources),
 * the timeline with the selected clip's numbers, and the render. «Mezclar»
 * saves the edits and runs the project restricted to this mix; the rendered
 * file is played when it matches the clips on screen.
 */
@Component({
  selector: 'app-mix-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    AudioPlayerComponent,
    ClipPanelComponent,
    MixTimelineComponent,
    DecimalPipe,
  ],
  templateUrl: './mix-editor.component.html',
  styleUrl: './mix-editor.component.scss',
})
export class MixEditorComponent {
  readonly index = input.required<number>();

  protected readonly store = inject(MusicStore);
  private readonly api = inject(ApiService);
  protected readonly selected = signal<number | null>(null);
  private readonly player = viewChild(AudioPlayerComponent);
  /** Second of the rendered mix the player is at, drawn as a bar over the timeline; null when it is not playing. */
  protected readonly mixTime = signal<number | null>(null);

  private readonly players = inject(AudioPlayerService);
  protected readonly maxGain = MAX_CLIP_GAIN;
  protected readonly normalizeTip = $localize`:@@mix.normalizeTip:Raises or lowers the volume of the whole mix to −14 LUFS, the level of music platforms, whatever the sum of the track volumes. In “Listen without mixing” it is approximated from each track's loudness (it may be off by a couple of dB); the file produced by “Mix” is the exact one and shows its loudness.`;
  protected readonly undoTip = $localize`:@@mix.undoTip:Undo (Ctrl+Z)`;
  protected readonly redoTip = $localize`:@@mix.redoTip:Redo (Ctrl+Shift+Z)`;
  protected readonly liveTip = $localize`:@@mix.liveTip:Listen to all the tracks together right here, with changes applied instantly, without rendering. It is an approximation: the file is produced by “Mix”.`;

  /** The mix heard in the browser without rendering it: every track together, with the edits applied at once. */
  protected readonly live = new LiveMix(
    () => this.mix()?.clips ?? [],
    (clip) => {
      const file = this.store.clipFile(clip);
      return file ? this.api.artifactUrl(this.store.projectId(), file) : null;
    },
    this.players,
    () => this.previewGain(),
  );

  /** Loudness and length of the files the clips play, read once each (for the normalisation estimate). */
  private readonly audio = signal<ReadonlyMap<string, { lufs: number | null; seconds: number | null }>>(new Map());
  private audioAsked = new Set<string>();

  /**
   * What the preview scales the clips by. Without normalisation, the mix's
   * master volume. With it, the factor that would bring the mix to the target
   * loudness, estimated from the loudness of each clip's file (an
   * approximation; the file «Mezclar» writes is exact), or the master volume
   * while that is not known yet.
   */
  protected readonly previewGain = computed(() => {
    const m = this.mix();
    const master = m?.gain ?? 1;
    if (!m?.normalize) return master;
    const parts = [];
    for (const clip of m.clips) {
      if (clip.mute) continue;
      const file = this.store.clipFile(clip);
      if (!file) continue;
      const a = this.audio().get(file);
      if (!a) return master; // still being read
      if (a.lufs === null || a.seconds === null) continue; // silent or unreadable: it adds nothing
      const { used } = usedRange(clip, a.seconds);
      parts.push({ start: clip.start ?? 0, used, lufs: a.lufs, gain: clip.gain ?? 1 });
    }
    const loudness = estimateLoudness(parts);
    return loudness === null ? master : Math.min(8, 10 ** ((NORMALIZE_LUFS - loudness) / 20));
  });

  /** There is something to hear: a track that is not muted and whose song exists. */
  protected readonly canPreview = computed(() => (this.mix()?.clips ?? []).some((c) => !c.mute && !!this.store.clipFile(c)));

  /** Where the bar over the timeline is: the preview while it plays, otherwise the rendered mix, otherwise where the preview stopped. */
  protected readonly playhead = computed(() => (this.live.playing() ? this.live.position() : (this.mixTime() ?? this.live.position())));

  protected togglePreview(): void {
    if (this.live.playing()) this.live.pause();
    else this.live.play();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.live.dispose());
    // The player goes away when the clips change: so does its bar.
    effect(() => {
      if (!this.current()) this.mixTime.set(null);
    });
    // The songs were read again: what was measured of them may have changed.
    effect(() => {
      this.store.results();
      untracked(() => {
        this.audioAsked = new Set();
        this.audio.set(new Map());
      });
    });
    // While the mix is normalised, measure what its clips play (once per file).
    effect(() => {
      this.audio();
      const m = this.mix();
      if (!m?.normalize) return;
      for (const clip of m.clips) {
        const file = clip.mute ? null : this.store.clipFile(clip);
        if (!file || this.audioAsked.has(file)) continue;
        this.audioAsked.add(file);
        void Promise.all([this.store.loudness(file), this.store.peaks(file)]).then(([lufs, peaks]) =>
          this.audio.update((a) => new Map(a).set(file, { lufs, seconds: peaks?.duration ?? null })),
        );
      }
    });
  }

  protected readonly mix = computed(() => this.store.mixes()[this.index()]);
  protected readonly errors = computed(() => this.store.mixValidation().mixes[this.index()]);
  protected readonly serverIssues = computed(() => this.store.serverMixIssues().filter((e) => e.mixId === this.mix()?.id));

  /** The songs the project has made (every exported variant), then its audio sources. */
  protected readonly songChoices = computed<ClipChoice[]>(() =>
    this.store
      .results()
      .map((e) => {
        const multi = this.store.tracks().find((t) => t.id === e.track_id)?.variants ?? 1;
        const clip: MixClip = e.variant === 0 ? { track: e.track_id } : { track: e.track_id, variant: e.variant + 1 };
        return { label: multi > 1 ? `${e.track_id} · v${e.variant + 1}` : e.track_id, clip, favorite: this.store.isFavorite(e) };
      })
      // Favorites first: they are the ones worth mixing.
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.label.localeCompare(b.label)),
  );
  protected readonly sourceChoices = computed<ClipChoice[]>(() =>
    this.store
      .sources()
      .filter((s) => s.kind === 'audio')
      .map((s) => ({ label: s.name, clip: { file: s.name } })),
  );

  protected readonly result = computed(() => this.store.mixResult(this.mix()?.id ?? ''));
  protected readonly outdated = computed(() => this.store.mixOutdated(this.mix()?.id ?? ''));
  protected readonly current = computed(() => !this.store.dirty() && mixIsCurrent(this.mix(), this.result()) && !this.outdated());
  protected readonly resultUrl = computed(() => {
    const r = this.result();
    return r ? this.api.artifactUrl(this.store.projectId(), r.file) : '';
  });
  protected readonly mixing = computed(() => this.store.running() && this.store.runOnly() === this.mix()?.id);
  /** Clips that play a track no song has been made for yet. */
  protected readonly missingSongs = computed(() =>
    this.mix().clips.filter((c) => !c.mute && c.track && !this.store.clipFile(c)).map((c) => c.track as string),
  );
  protected readonly canMix = computed(() => {
    const m = this.mix();
    return (
      !this.store.running() &&
      m.clips.some((c) => !c.mute) &&
      !(this.errors()?.id || this.errors()?.clips || this.errors()?.clipErrors.some((e) => Object.keys(e).length > 0)) &&
      !(this.store.dirty() && !this.store.canSave())
    );
  });

  /** The bar was dragged (or the ruler clicked): the rendered mix plays from there. */
  protected seekMix(seconds: number): void {
    // The rendered mix when that is what is being played or paused; the preview otherwise (even before anything is rendered).
    if (!this.live.playing() && this.mixTime() !== null && this.player()) this.player()!.seek(seconds);
    else this.live.seek(seconds);
  }

  protected setMasterGain(raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.store.updateMix(this.index(), { gain: value === undefined || Number.isNaN(value) ? undefined : value });
  }

  protected rename(id: string): void {
    this.store.renameMix(this.index(), id.trim());
  }

  protected add(choice: ClipChoice): void {
    const at = this.mix().clips.length;
    this.store.addClip(this.index(), { ...choice.clip }); // at second 0: drag it to place it
    this.selected.set(at);
  }

  protected remove(): void {
    this.store.removeMix(this.index());
  }

  protected mixNow(): void {
    void this.store.mixNow(this.mix().id);
  }

  protected markMissing(): void {
    const r = this.result();
    if (r) this.store.markMissing(r.file);
  }

  /** "1 pista" / "3 pistas". */
  protected tracksLabel(n: number): string {
    return n === 1 ? $localize`:@@music.oneTrack:1 track` : $localize`:@@music.manyTracks:${n}:count: tracks`;
  }
}
