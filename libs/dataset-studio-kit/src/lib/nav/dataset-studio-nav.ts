import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';

/**
 * The Studio, Providers and Presets links, for the host to place in its own chrome (its header, or the slim bar of a section). `base` is where the host mounted the routes: `''` at its root, `'/dataset'` under a section.
 * The library draws no header of its own.
 */
@Component({
  selector: 'dataset-studio-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './dataset-studio-nav.html',
  styleUrl: './dataset-studio-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetStudioNav {
  readonly base = input('');
  protected readonly t = textsFor(inject(LanguageService).lang).nav;
  protected readonly studio = computed(() => `${this.base()}/studio`);
  protected readonly providers = computed(() => `${this.base()}/providers`);
  protected readonly presets = computed(() => `${this.base()}/presets`);
}
