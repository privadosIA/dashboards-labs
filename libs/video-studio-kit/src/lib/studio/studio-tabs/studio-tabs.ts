import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

export type StudioTab = 'create' | 'edit';

/** The two tabs of the side panel. It only says which is chosen; the page keeps both mounted so nothing typed is lost. */
@Component({
  selector: 'app-studio-tabs',
  templateUrl: './studio-tabs.html',
  styleUrl: './studio-tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioTabs {
  readonly tab = model<StudioTab>('create');

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly tabs: readonly StudioTab[] = ['create', 'edit'];

  protected label(tab: StudioTab): string {
    return tab === 'create' ? this.t.tabs.create : this.t.tabs.edit;
  }
}
