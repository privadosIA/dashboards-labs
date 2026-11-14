import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, model, viewChild } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** The keyboard and mouse shortcuts of the editor in a window of their own: it opens with ? and closes with Esc, the × or a click outside. */
@Component({
  selector: 'app-help-dialog',
  templateUrl: './help-dialog.html',
  styleUrl: './help-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDialog {
  readonly open = model(false);
  protected readonly t = textsFor(inject(LanguageService).lang).help;
  protected readonly tv = textsFor(inject(LanguageService).lang).vector;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.open.set(false);
  }
}
