import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
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
import { ProjectHistoryData, ProjectHistoryDialogComponent } from '../../projects/project-history-dialog/project-history-dialog.component';

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
  private readonly dialog = inject(MatDialog);

  /** The new-project dialog could not write the style and quality it was given. */
  protected readonly choiceNotApplied =
    (this.router.getCurrentNavigation()?.extras.state as { notice?: string } | undefined)?.notice === 'choice-not-applied';

  ngOnInit(): void {
    void this.initialize();
  }

  /** What the page loads when it opens (kept out of `ngOnInit`, which Angular does not wait for). */
  private async initialize(): Promise<void> {
    void this.env.ensureLoaded();
    await this.store.load(this.id());
    // A music project has tracks, not scenes: its create view is the music studio.
    if (this.store.config()?.output.mode === 'music') {
      await this.router.navigate(['/projects', this.id(), 'music'], { replaceUrl: true });
    }
    // A 3D models project declares models, not scenes: its page is the 3D models one.
    if (this.store.config()?.output.mode === 'models3d') {
      await this.router.navigate(['/projects', this.id(), 'models3d'], { replaceUrl: true });
    }
  }

  protected async save(): Promise<void> {
    const saved = await this.store.save();
    // The project is now a music project: its tracks are edited in the studio.
    if (saved && this.store.toMusic()) {
      await this.router.navigate(['/projects', this.id(), 'music']);
    }
  }

  /**
   * The versions of this project's definition. A restore changes the definition under the editor, so the dialog is told whether
   * there are unsaved edits (it says they will be lost) and, once a version is restored, the editor reads the project again and
   * drops what it held locally. Closing the dialog any other way leaves the editor and its edits as they were.
   */
  protected openHistory(): void {
    const id = this.id();
    this.dialog.open<ProjectHistoryDialogComponent, ProjectHistoryData>(ProjectHistoryDialogComponent, {
      data: { projectId: id, unsaved: this.store.dirty(), onRestored: () => void this.store.load(id) },
      width: '44rem',
      maxWidth: '95vw',
    });
  }

  protected async discard(): Promise<void> {
    await this.store.load(this.id());
  }
}
