import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';

export type LeaveAnswer = 'save' | 'discard' | 'stay';

/**
 * Asked when something would leave the vector part with changes that are not saved (the Code tab, another part, the page): Save, Discard or Stay.
 * Escape and a click outside are Stay. It is apart from the script's own guard, which asks about the script.
 */
@Component({
  selector: 'app-vector-leave',
  templateUrl: './leave-dialog.html',
  styleUrl: './leave-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorLeave {
  /** What has changes, in words ("The part “spin-logo”"); the dialog is open while there is something to say. */
  readonly what = input<string | null>(null);
  readonly answer = output<LeaveAnswer>();

  protected readonly t = textsFor(inject(LanguageService).lang).vector.leave;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.what() !== null && !el.open) el.showModal();
      else if (this.what() === null && el.open) el.close();
    });
  }

  protected give(answer: LeaveAnswer): void {
    this.answer.emit(answer);
  }

  /** Escape: the browser closes the dialog by itself; the answer is Stay. */
  protected cancelled(event: Event): void {
    event.preventDefault();
    this.give('stay');
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.give('stay');
  }
}
