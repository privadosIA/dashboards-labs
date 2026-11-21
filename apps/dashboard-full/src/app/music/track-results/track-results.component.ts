import { ChangeDetectionStrategy, Component, ViewContainerRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MusicIssue, MusicManifestEntry } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { EXTEND_MAX_SECONDS, EXTEND_MIN_SECONDS, EXTEND_OVERLAP_SECONDS, MusicStore } from '../music.store';
import { STEMS, clock, lyricsDiffer, taskLabel } from '../music-options';
import { RepaintDialogComponent, RepaintDialogData } from '../wave/repaint-dialog.component';
import { SeparateDialogComponent, SeparateDialogData } from '../wave/separate-dialog.component';
import { TrackWaveComponent } from './track-wave.component';
import { VideoclipDialogComponent, VideoclipDialogData, VideoclipResult } from '../videoclip/videoclip-dialog.component';

/**
 * The songs a track exported, read from manifest.json: a player per
 * variant, what was actually sung (and, when the language model changed it,
 * what was asked for), the metadata that makes it reproducible, and the
 * actions on it — pin its seed, regenerate the track, download the file. A
 * file that no longer exists is shown as missing without breaking the rest.
 */
@Component({
  selector: 'app-track-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, AudioPlayerComponent, TrackWaveComponent],
  templateUrl: './track-results.component.html',
  styleUrl: './track-results.component.scss',
})
export class TrackResultsComponent {
  readonly trackId = input.required<string>();

  protected readonly store = inject(MusicStore);
  private readonly api = inject(ApiService);

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly vcr = inject(ViewContainerRef);

  protected readonly entries = computed(() => this.store.resultsOf(this.trackId()));
  /** The project's generator runs as a service (HeartMuLa, DiffRhythm2): it makes new songs only, so a song is not lengthened. */
  protected readonly newSongsOnly = computed(() => {
    const g = this.store.settings().generator;
    return g === 'heartmula' || g === 'diffrhythm2';
  });

  /** Variants whose file can be played: what A/B comparing switches between. */
  protected readonly comparable = computed(() => this.entries().filter((e) => !this.isMissing(e)));
  /** The track has several variants in the project, so one can be kept. */
  protected readonly canKeep = computed(() => (this.store.tracks().find((t) => t.id === this.trackId())?.variants ?? 1) > 1 && this.entries().length > 1);

  /** The variant (0-based) in the A/B player. */
  protected readonly compared = signal(0);
  protected readonly comparedEntry = computed(() => {
    const list = this.comparable();
    return list.find((e) => e.variant === this.compared()) ?? list[0] ?? null;
  });
  private readonly comparePlayer = viewChild<AudioPlayerComponent>('comparePlayer');
  private comparePosition = 0;

  protected onComparePosition(t: number | null): void {
    this.comparePosition = t ?? 0;
  }

  /** Switches the A/B player to another variant, at the same second and playing if it was. */
  protected compare(variant: number): void {
    if (variant === this.comparedEntry()?.variant) return;
    const player = this.comparePlayer();
    const at = this.comparePosition;
    const was = player?.isPlaying() ?? false;
    this.compared.set(variant);
    setTimeout(() => {
      const p = this.comparePlayer();
      p?.seek(at);
      if (was) p?.play();
    });
  }

  protected readonly favoriteTip = $localize`:@@music.favoriteTip:Mark as favorite (saved with the project)`;
  protected readonly unfavoriteTip = $localize`:@@music.unfavoriteTip:Remove from favorites`;

  /** A track was added that lengthens one of these songs: its index in the project, to open it. */
  readonly extended = output<number>();

  /** The song whose lengthening is being set up (by file), and the seconds to add. */
  protected readonly extending = signal<string | null>(null);
  protected readonly extra = signal(30);
  protected readonly extendMin = EXTEND_MIN_SECONDS;
  protected readonly extendMax = EXTEND_MAX_SECONDS;
  protected readonly overlap = EXTEND_OVERLAP_SECONDS;
  protected readonly extendValid = computed(() => this.extra() >= EXTEND_MIN_SECONDS && this.extra() <= EXTEND_MAX_SECONDS);

  protected toggleExtend(e: MusicManifestEntry): void {
    this.extending.set(this.extending() === e.file ? null : e.file);
  }

  protected setExtra(raw: string): void {
    this.extra.set(Number(raw));
  }

  protected async extend(e: MusicManifestEntry): Promise<void> {
    const index = await this.store.extendSong(e, this.extra());
    if (index < 0) return;
    this.extending.set(null);
    this.extended.emit(index);
  }

