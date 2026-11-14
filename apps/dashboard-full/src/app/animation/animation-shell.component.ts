import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MUSIC_MOTION_SECTIONS, textsFor } from '@lab/music-motion';

import { activeLang } from '../core/language';
import { MotionCatalogStore } from '../core/motion-catalog.store';

interface Tab {
  readonly path: string;
  readonly label: string;
}

/**
 * The Animation section: the links to the screens of `@lab/music-motion`, which the library does not draw, with Motion Edit after Pieces (it is what an animation makes: the editor of a piece) and Vector after Parts (it is where
 * a part is drawn), and the screen itself.
 */
@Component({
  selector: 'app-animation-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './animation-shell.component.html',
  styleUrl: './animation-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimationShellComponent {
  private readonly nav = textsFor(activeLang()).nav;
  protected readonly tabs: readonly Tab[] = MUSIC_MOTION_SECTIONS.flatMap((s): Tab[] => {
    const own: Tab = { path: s.path, label: this.nav[s.key] };
    if (s.path === 'pieces') return [own, { path: 'motion-edit', label: $localize`:@@animation.motionEdit:Motion Edit` }];
    if (s.path === 'parts') return [own, { path: 'vector', label: $localize`:@@animation.vector:Vector` }];
    return [own];
  });

  constructor() {
    // A part may be approved in the section: the scene editor reads the catalog again the next time it needs it.
    const catalog = inject(MotionCatalogStore);
    inject(DestroyRef).onDestroy(() => catalog.invalidate());
  }
}
