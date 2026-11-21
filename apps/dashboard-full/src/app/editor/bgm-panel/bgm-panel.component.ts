import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { BackgroundMusic } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { SourceUrlComponent } from '../../shared/source-url/source-url.component';
import { EditorStore } from '../editor.store';

type Kind = 'none' | 'prompt' | 'file';
type NumberField = 'volume' | 'fade_seconds' | 'seed';

/**
 * The background music of a video project: none, a soundtrack generated from
 * a prompt, or an audio file of the project (uploaded here). The mix itself
 * (ducking under the narration, fades, loudness) is the pipeline's; this only
 * sets what it needs. Choosing none removes the block from the file.
 */
@Component({
  selector: 'app-bgm-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AudioPlayerComponent,
    SourceUrlComponent,
  ],
  templateUrl: './bgm-panel.component.html',
  styleUrl: './bgm-panel.component.scss',
})
export class BgmPanelComponent {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(ApiService);

  protected readonly bgm = computed(() => this.store.config()?.bgm);
  protected readonly kind = computed<Kind>(() => {
    const b = this.bgm();
    if (!b) return 'none';
    return b.file !== undefined && b.prompt === undefined ? 'file' : 'prompt';
  });
  /** The server's rejection about this block, shown here instead of only at the top. */
  protected readonly serverMessage = computed(() => {
    const m = this.store.serverError()?.message ?? '';
    return m.split('\n').filter((l) => l.includes('bgm')).join('\n');
  });
  protected readonly summary = computed(() => {
    switch (this.kind()) {
      case 'prompt':
        return $localize`:@@bgm.summaryPrompt:generated`;
      case 'file':
        return this.bgm()?.file || $localize`:@@bgm.summaryFile:file`;
      default:
        return $localize`:@@bgm.summaryNone:none`;
    }
  });
  protected readonly fileMissing = computed(() => {
    const f = this.bgm()?.file;
    return !!f && !this.store.audioSources().some((s) => s.name === f);
  });

  protected fileUrl(name: string): string {
    return this.api.artifactUrl(this.store.projectId(), `sources/${name}`);
  }

  protected setKind(kind: Kind): void {
    this.store.setBGMKind(kind);
  }

  protected patch(p: Partial<BackgroundMusic>): void {
    this.store.updateBGM(p);
  }

  protected setNumber(field: NumberField, raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.patch({ [field]: value === undefined || Number.isNaN(value) ? undefined : value });
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = await this.store.uploadSource(file);
    if (name) this.patch({ file: name });
  }

  protected async useUrlSource(name: string): Promise<void> {
    await this.store.loadSources();
    this.patch({ file: name });
  }
}
