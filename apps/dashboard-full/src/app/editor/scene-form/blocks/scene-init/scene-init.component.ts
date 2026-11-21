import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { GenerationMetadata } from '../../../../core/api.models';
import { EnvironmentStore } from '../../../../core/environment.store';
import { EditEngineSelectComponent } from '../../../../shared/edit-engine-select/edit-engine-select.component';
import { SliderFieldComponent } from '../../../../shared/slider-field/slider-field.component';
import { EditorStore } from '../../../editor.store';
import { openMetadataDialog } from '../../../metadata-dialog/metadata-dialog.component';
import { PicturePickerComponent } from '../../../picture-picker/picture-picker.component';

/**
 * The picture a generated scene starts from (img2img): choosing it, how far the
 * result may depart from it, editing it by instruction when a model for that is
 * installed, and applying the generation settings the picture carried.
 */
@Component({
  selector: 'app-scene-init',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule, EditEngineSelectComponent, PicturePickerComponent, SliderFieldComponent],
  templateUrl: './scene-init.component.html',
  styleUrl: './scene-init.component.scss',
})
export class SceneInitComponent {
  /** What the editor's validation says about the starting picture. */
  readonly error = input<string>();

  protected readonly store = inject(EditorStore);
  private readonly env = inject(EnvironmentStore);
  private readonly dialog = inject(MatDialog);

  protected readonly index = computed(() => this.store.selected());
  protected readonly scene = computed(() => this.store.config()?.scenes[this.index()]);

  protected patch(patch: Record<string, unknown>): void {
    this.store.updateScene(this.index(), patch);
  }

  /** What the last applied generation settings overwrote, for the scene's «Deshacer». */
  protected readonly metaApplied = signal<{ id: string; note: string; undo: Record<string, unknown> } | null>(null);

  /** Starts or stops img2img: the starting picture and its strength go together. */
  protected setInit(on: boolean): void {
    // The choice between starting from the picture and editing it needs to know whether an editing model is installed.
    if (on) void this.store.loadCatalog();
    this.patch(on ? { init_image: '' } : { init_image: undefined, strength: undefined });
  }

  /**
   * The imported starting picture carried generation settings: offer them, and
   * apply the ones the user checks in one edit that «Deshacer» can restore.
   */
  protected async onMetadata(found: { name: string; metadata: GenerationMetadata }): Promise<void> {
    const scene = this.scene();
    if (!scene) return;
    const model = found.metadata.model;
    const sel = await firstValueFrom(
      openMetadataDialog(this.dialog, {
        metadata: found.metadata,
        hasPrompt: scene.prompt.trim() !== '',
        modelInstalled: model ? this.env.models().some((m) => m.name === model.split('/').pop()) : null,
      }),
    );
    if (!sel || Object.keys(sel).length === 0) return;
    const current = this.scene();
    if (!current || current.id !== scene.id) return; // the user moved to another scene meanwhile
    const patch: Record<string, unknown> = {};
    const parts: string[] = [];
    if (sel.prompt !== undefined) (patch['prompt'] = sel.prompt), parts.push('prompt');
    if (sel.negative_prompt !== undefined) (patch['negative_prompt'] = sel.negative_prompt), parts.push('negative_prompt');
    if (sel.seed !== undefined) (patch['seed'] = sel.seed), parts.push('seed');
    if (sel.steps !== undefined || sel.cfg_scale !== undefined) {
      const render = { ...current.render };
      if (sel.steps !== undefined) (render.steps = sel.steps), parts.push('steps');
      if (sel.cfg_scale !== undefined) (render.cfg_scale = sel.cfg_scale), parts.push('cfg_scale');
      patch['render'] = render;
    }
    const undo: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      const before = (current as unknown as Record<string, unknown>)[key];
      undo[key] = key === 'render' && before ? { ...(before as object) } : before;
    }
    this.patch(patch);
    this.metaApplied.set({ id: current.id, note: parts.join(' · '), undo });
  }

  protected undoMetadata(): void {
    const applied = this.metaApplied();
    if (!applied || applied.id !== this.scene()?.id) return;
    this.patch(applied.undo);
    this.metaApplied.set(null);
  }
}
