import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { EnginesPanel } from '../engines-panel';

/** The button that opens the Engines panel; a host puts it in its own header, the panel is the library's. */
@Component({
  selector: 'app-engines-button',
  templateUrl: './engines-button.html',
  styleUrl: './engines-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnginesButton {
  private readonly panel = inject(EnginesPanel);
  protected readonly t = textsFor(inject(LanguageService).lang);

  protected open(): void {
    this.panel.open();
  }
}
