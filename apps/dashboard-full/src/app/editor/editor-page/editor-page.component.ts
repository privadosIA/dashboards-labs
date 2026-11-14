import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';

import { EnvironmentStore } from '../../core/environment.store';
import { BgmPanelComponent } from '../bgm-panel/bgm-panel.component';
import { MotionDefaultsPanelComponent } from '../motion-defaults-panel/motion-defaults-panel.component';
import { DefaultsPanelComponent } from '../defaults-panel/defaults-panel.component';
import { EditorStore } from '../editor.store';
import { SceneFormComponent } from '../scene-form/scene-form.component';
import { SceneReelComponent } from '../scene-reel/scene-reel.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

/**
 * Scene editor view: master (reel) + detail (scene form), with the
 * project-wide defaults/output panels above. Saving is gated by the
 * mirrored client validation; the server's answer stays authoritative.
 */
@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    DefaultsPanelComponent,
    BgmPanelComponent,
    MotionDefaultsPanelComponent,
    SceneReelComponent,
    SceneFormComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
  ],
  providers: [EditorStore],
  templateUrl: './editor-page.component.html',
  styleUrl: './editor-page.component.scss',
})
export class EditorPageComponent implements OnInit {
  readonly id = input.required<string>();

  protected readonly store = inject(EditorStore);
  private readonly env = inject(EnvironmentStore);
  private readonly router = inject(Router);

  /** The new-project dialog could not write the style and quality it was given. */
  protected readonly choiceNotApplied =
    (this.router.getCurrentNavigation()?.extras.state as { notice?: string } | undefined)?.notice === 'choice-not-applied';

  async ngOnInit(): Promise<void> {
    void this.env.ensureLoaded();
    await this.store.load(this.id());
    // A music project has tracks, not scenes: its create view is the music studio.
    if (this.store.config()?.output.mode === 'music') {
      await this.router.navigate(['/projects', this.id(), 'music'], { replaceUrl: true });
    }
  }

  protected async save(): Promise<void> {
    const saved = await this.store.save();
    // The project is now a music project: its tracks are edited in the studio.
    if (saved && this.store.toMusic()) {
      await this.router.navigate(['/projects', this.id(), 'music']);
    }
  }

  protected async discard(): Promise<void> {
    await this.store.load(this.id());
  }
}
