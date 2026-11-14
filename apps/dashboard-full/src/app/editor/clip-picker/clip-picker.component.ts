import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { KeptClip } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ClipTrimComponent } from '../clip-trim/clip-trim.component';
import { EditorStore } from '../editor.store';

/** The value of the option of a clip another project kept. */
const KEPT = 'kept:';

/**
 * Chooses a scene's own clip: a video of the project's sources, one the other
 * projects kept (it is copied, so the scene does not depend on that project),
 * or an upload. It only reports the chosen file name.
 */
@Component({
  selector: 'app-clip-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, ClipTrimComponent],
  templateUrl: './clip-picker.component.html',
  styleUrl: './clip-picker.component.scss',
})
export class ClipPickerComponent implements OnInit {
  /** The chosen file name; '' while nothing is chosen. */
  readonly value = input('');
  readonly error = input<string | undefined>(undefined);
  /** The part of the clip the scene uses, in seconds; undefined = from the start / to the end of the file. */
  readonly start = input<number | undefined>(undefined);
  readonly end = input<number | undefined>(undefined);
  readonly speed = input<number | undefined>(undefined);
  readonly trimError = input<string | undefined>(undefined);
  readonly speedError = input<string | undefined>(undefined);
  readonly picked = output<string>();
  readonly trimmed = output<{ clip_start?: number; clip_end?: number; clip_speed?: number }>();

  protected readonly store = inject(EditorStore);
  private readonly api = inject(ApiService);

  /** Where the last chosen clip was copied from, to say it is a copy. */
  protected readonly copiedFrom = signal<string | null>(null);

  protected readonly videos = this.store.videoSources;
  protected readonly unused = this.store.unusedVideos;
  protected readonly kept = this.store.keptClips;
  protected readonly missing = computed(() => {
    const v = this.value();
    return !!v && this.store.sourcesLoaded() && !this.videos().some((s) => s.name === v);
  });

  ngOnInit(): void {
    void this.store.loadKeptClips();
  }

  protected keptValue(c: KeptClip): string {
    return `${KEPT}${c.kind ?? 'clip'}:${c.project}/${c.scene}`;
  }

  protected keptLabel(c: KeptClip): string {
    const name = `${c.project} · ${c.scene}`;
    if (c.kind === 'animation') return `${name} · ${this.animationNote}`;
    return c.motion ? `${name} · ${c.motion}` : name;
  }

  private readonly animationNote = $localize`:@@clip.wholeAnimation:complete animation (forward and back)`;

  protected url(name: string): string {
    return this.api.artifactUrl(this.store.projectId(), `sources/${name}`);
  }

  protected async choose(value: string): Promise<void> {
    if (!value.startsWith(KEPT)) {
      this.copiedFrom.set(null);
      this.picked.emit(value);
      return;
    }
    const clip = this.kept().find((c) => this.keptValue(c) === value);
    if (!clip) return;
    const name = await this.store.useKeptClip(clip);
    if (name) {
      this.copiedFrom.set(clip.project);
      this.picked.emit(name);
    }
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = await this.store.uploadClip(file);
    if (name) {
      this.copiedFrom.set(null);
      this.picked.emit(name);
    }
  }

  protected async remove(name: string): Promise<void> {
    await this.store.deleteSource(name);
  }
}
