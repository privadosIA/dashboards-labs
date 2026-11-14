import type { Lang } from '@lab/forms-kit';

import { textsFor } from '../../core/texts';

/**
 * A step's reason as the person reads it. The flow keeps short codes for what it knows itself (`gone`: the thing is no longer on the server; `interrupted`: the tab was closed while it
 * ran); anything else is the server's own words and is shown as it came.
 */
export function reasonText(lang: Lang, reason: string | undefined): string {
  const t = textsFor(lang).flow.reason;
  if (!reason) return '';
  if (reason === 'gone') return t.gone;
  if (reason.startsWith('gone:')) return t.goneNamed(reason.slice(5));
  if (reason === 'interrupted') return t.interrupted;
  if (reason === 'no-result') return t.noResult;
  return reason;
}
