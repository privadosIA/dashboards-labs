import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Composer } from '../composer/composer';
import { LanguageService } from '../core/language';
import { SongsPanel } from '../songs/songs-panel';
import { textsFor } from '../core/texts';

/** The one page: the form that writes a song on the left and the songs made on the right (one column on a narrow screen). */
@Component({
  selector: 'app-studio-page',
  imports: [Composer, SongsPanel],
  templateUrl: './studio.page.html',
  styleUrl: './studio.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioPage {
  protected readonly t = textsFor(inject(LanguageService).lang);
}
