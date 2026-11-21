import { ChangeDetectionStrategy, Component, ViewContainerRef, computed, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { MusicManifestEntry, MusicTask, Track } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { SourceUrlComponent } from '../../shared/source-url/source-url.component';
import { MusicStore } from '../music.store';
import { SeparateDialogComponent, SeparateDialogData } from '../wave/separate-dialog.component';
import { RangePickerComponent } from '../wave/range-picker.component';
import { WaveRange } from '../wave/song-wave.component';
import { STEMS, TASKS } from '../music-options';
import { TrackErrors, TrackField } from '../music-validators';

type NumberField = 'cover_strength' | 'repaint_start' | 'repaint_end';

/**
 * What a track does with an existing song: a new song (nothing else shows),
 * a cover, a repaint or an extract. For a task it lets the user choose the
 * source among the project's sources, upload a file from the computer or use
 * an already exported song, and shows only the fields of that task.
 */
@Component({
  selector: 'app-track-task',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, AudioPlayerComponent, RangePickerComponent, SourceUrlComponent],
  templateUrl: './track-task.component.html',
  styleUrl: './track-task.component.scss',
})
export class TrackTaskComponent {
  readonly index = input.required<number>();

  protected readonly store = inject(MusicStore);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly vcr = inject(ViewContainerRef);

  protected readonly tasks = TASKS;
  protected readonly stems = STEMS;

  protected readonly track = computed<Track | undefined>(() => this.store.tracks()[this.index()]);
  protected readonly errors = computed<TrackErrors>(() => this.store.validation().tracks[this.index()] ?? {});
  protected readonly hint = computed(() => TASKS.find((t) => t.value === (this.track()?.task ?? ''))?.hint ?? '');

  /** Exported songs that can become a source: the ones whose file is still there. */
  protected readonly exported = computed(() => this.store.results().filter((e) => !this.store.missing().has(e.file)));

  /** A task transforms its source; a new song only takes an optional reference. */
  protected readonly field = computed<'source' | 'reference'>(() => (this.track()?.task ? 'source' : 'reference'));
  /** The audio file chosen in that field. */
  protected readonly current = computed(() => this.track()?.[this.field()] ?? '');

  /** The file is chosen but not among the project's files (it was deleted by hand). */
  protected readonly sourceMissing = computed(() => {
    const src = this.current();
    return !!src && !this.store.audioSources().some((s) => s.name === src);
  });

  /** The source as the project's file, and the version the waveform is kept under (its modification time). */
  protected readonly sourceFile = computed(() => `sources/${this.current()}`);
  protected readonly sourceVersion = computed(() => this.store.audioSources().find((s) => s.name === this.current())?.modified);

  /** Ticks the instruments to take out of the chosen source and adds a track per instrument (they show up in the list). */
  protected async separate(): Promise<void> {
    const source = this.store.audioSources().find((s) => s.name === this.current());
    if (!source) return;
    await firstValueFrom(
      this.dialog
        .open<SeparateDialogComponent, SeparateDialogData, number>(SeparateDialogComponent, {
          data: { from: source },
          viewContainerRef: this.vcr,
          width: '640px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
  }

  protected setRange(r: WaveRange): void {
    this.store.updateTrack(this.index(), { repaint_start: r.start, repaint_end: r.end });
  }

  protected sourceUrl(name: string): string {
    return this.api.artifactUrl(this.store.projectId(), `sources/${name}`);
  }

  protected error(field: TrackField): string | undefined {
    return this.errors()[field];
  }

  protected setTask(task: MusicTask | ''): void {
    this.store.setTask(this.index(), task);
  }

  protected setSource(name: string): void {
    this.store.updateTrack(this.index(), { [this.field()]: name || undefined });
  }

  protected setStem(stem: string): void {
    this.store.updateTrack(this.index(), { stem });
  }

  protected setNumber(field: NumberField, raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.store.updateTrack(this.index(), { [field]: value === undefined || Number.isNaN(value) ? undefined : value });
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    const name = await this.store.uploadSource(file);
    if (name) this.setSource(name);
  }

  protected async useUrlSource(name: string): Promise<void> {
    await this.store.loadSources();
    this.setSource(name);
  }

  protected async useExport(entry: MusicManifestEntry): Promise<void> {
    const name = await this.store.adoptExport(entry);
    if (name) this.setSource(name);
  }

  protected exportLabel(e: MusicManifestEntry): string {
    return `${e.file.split('/').pop()} (v${e.variant + 1})`;
  }

  protected exportKey(e: MusicManifestEntry): string {
    return e.file;
  }

  protected pickExport(file: string): void {
    const entry = this.exported().find((e) => e.file === file);
    if (entry) void this.useExport(entry);
  }
}
