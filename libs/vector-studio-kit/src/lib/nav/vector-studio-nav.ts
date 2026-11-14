import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';

/**
 * The Editor and Catalog links of the studio, for the host to place in its own chrome (its header, or the slim bar of a section). `base` is where the host
 * mounted the routes: `''` at its root, `'/vector'` under a section. The library draws no header of its own.
 */
@Component({
  selector: 'vector-studio-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './vector-studio-nav.html',
  styleUrl: './vector-studio-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorStudioNav {
  readonly base = input('');
  protected readonly t = textsFor(inject(LanguageService).lang).nav;
  protected readonly editor = computed(() => `${this.base()}/editor`);
  protected readonly catalog = computed(() => `${this.base()}/catalog`);
}
