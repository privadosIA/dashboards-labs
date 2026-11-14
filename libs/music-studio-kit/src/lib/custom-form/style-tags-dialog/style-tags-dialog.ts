import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { SongDraftStore } from '../../song/draft.store';
import type { TagVocabulary } from '../../song/model';
import { StyleTags } from '../style-tags/style-tags';

/** What the dialog is opened with: the server's vocabulary of tags. */
export interface StyleTagsDialogData {
  readonly vocabulary: TagVocabulary;
}

/** The tags of the style, in a dialog of their own: every pick goes straight into the style of the draft, and Done closes it. */
@Component({
  selector: 'app-style-tags-dialog',
  imports: [StyleTags],
  templateUrl: './style-tags-dialog.html',
  styleUrl: './style-tags-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleTagsDialog {
  protected readonly ref = inject<MatDialogRef<StyleTagsDialog>>(MatDialogRef);
  protected readonly data = inject<StyleTagsDialogData>(MAT_DIALOG_DATA);
  protected readonly store = inject(SongDraftStore);
  protected readonly t = textsFor(inject(LanguageService).lang);
}
