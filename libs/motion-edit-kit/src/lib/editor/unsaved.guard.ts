import type { CanDeactivateFn } from '@angular/router';

import { textsFor } from '../core/texts';
import { LanguageService } from '../core/language';
import { inject } from '@angular/core';
import type { EditorPage } from './editor.page';

/** Leaving the editor with changes that are not saved asks first: about the vector part if it has any, then about the script. */
export const unsavedGuard: CanDeactivateFn<EditorPage> = async (page) => {
  const leaveAsk = textsFor(inject(LanguageService).lang).editing.leaveAsk;
  // The vector part's changes are asked about apart (Save, Discard or Stay), before the script's.
  if (page.hasVectorChanges() && !(await page.confirmVectorLeave())) return false;
  if (!page.hasChanges()) return true;
  return confirm(leaveAsk);
};
