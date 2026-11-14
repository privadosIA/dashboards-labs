import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ApiService } from '../../core/api.service';
import { EditorStore } from '../editor.store';

/**
 * The scene reel (design plan: the project's film strip). Scenes are a
 * sequence, so they are numbered, reorderable by drag & drop, and show
 * last-render thumbnails when the artifact exists. Long reels scroll in
 * a CDK virtual viewport.
 */
@Component({
  selector: 'app-scene-reel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag, CdkDragHandle, ScrollingModule, MatIconModule, MatButtonModule],
  templateUrl: './scene-reel.component.html',
  styleUrl: './scene-reel.component.scss',
})
export class SceneReelComponent {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(ApiService);

  protected readonly scenes = computed(() => this.store.config()?.scenes ?? []);

  protected thumbUrl(sceneId: string): string {
    return this.api.artifactUrl(this.store.projectId(), `tmp/scene_${sceneId}.png`);
  }

  protected onDrop(e: CdkDragDrop<unknown>): void {
    if (e.previousIndex !== e.currentIndex) {
      this.store.reorder(e.previousIndex, e.currentIndex);
    }
  }

  protected hasErrors(i: number): boolean {
    const errs = this.store.validation()?.scenes[i];
    return !!errs && Object.keys(errs).length > 0;
  }

  protected summary(i: number): string {
    const s = this.scenes()[i];
    if (!s) return '';
    const bits: string[] = [];
    if (s.silence_seconds != null) {
      bits.push(`∅ ${s.silence_seconds}s`);
    }
    if (s.motion && s.motion.type !== 'static') {
      bits.push(s.motion.type);
    }
    if (s.seed != null) {
      bits.push(`seed ${s.seed}`);
    }
    return bits.join(' · ');
  }
}
