import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, switchMap } from 'rxjs';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { finished } from '../video/finished';
import { DEFAULT_SETTINGS, type Generation, type GenerationSettings } from '../video/model';
import { VIDEO_GENERATION } from '../video/tokens';
import { Notifier } from '../shared/notifier';
import { ConfirmDialog } from '../shared/confirm-dialog/confirm.dialog';
import { CreatePanel } from '../create-panel/create-panel';
import { EditTools } from '../edit-tools/edit-tools';
import { History } from '../history/history';
import { StudioTabs, type StudioTab } from './studio-tabs/studio-tabs';
import type { StartImage } from '../video/model';
import { EditViewerDialog, type EditViewerAction } from '../edit-viewer-dialog/edit-viewer.dialog';
import type { VideoEdit } from '../video-edit/model';
import { VIDEO_EDIT } from '../video-edit/tokens';
import { ViewerDialog, type ViewerAction } from '../viewer-dialog/viewer.dialog';

/** An adapter that can be told to fail its next generation (the in-memory one), so the failed state can be tried. */
interface CanFailNext {
  failNext(on?: boolean): void;
}
const canFailNext = (port: object): port is CanFailNext => typeof (port as Partial<CanFailNext>).failNext === 'function';

@Component({
  selector: 'app-studio',
  imports: [CreatePanel, EditTools, History, StudioTabs],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioPage {
  private readonly port = inject(VIDEO_GENERATION);
  private readonly editPort = inject(VIDEO_EDIT);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly notifier = inject(Notifier);
  private readonly document = inject(DOCUMENT);
  protected readonly t = textsFor(inject(LanguageService).lang);

  protected readonly tab = signal<StudioTab>('create');
  private readonly create = viewChild.required(CreatePanel);
  protected readonly draft = signal<GenerationSettings>({ ...DEFAULT_SETTINGS });
  protected readonly generations = toSignal(this.port.list(), { initialValue: [] });
  protected readonly edits = toSignal(this.editPort.list(), { initialValue: [] });
  protected readonly models = toSignal(this.port.models(), { initialValue: [] });
  protected readonly createError = signal('');
  protected readonly demo = canFailNext(this.port) ? this.port : null;
  /** The demo box stays ticked from the moment it is chosen until the generation it was meant for is created. */
  protected readonly failArmed = signal(false);

  /** The list as the last effect run saw it; null until then, so the first read (a restored history) announces nothing. */
  private seen: readonly Generation[] | null = null;

  constructor() {
    effect(() => {
      const next = this.generations();
      const previous = this.seen;
      this.seen = next;
      if (previous) untracked(() => finished(previous, next).forEach((g) => this.announce(g)));
    });
  }

  /** An image made in the Edit tab becomes the start image of the Create tab, which is shown. */
  protected useStartImage(image: StartImage): void {
    this.create().useStartImage(image);
    this.tab.set('create');
  }

  protected generate(settings: GenerationSettings): void {
    // A user gesture: the browser lets the permission be asked now. Creating the generation does not wait for it.
    void this.notifier.request();
    this.createError.set('');
    this.port.create(settings).subscribe({
      next: () => this.failArmed.set(false),
      error: (e: unknown) => this.createError.set(e instanceof Error ? e.message : String(e)),
    });
  }

  /** The notice in the page, and a browser notification as well when the page is not in view. */
  private announce(generation: Generation): void {
    const done = generation.state === 'done';
    const title = done ? this.t.notice.ready : this.t.notice.failed;
    this.snackBar.open(title, done ? this.t.notice.view : undefined, { duration: 8000 }).onAction().subscribe(() => this.open(generation));
    if (this.document.hidden) {
      this.notifier.show(title, generation.settings.prompt.slice(0, 80), () => this.document.defaultView?.focus());
    }
  }

  protected open(generation: Generation): void {
    this.dialog
      .open<ViewerDialog, Generation, ViewerAction>(ViewerDialog, { data: generation, width: '40rem', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((action) => {
        if (action === 'repeat') this.repeat(generation);
        if (action === 'remove') this.remove(generation);
      });
  }

  /** Loads the settings into the panel; nothing is generated until the person generates. */
  protected repeat(generation: Generation): void {
    this.draft.set({ ...generation.settings });
  }

  protected remove(generation: Generation): void {
    this.dialog
      .open<ConfirmDialog, void, boolean>(ConfirmDialog)
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => this.port.remove(generation.id)),
      )
      .subscribe();
  }

  protected openEdit(edit: VideoEdit): void {
    this.dialog
      .open<EditViewerDialog, VideoEdit, EditViewerAction>(EditViewerDialog, { data: edit, width: '40rem', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((action) => {
        if (action === 'remove') this.removeEdit(edit);
      });
  }

  protected removeEdit(edit: VideoEdit): void {
    this.dialog
      .open<ConfirmDialog, void, boolean>(ConfirmDialog)
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => this.editPort.remove(edit.id)),
      )
      .subscribe();
  }

  protected failNext(event: Event): void {
    const armed = (event.target as HTMLInputElement).checked;
    this.demo?.failNext(armed);
    this.failArmed.set(armed);
  }
}
