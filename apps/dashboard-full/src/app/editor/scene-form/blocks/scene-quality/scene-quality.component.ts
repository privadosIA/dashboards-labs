import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EnvironmentStore } from '../../../../core/environment.store';
import { pictureLimitFor } from '../../../auto-plan';
import { EditorStore } from '../../../editor.store';
import { TIERS, Tier, activeSceneTier, fitResolution, loadOverrides, sceneTierValues, tierLabel } from '../../../quality-tiers';

/**
 * The quality of the scene on screen: the levels that fill it in, what the last
 * one wrote (with «Deshacer»), and the scene's own resolution, steps and
 * animation settings as a form. A scene that sets nothing follows the project.
 */
@Component({
  selector: 'app-scene-quality',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatExpansionModule, MatIconModule, MatTooltipModule],
  templateUrl: './scene-quality.component.html',
  styleUrl: './scene-quality.component.scss',
})
export class SceneQualityComponent {
  /** The schema of the fields inside the panel. */
  readonly schema = input.required<DfFormSchema>();
  readonly model = input.required<Record<string, unknown>>();
  /** The facts the schema's `ctx.*` conditions read. */
  readonly context = input<Record<string, unknown>>({});
  /** What the editor's validation says about the scene's quality. */
  readonly error = input<string>();

  readonly formChange = output<unknown>();
  readonly formStatus = output<void>();

  protected readonly store = inject(EditorStore);
  private readonly env = inject(EnvironmentStore);

  protected readonly index = computed(() => this.store.selected());
  private readonly scene = computed(() => this.store.config()?.scenes[this.index()]);
  private readonly videoMode = computed(() => this.store.config()?.output.mode !== 'images');
  /** The scene animates, so its animation settings apply (Wan, or AnimateDiff when the project uses it). */
  private readonly animates = computed(() => this.videoMode() && !!this.scene()?.animate);
  private readonly engineLabel = computed(() => (this.store.config()?.defaults.animate?.engine === 'animatediff' ? 'AnimateDiff' : 'Wan'));

  /** The levels, with what each would write for this scene (from the project's model preset, never from the scene's own values). */
  protected readonly tiers = computed(() => {
    const cfg = this.store.config();
    const images = !this.videoMode();
    const animates = this.animates();
    return TIERS.map((tier) => {
      const v = cfg ? sceneTierValues(cfg, tier, this.store.catalog(), loadOverrides()) : null;
      const limit = this.pictureLimit();
      const parts: string[] = v ? [limit ? fitResolution(v.resolution, limit) : v.resolution, $localize`:@@tier.noteSteps:${v.steps} steps`] : [];
      if (v && images) parts.push($localize`:@@tier.noteVariants:${v.variants} variants`);
      if (v && animates) parts.push(`${this.engineLabel()} ${v.wanResolution} · ${v.wanFrames} f · ${v.wanSteps}`);
      return { tier, label: tierLabel(tier), text: parts.join(' · ') };
    });
  });

  /** The level this scene is at (shown pressed), or null when it follows the project. */
  protected readonly activeTier = computed(() => {
    const cfg = this.store.config();
    return cfg ? activeSceneTier(cfg, this.index(), this.store.catalog(), loadOverrides(), this.pictureLimit()) : null;
  });

  protected readonly ownQuality = computed(() => {
    const s = this.scene();
    return !!s && (!!s.render || !!s.animation);
  });

  /** The header's summary: what the scene sets, or that it follows the project. */
  protected readonly qualitySummary = computed(() => {
    const s = this.scene();
    if (!s || !this.ownQuality()) return $localize`:@@sceneQ.asProject:same as project`;
    const parts: string[] = [];
    if (s.render?.resolution) parts.push(s.render.resolution);
    if (s.render?.steps) parts.push($localize`:@@tier.noteSteps:${s.render.steps} steps`);
    if (s.render?.cfg_scale != null) parts.push(`cfg ${s.render.cfg_scale}`);
    if (this.animates() && s.animation) {
      const a = s.animation;
      parts.push(`${this.engineLabel()} ${[a.resolution, a.frames ? `${a.frames} f` : '', a.steps ?? ''].filter(Boolean).join(' · ')}`);
    }
    return parts.join(' · ') || $localize`:@@sceneQ.asProject:same as project`;
  });

  /** The note about the last change made to this scene's quality. */
  protected readonly qualityNote = computed(() => {
    const n = this.store.sceneTierApplied();
    return n && n.id === this.scene()?.id ? n : null;
  });

  /** The most pixels a picture of the project's model can have on this machine: a level never asks for more. */
  private readonly pictureLimit = computed(() => {
    const cfg = this.store.config();
    return cfg ? pictureLimitFor(cfg, this.store.catalog(), this.env.gpus(), this.env.ram()) : null;
  });

  protected pickTier(tier: Tier): void {
    this.store.applySceneTier(this.index(), tier, loadOverrides(), this.pictureLimit());
  }
}