  /** Picks a part of a created song on its waveform and adds a track that repaints it; then opens that track. */
  protected async repaint(e: MusicManifestEntry): Promise<void> {
    const index = await firstValueFrom(
      this.dialog
        .open<RepaintDialogComponent, RepaintDialogData, number>(RepaintDialogComponent, {
          data: { entry: e },
          viewContainerRef: this.vcr, // the dialog sees this page's MusicStore
          width: '760px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (index !== undefined && index >= 0) this.extended.emit(index);
  }

  /** Ticks the instruments to take out of a created song and adds one extract track per instrument; then opens the first. */
  protected async separate(e: MusicManifestEntry): Promise<void> {
    const index = await firstValueFrom(
      this.dialog
        .open<SeparateDialogComponent, SeparateDialogData, number>(SeparateDialogComponent, {
          data: { from: e },
          viewContainerRef: this.vcr,
          width: '640px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (index !== undefined && index >= 0) this.extended.emit(index);
  }

  /** The tracks the last repaint or separation added, when this is the first of them and all have their songs: the offer to take them back. */
  protected readonly added = computed(() => {
    const a = this.store.lastAdded();
    if (!a || a.ids[0] !== this.trackId() || this.store.running()) return null;
    const songs = a.ids.reduce((n, id) => n + this.store.resultsOf(id).length, 0);
    return a.ids.every((id) => this.store.resultsOf(id).length > 0) ? { tracks: a.ids.length, songs } : null;
  });

  protected async removeAdded(): Promise<void> {
    const a = this.added();
    if (!a) return;
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@music.removeAddedTitle:Remove these tracks`,
        message: $localize`:@@music.removeAddedMessage:${a.tracks}:tracks: tracks and ${a.songs}:songs: songs are removed from the project. The song they came from is not touched. This cannot be undone.`,
        confirmLabel: $localize`:@@music.removeAddedAction:Remove`,
        destructive: true,
      }),
    );
    if (ok) await this.store.removeAdded();
  }

  protected async keep(e: MusicManifestEntry): Promise<void> {
    const drops = this.store.keepVariantDrops(e);
    const others = this.entries().length - 1;
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@music.keepTitle:Keep this version`,
        message:
          $localize`:@@music.keepMessage:The track keeps variant ${e.variant + 1}:variant: and the other ${others}:count: are deleted from the project when it is created again.` +
          (drops > 0 ? ' ' + $localize`:@@music.keepDrops:${drops}:count: mix clips that used other variants will be removed.` : ''),
        confirmLabel: $localize`:@@music.keepAction:Keep this one`,
        destructive: true,
      }),
    );
    if (ok) await this.store.keepVariant(e);
  }

  protected async remove(e: MusicManifestEntry): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@music.deleteSongTitle:Delete the song`,
        message: $localize`:@@music.deleteSongMessage:The audio «${this.fileName(e)}:file:» (variant ${e.variant + 1}:variant:) is deleted from the project. The track stays: you can create it again. This cannot be undone.`,
        confirmLabel: $localize`:@@music.deleteSongAction:Delete song`,
        destructive: true,
      }),
    );
    if (ok) await this.store.deleteSong(e);
  }

  /** The music video of this song: the dialog prepares and creates its project; then its editor (or its run) opens. */
  protected async videoclip(e: MusicManifestEntry): Promise<void> {
    const made = await firstValueFrom(
      this.dialog
        .open<VideoclipDialogComponent, VideoclipDialogData, VideoclipResult>(VideoclipDialogComponent, {
          width: '760px',
          maxWidth: '95vw',
          data: { projectId: this.store.projectId(), entry: e },
        })
        .afterClosed(),
    );
    if (!made) return;
    if (made.run) await this.router.navigate(['/runs', made.run]);
    else await this.router.navigate(['/projects', made.id, 'editor']);
  }

  protected url(e: MusicManifestEntry): string {
    return this.api.artifactUrl(this.store.projectId(), e.file);
  }

  protected coverUrl(e: MusicManifestEntry): string {
    return this.api.artifactUrl(this.store.projectId(), e.cover ?? '');
  }

  protected isMissing(e: MusicManifestEntry): boolean {
    return this.store.missing().has(e.file);
  }

  protected differs(e: MusicManifestEntry): boolean {
    return lyricsDiffer(e.lyrics_requested, e.lyrics_sung);
  }

  protected length(e: MusicManifestEntry): string {
    return clock(e.audio_seconds ?? e.duration_seconds);
  }

  /** What a problem found in a song means, in the interface language, with the measured value. */
  protected issueText(i: MusicIssue): string {
    const what = {
      clipping: $localize`:@@music.issueClipping:Sounds saturated: the peak reaches the maximum`,
      silence: $localize`:@@music.issueSilence:Has a long silence`,
      quiet: $localize`:@@music.issueQuiet:Sounds very quiet`,
      loud: $localize`:@@music.issueLoud:Sounds very loud`,
      duration: $localize`:@@music.issueDuration:Lasts differently from what was asked`,
    }[i.code];
    return `${what} (${i.detail})`;
  }

  /** Seconds into each song that is playing, by file: where its waveform draws the playhead. */
  protected readonly positions = signal<Record<string, number>>({});

  protected setPosition(e: MusicManifestEntry, t: number | null): void {
    this.positions.update((p) => ({ ...p, [e.file]: t ?? 0 }));
  }

  /** The instrument an extraction took out of its source, in the interface language; empty for any other task. */
  protected stemName(e: MusicManifestEntry): string {
    const stem = e.task === 'extract' ? e.params['track'] : undefined;
    return typeof stem === 'string' ? (STEMS.find((s) => s.value === stem)?.label ?? stem) : '';
  }

  protected taskName(e: MusicManifestEntry): string {
    return e.task ? taskLabel(e.task) : '';
  }

  protected fileName(e: MusicManifestEntry): string {
    return e.file.split('/').pop() ?? e.file;
  }

  protected models(e: MusicManifestEntry): string {
    return [e.lm_model, e.synth_model].filter((m): m is string => !!m).join(' + ');
  }
}
