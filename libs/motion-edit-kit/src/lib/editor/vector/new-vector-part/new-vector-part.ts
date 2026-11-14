import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';

/** The library's New vector part… button: it opens the file picker and hands the chosen SVG on; the page opens the Vector tab on it. */
@Component({
  selector: 'app-new-vector-part',
  templateUrl: './new-vector-part.html',
  styleUrl: './new-vector-part.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewVectorPart {
  readonly chosen = output<File>();
  protected readonly t = textsFor(inject(LanguageService).lang).vector;

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.chosen.emit(file);
  }
}
