import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { EditorStore } from '../../../editor.store';
import { ClipPickerComponent } from '../../../clip-picker/clip-picker.component';
import { MotionPageComponent } from '../../../motion-page/motion-page.component';
import { PicturePickerComponent } from '../../../picture-picker/picture-picker.component';
import { pictureModeOf } from '../../dynamic/scene-model.adapter';

/**
 * What goes with the picture mode of the scene on screen: the page of an animated
 * graphic, the picker of its own clip (with its trim and speed) or of its own
 * picture. A generated scene has none of them.
 */
@Component({
  selector: 'app-scene-picture-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClipPickerComponent, MotionPageComponent, PicturePickerComponent],
  templateUrl: './scene-picture-source.component.html',
  styleUrl: './scene-picture-source.component.scss',
})
export class ScenePictureSourceComponent {
  private readonly store = inject(EditorStore);

  protected readonly index = computed(() => this.store.selected());
  protected readonly scene = computed(() => this.store.config()?.scenes[this.index()]);
  protected readonly mode = computed(() => {
    const scene = this.scene();
    return scene ? pictureModeOf(scene) : 'ai';
  });
  protected readonly errors = computed(() => this.store.validation()?.scenes[this.index()] ?? {});

  protected patch(patch: Record<string, unknown>): void {
    this.store.updateScene(this.index(), patch);
  }
}
