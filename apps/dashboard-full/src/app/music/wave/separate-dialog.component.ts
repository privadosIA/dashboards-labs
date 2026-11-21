import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { MusicManifestEntry, SourceInfo } from '../../core/api.models';
import { MusicStore } from '../music.store';
import { durationText } from '../music-auto-plan';
import { STEMS } from '../music-options';

export interface SeparateDialogData {
  /** A song of the results, or a source of the project that has audio. */
  from: MusicManifestEntry | SourceInfo;
}

/**
 * "Separate into instruments": the stems the engine knows, to tick one or
 * more. Confirming adds one extract track per stem from the same audio,
 * creates them one after another and closes with the index of the first. It
 * says first that the extraction needs a synthesis model that is not the turbo
 * one (offering to switch the project to the Maximum level when its own is a
 * turbo one) and adds nothing when none is installed.
 */
@Component({
  selector: 'app-separate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, RouterLink],
  templateUrl: './separate-dialog.component.html',
  styleUrl: './separate-dialog.component.scss',
})
export class SeparateDialogComponent {
  protected readonly data = inject<SeparateDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SeparateDialogComponent, number>>(MatDialogRef);
  protected readonly store = inject(MusicStore);

  protected readonly stems = STEMS;
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  /** Seconds one extraction takes (ACE-Step at 50 steps, measured), to say how long the tracks will take. */
  private static readonly SECONDS_EACH = 10;
  /** More tracks than this get a line saying how many generations they are. */
  protected readonly manyTracks = 3;
  protected readonly count = computed(() => this.picked().size);
  protected readonly time = computed(() => durationText(this.count() * SeparateDialogComponent.SECONDS_EACH));
  /** The project's model is turbo and another is installed: offer to switch the project to the Maximum level. */
  protected readonly canSwitch = computed(() => this.store.synthIsTurbo() && this.store.separationModels().length > 0);
  protected readonly switchLevel = signal(true);
  protected readonly ready = computed(() => this.store.separationModels().length > 0);
  protected readonly name = computed(() => {
    const f = this.data.from;
    return 'track_id' in f ? (f.file.split('/').pop() ?? f.file) : f.name;
  });

  protected toggle(stem: string, on: boolean): void {
    this.picked.update((p) => {
      const next = new Set(p);
      if (on) next.add(stem);
      else next.delete(stem);
      return next;
    });
  }

  protected async confirm(): Promise<void> {
    if (this.canSwitch() && this.switchLevel()) this.store.useMaximumLevel();
    const ids = await this.store.separateSong(this.data.from, [...this.picked()]);
    if (ids.length === 0) return;
    void this.store.createTracks(ids); // one run after another in the studio while the window closes
    this.ref.close(this.store.tracks().findIndex((t) => t.id === ids[0]));
  }
}
