import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { ConnectionDialogService, ConnectionService } from '@lab/server-connection';

import { activeLang, chooseLang, Lang } from '../../core/language';
import { ThemeService } from '../../core/theme.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { openedByThisApp } from '../open-section';

/**
 * The header of a section window (Animation, Video, Music): the mark and name as a way back (closing the tab when another tab of the app opened it, else Projects), the name of the section, and the
 * connection, language and theme that the side navigation keeps at its foot. The window has no side navigation.
 */
@Component({
  selector: 'app-section-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSlideToggleModule],
  templateUrl: './section-header.component.html',
  styleUrl: './section-header.component.scss',
})
export class SectionHeaderComponent {
  /** The name of the section the window shows. */
  readonly title = input.required<string>();

  protected readonly lang: Lang = activeLang();
  protected readonly theme = inject(ThemeService);
  protected readonly conn = inject(ConnectionService);
  protected readonly connectionDialog = inject(ConnectionDialogService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  /**
   * The way back to Projects. A tab that another tab of the app opened closes itself, which leaves the person in the tab they came from (going to Projects here would load a second copy
   * of the whole app); if the browser does not let it close, or the tab was opened on its own, it goes to Projects as the link says.
   */
  protected home(event: Event): void {
    if (!openedByThisApp()) return;
    event.preventDefault();
    // Closing a window leaves the page: it says so first, so that what is not saved can be saved.
    openConfirm(this.dialog, {
      title: $localize`:@@sectionHeader.closeTitle:Close this window?`,
      message: $localize`:@@sectionHeader.closeMessage:You are about to leave this page: the window closes and you go back to the tab you came from. Save what you want to keep first; what is not saved is lost.`,
      confirmLabel: $localize`:@@sectionHeader.closeConfirm:Close the window`,
      destructive: true,
    }).subscribe((close) => {
      if (!close) return;
      window.close();
      setTimeout(() => {
        if (!window.closed) void this.router.navigateByUrl('/projects');
      }, 250);
    });
  }

  /** Chooses the UI language; the page reloads on the same route. */
  protected setLang(lang: Lang): void {
    if (lang !== this.lang) chooseLang(lang);
  }
}
