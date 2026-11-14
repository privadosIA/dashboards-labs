import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { RetouchDialog } from '../../retouch-dialog/retouch.dialog';
import type { StartImage as Image } from '../../video/model';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** One optional picture (the start image, and the end image beside it): choose a file, see its preview, retouch it, remove it. It only holds the image; the panel decides what it means. */
@Component({
  selector: 'app-start-image',
  templateUrl: './start-image.html',
  styleUrl: './start-image.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StartImage {
  readonly image = model<Image | null>(null);
  /** Its heading; the start image's when not given. */
  readonly label = input<string>('');
  /** Which picture this is, for tests and screen readers. */
  readonly testId = input<string>('start-image');

  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly error = signal('');

  protected readonly dragging = signal(false);

  protected onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    return this.accept(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    return this.accept(event.dataTransfer?.files?.[0]);
  }

  private async accept(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!file.type.startsWith('image/')) return this.error.set(this.t.panel.notAnImage);
    if (file.size > MAX_IMAGE_BYTES) return this.error.set(this.t.panel.imageTooBig);
    this.error.set('');
    this.image.set({ name: file.name, dataUrl: await readAsDataUrl(file) });
  }

  /** Opens the retouch; the variant chosen there replaces the image, and cancelling leaves it as it was. */
  protected retouch(): void {
    const current = this.image();
    if (!current) return;
    this.dialog
      .open<RetouchDialog, Image, Image>(RetouchDialog, { data: current, width: '46rem', maxWidth: '95vw', panelClass: 'studio-kit' })
      .afterClosed()
      .subscribe((result) => {
        if (result) this.image.set(result);
      });
  }

  protected remove(): void {
    this.image.set(null);
  }
}
