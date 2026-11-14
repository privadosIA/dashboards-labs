import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { ApiService } from '../../../../core/api.service';
import { EditorStore } from '../../../editor.store';

/**
 * The preview of a video scene: the clip every run keeps (out/clips/), then the
 * intermediate of a run that kept tmp/. The stage is the candidate being tried;
 * past the last one there is no clip.
 */
@Component({
  selector: 'app-scene-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './scene-preview.component.html',
  styleUrl: './scene-preview.component.scss',
})
export class ScenePreviewComponent {
  readonly sceneId = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly store = inject(EditorStore);
  private readonly attempt = signal<{ scene: string; stage: number } | null>(null);

  protected readonly stage = computed(() => {
    const a = this.attempt();
    return a && a.scene === this.sceneId() ? a.stage : 0;
  });

  protected readonly clipUrl = computed(() => {
    const path = this.stage() === 0 ? `out/clips/${this.sceneId()}.mp4` : `tmp/scene_${this.sceneId()}.mp4`;
    return this.api.artifactUrl(this.store.projectId(), path);
  });

  protected failed(): void {
    this.attempt.set({ scene: this.sceneId(), stage: this.stage() + 1 });
  }

  protected retry(): void {
    this.attempt.set(null);
  }
}
