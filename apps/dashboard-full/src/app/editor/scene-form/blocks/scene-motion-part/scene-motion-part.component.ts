import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PartParams, defaultParams } from '@lab/motion-parts';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../../../core/api.service';
import { MotionCatalogStore } from '../../../../core/motion-catalog.store';
import { AvailabilityStore } from '../../../../core/availability.store';
import { EditorStore } from '../../../editor.store';
import { MAX_MOTION_TEXT, MAX_MOTION_BPM, MIN_MOTION_BPM } from '../../dynamic/validations';
import type { SceneErrors } from '../../dynamic/validations';

/**
 * A scene drawn by a part of the music-motion catalog: the part (or `auto`, so the model chooses one from the description of
 * the animated-graphic field), its parameters drawn from the catalog by the shared form, one line of text and a tempo.
 * It patches the scene through the editor's store, as the other blocks do.
 */
@Component({
  selector: 'app-scene-motion-part',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, PartParams],
  templateUrl: './scene-motion-part.component.html',
  styleUrl: './scene-motion-part.component.scss',
})
export class SceneMotionPartComponent {
  /** What the editor's validation says about the scene's part, parameters, text and tempo. */
  readonly errors = input<SceneErrors>({});

  protected readonly store = inject(EditorStore);
  protected readonly catalog = inject(MotionCatalogStore);
  private readonly availability = inject(AvailabilityStore);
  private readonly api = inject(ApiService);

  protected readonly maxText = MAX_MOTION_TEXT;
  protected readonly minBpm = MIN_MOTION_BPM;
  protected readonly maxBpm = MAX_MOTION_BPM;

  protected readonly index = computed(() => this.store.selected());
  protected readonly scene = computed(() => this.store.config()?.scenes[this.index()]);
  /** The name chosen: '' = the way is chosen and no part is picked yet. */
  protected readonly choice = computed(() => this.scene()?.motion_part ?? '');
  /** The catalog's description of the part chosen, when it is a named one the catalog has. */
  protected readonly part = computed(() => (this.choice() && this.choice() !== 'auto' ? this.catalog.part(this.choice()) : undefined));
  /** `auto` needs the model that writes motion graphics (a scene that already says it keeps it). */
  protected readonly autoAllowed = computed(() => this.availability.available('motion_graphics') || this.choice() === 'auto');

  /** What the model chose for a scene made with `auto`, once a run has made it (its record in the project); null before. */
  protected readonly chosen = signal<{ part: string; params: string } | null>(null);

  constructor() {
    effect(() => {
      const scene = this.scene();
      const project = this.store.projectId();
      untracked(() => {
        this.chosen.set(null);
        if (scene?.motion_part === 'auto' && project) void this.readChoice(project, scene.id);
      });
    });
  }

  /** Reads the record of the choice; no record (a 404, or a run that fell back to a whole page) means nothing to show. */
  private async readChoice(project: string, sceneId: string): Promise<void> {
    try {
      const raw = await firstValueFrom(this.api.getArtifactJson<Record<string, unknown>>(project, `motion/${sceneId}.choice.json`));
      const part = raw['part'] ?? raw['motion_part'];
      const params = raw['params'] ?? raw['motion_params'];
      if (typeof part !== 'string' || part === '') return;
      if (this.scene()?.id !== sceneId) return;
      const list = params && typeof params === 'object' ? Object.entries(params as Record<string, unknown>).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ') : '';
      this.chosen.set({ part, params: list });
    } catch {
      this.chosen.set(null);
    }
  }

  protected patch(patch: Record<string, unknown>): void {
    this.store.updateScene(this.index(), patch);
  }

  /** Picks the part: a named one starts with its defaults; `auto` keeps a description to choose from and no parameters. */
  protected setPart(name: string): void {
    const scene = this.scene();
    if (!scene) return;
    if (name === 'auto') {
      this.patch({ motion_part: 'auto', motion_params: undefined, motion_graphic: scene.motion_graphic ?? '' });
      return;
    }
    const part = this.catalog.part(name);
    this.patch({ motion_part: name, motion_params: part ? defaultParams(part) : undefined, motion_graphic: undefined });
  }

  protected setParams(params: Record<string, unknown>): void {
    this.patch({ motion_params: params });
  }

  /** One line of text; empty is not written. */
  protected setText(value: string): void {
    this.patch({ motion_text: value === '' ? undefined : value });
  }

  /** The tempo; empty or not a number is not written. */
  protected setBpm(value: string): void {
    const n = value.trim() === '' ? NaN : Number(value);
    this.patch({ motion_bpm: Number.isFinite(n) ? n : undefined });
  }
}
