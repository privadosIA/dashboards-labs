import type { DfFormSchema } from '@core/dynamic-forms';

import { withLock } from '../../../shared/lock';

export const ADD_KEY = 'add';

/** A form of one select: the part of an extra, or the empty choice that adds one. Locked with the rest while the piece is drawn. */
export const partSelectSchema = (id: string, key: string, label: string, options: readonly { value: string; label: string }[]): DfFormSchema =>
  withLock({ version: '1.0', id, layout: { columns: 1 }, fields: [{ key, type: 'select', label, options: [...options] }] } as DfFormSchema);
