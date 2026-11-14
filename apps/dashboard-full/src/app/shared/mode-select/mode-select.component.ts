import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { ModeFilterStore, PROJECT_MODES, PROJECT_ORIGINS, ProjectMode, ProjectOrigin } from '../../core/mode-filter.store';

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

  protected readonly options = PROJECT_MODES;
  protected readonly originOptions = PROJECT_ORIGINS;
  protected readonly chosenOrigins = computed(() => PROJECT_ORIGINS.filter((o) => this.filter.origins().has(o)));
  protected readonly chosen = computed(() => PROJECT_MODES.filter((m) => this.filter.modes().has(m)));

  protected change(modes: ProjectMode[]): void {
    this.filter.set(modes);
  }

  protected changeOrigins(origins: ProjectOrigin[]): void {
    this.filter.setOrigins(origins);
  }

  protected originLabel(origin: ProjectOrigin): string {
    return origin === 'desktop' ? $localize`:@@origins.desktop:Desktop` : $localize`:@@origins.mobile:Mobile`;
  }

  protected label(mode: ProjectMode): string {
    switch (mode) {
      case 'video':
        return $localize`:@@modes.video:Video`;
      case 'images':
        return $localize`:@@modes.images:Images`;
      case 'music':
        return $localize`:@@modes.music:Music`;
    }
  }
}
