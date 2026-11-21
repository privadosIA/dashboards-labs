import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { MusicManifestEntry } from '../../core/api.models';
import { MusicStore } from '../music.store';
import { RangePickerComponent } from './range-picker.component';
import { WaveRange } from './song-wave.component';

export interface RepaintDialogData {
  entry: MusicManifestEntry;
}

/** The generators that make new songs only: a song of theirs repainted here sounds like the one that repaints. */
const OTHER_ENGINES = ['heartmula', 'diffrhythm2'];

/**
 * "Repaint this part": the song as a waveform on which the user picks the part
 * to redo and hears it. Confirming adds a repaint track to the project (the
 * song is copied to the sources), creates it alone and closes with that track's
 * index; the run shows in the studio.
 */
@Component({
  selector: 'app-repaint-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, RangePickerComponent],
  templateUrl: './repaint-dialog.component.html',
  styleUrl: './repaint-dialog.component.scss',
})
export class RepaintDialogComponent {
  protected readonly data = inject<RepaintDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RepaintDialogComponent, number>>(MatDialogRef);
  protected readonly store = inject(MusicStore);

  protected readonly range = signal<WaveRange | null>(null);
  /** The song was made by another engine: the repainted part will sound like ACE-Step's. */
  protected readonly otherEngine = computed(() => OTHER_ENGINES.includes(this.data.entry.synth_model));
  protected readonly name = computed(() => this.data.entry.file.split('/').pop() ?? this.data.entry.file);

  protected async confirm(): Promise<void> {
    const r = this.range();
    if (!r) return;
    const id = await this.store.repaintSong(this.data.entry, r);
    if (!id) return;
    void this.store.createTracks([id]); // the run goes on in the studio while the window closes
    this.ref.close(this.store.tracks().findIndex((t) => t.id === id));
  }
}
