import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import type { EditorPage } from './editor.page';

/** Leaving the editor with changes that are not saved asks first. */
export const unsavedGuard: CanDeactivateFn<EditorPage> = (page) => {
  if (!page.hasChanges()) return true;
  return confirm(textsFor(inject(LanguageService).lang).editor.leaveAsk);
};
