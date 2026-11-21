import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { ANIMATION_MODE, ModeFilterStore, PROJECT_MODES, PROJECT_ORIGINS, ProjectMode, ProjectOrigin } from '../../core/mode-filter.store';

/**
 * The modes the user wants to see (video, images, music) and where they were made (desktop, phone), as two
 * multiple-choice selectors. They are bound to the preference shared by every screen that tells the modes
 * apart, so changing it in one is seen in the others. `modes` turns the first selector off for a screen that
 * has a single mode (the song library).
 */
@Component({
  selector: 'app-mode-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  host: { '[class.fill]': 'fill()' },
  templateUrl: './mode-select.component.html',
  styleUrl: './mode-select.component.scss',
})
export class ModeSelectComponent {
  private readonly filter = inject(ModeFilterStore);

  /** Whether the modes selector is shown (the song library has only music). */
  readonly modes = input(true);
  /** The selectors are cells of a grid of fields (the launch form of the runs) and take the width of their column. */
  readonly fill = input(false);

  /** Adds the Animation option: only Runs lists the runs of animations. */
  readonly animations = input(false);

  protected readonly options = computed<readonly (ProjectMode | typeof ANIMATION_MODE)[]>(() => (this.animations() ? [...PROJECT_MODES, ANIMATION_MODE] : PROJECT_MODES));
  protected readonly originOptions = PROJECT_ORIGINS;
  protected readonly chosenOrigins = computed(() => PROJECT_ORIGINS.filter((o) => this.filter.origins().has(o)));
  protected readonly chosen = computed<(ProjectMode | typeof ANIMATION_MODE)[]>(() => [
    ...PROJECT_MODES.filter((m) => this.filter.modes().has(m)),
    ...(this.animations() && this.filter.animations() ? [ANIMATION_MODE as typeof ANIMATION_MODE] : []),
  ]);

  protected change(modes: (ProjectMode | typeof ANIMATION_MODE)[]): void {
    this.filter.set(modes.filter((m): m is ProjectMode => m !== ANIMATION_MODE));
    if (this.animations()) this.filter.setAnimations(modes.includes(ANIMATION_MODE));
  }

  protected changeOrigins(origins: ProjectOrigin[]): void {
    this.filter.setOrigins(origins);
  }

  protected originLabel(origin: ProjectOrigin): string {
    return origin === 'desktop' ? $localize`:@@origins.desktop:Desktop` : $localize`:@@origins.mobile:Mobile`;
  }

  protected label(mode: ProjectMode | typeof ANIMATION_MODE): string {
    switch (mode) {
      case 'animation':
        return $localize`:@@modes.animation:Animation`;
      case 'video':
        return $localize`:@@modes.video:Video`;
      case 'images':
        return $localize`:@@modes.images:Images`;
      case 'music':
        return $localize`:@@modes.music:Music`;
    }
  }
}
