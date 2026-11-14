import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { STRUCTURE_TAGS, type StructureTag } from '../../song/sections';

/** What goes under the lyrics: the Structure Tags menu and the AI Generator button. It decides nothing: the form listens. */
@Component({
  selector: 'app-lyrics-tools',
  imports: [MatMenuModule],
  templateUrl: './lyrics-tools.html',
  styleUrl: './lyrics-tools.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LyricsTools {
  readonly insert = output<StructureTag>();
  readonly write = output<void>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly tags = STRUCTURE_TAGS;
}
