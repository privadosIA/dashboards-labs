import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { filter, switchMap, type Subscription } from 'rxjs';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import type { Motion, MotionRequest } from '../motions/model';
import { MotionCards } from '../motions/motion-cards/motion-cards';
import { MOTION_LIBRARY } from '../motions/tokens';
import { validateMotion } from '../motions/validate';
import { ConfirmDialog, type ConfirmText } from '../shared/confirm-dialog/confirm.dialog';
import { motionAddSchema } from './schemas';

const VIDEO_FILE = /\.(mp4|mov|webm|mkv)$/i;

type AddModel = Record<string, unknown>;

const EMPTY: AddModel = { title: '', tags: '', source: '' };

/**
 * The Motion library: every motion with its preview and state, a form that adds one (from a video file or from an
 * address, with the limits said first) and the way to remove one. The port follows a motion that is being prepared, so
 * this screen only reads.
 */
@Component({
  selector: 'app-motion-library-dialog',
  templateUrl: './motion-library.dialog.html',
  styleUrl: './motion-library.dialog.scss',
  imports: [DynamicFormComponent, MotionCards],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionLibraryDialog {
  private readonly library = inject(MOTION_LIBRARY);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject<MatDialogRef<MotionLibraryDialog>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  protected readonly schema = motionAddSchema(this.lang);

  protected readonly motions = signal<readonly Motion[]>([]);
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly model = signal<AddModel>({ ...EMPTY });
  protected readonly file = signal<File | null>(null);
  protected readonly adding = signal(false);
  protected readonly error = signal('');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('motionFile');
  private reading?: Subscription;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.reading?.unsubscribe();
    this.status.set('loading');
    this.reading = this.library
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.motions.set(list);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  protected chooseFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected picked(): void {
    const input = this.fileInput().nativeElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/') && !VIDEO_FILE.test(file.name)) {
      this.file.set(null);
      this.error.set(this.t.videoTools.dialog.notAVideo);
      return;
    }
    this.error.set('');
    this.file.set(file);
  }

  protected clearFile(): void {
    this.file.set(null);
  }

  protected add(): void {
    if (this.adding()) return;
    const { title, tags, source } = this.text(this.model());
    const file = this.file();
    if (file && source.trim()) return this.error.set(this.t.motionLibrary.bothChosen);
    const list = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const request: MotionRequest = {
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(list.length ? { tags: list } : {}),
      ...(file ? { video: { name: file.name, blob: file } } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
    };
    const problems = validateMotion(request);
    if (problems.length) return this.error.set(`${this.t.motionLibrary.refused} ${problems.join('; ')}`);
    this.adding.set(true);
    this.error.set('');
    this.library.add(request).subscribe({
      next: () => {
        this.model.set({ ...EMPTY });
        this.file.set(null);
        this.adding.set(false);
      },
      error: (e: unknown) => {
        this.error.set(`${this.t.motionLibrary.refused} ${e instanceof Error ? e.message : String(e)}`);
        this.adding.set(false);
      },
    });
  }

  /** The three fields of the form as text, whatever the form left in the model. */
  private text(model: AddModel): { title: string; tags: string; source: string } {
    const read = (key: string): string => (typeof model[key] === 'string' ? (model[key] as string) : '');
    return { title: read('title'), tags: read('tags'), source: read('source') };
  }

  protected remove(motion: Motion): void {
    const ask: ConfirmText = { title: this.t.motionLibrary.removeTitle, message: this.t.motionLibrary.removeMessage };
    this.dialog
      .open<ConfirmDialog, ConfirmText, boolean>(ConfirmDialog, { data: ask })
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => this.library.remove(motion.id)),
      )
      .subscribe({ error: (e: unknown) => this.error.set(e instanceof Error ? e.message : String(e)) });
  }

  protected close(): void {
    this.ref.close();
  }
}
