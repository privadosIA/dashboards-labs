import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { THEME_LANG } from '../provide-theme-switch';
import { themeTexts } from '../texts';
import { ThemeService } from '../theme.service';

/** The button of a dashboard's header that switches between its light and dark themes. Its label says which theme pressing it gives. */
@Component({
  selector: 'lab-theme-switch',
  templateUrl: './theme-switch.html',
  styleUrl: './theme-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitch {
  private readonly service = inject(ThemeService);
  private readonly t = themeTexts(inject(THEME_LANG));
  protected readonly light = computed(() => this.service.theme() === 'light');
  protected readonly label = computed(() => (this.light() ? this.t.toDark : this.t.toLight));

  protected toggle(): void {
    this.service.toggle();
  }
}
