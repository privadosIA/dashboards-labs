import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';

/**
 * The Pieces and Flow links of the editor, for the host to place in its own chrome (its header, or the slim bar of a section). `base` is where the host mounted the routes: `''` at its root,
 * `'/motion-edit'` under a section. The library draws no header of its own.
 */
@Component({
  selector: 'motion-edit-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './motion-edit-nav.html',
  styleUrl: './motion-edit-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionEditNav {
  readonly base = input('');
  /** Whether the Guided flow link is drawn: a host that does not provide the song port leaves it out. */
  readonly flow = input(true);
  protected readonly t = textsFor(inject(LanguageService).lang).nav;
  protected readonly pieces = computed(() => `${this.base()}/pieces`);
  protected readonly flowLink = computed(() => `${this.base()}/flow`);
}
