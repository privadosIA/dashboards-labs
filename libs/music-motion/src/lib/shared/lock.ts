import type { DfFormSchema } from '@core/dynamic-forms';

/** The key of the hidden field that says the form is locked (the piece is being drawn). Put it in the model. */
export const LOCK_KEY = 'locked';

/**
 * The schema with a hidden `locked` field and every other field disabled while it is true. The library has no switch for
 * a whole form, so the lock is a rule of each field.
 */
export function withLock(schema: DfFormSchema): DfFormSchema {
  const locked = { field: LOCK_KEY, operator: 'truthy' as const };
  /** A field that was disabled for a reason of its own stays disabled for it too. */
  const disabled = (f: { logic?: { disabledWhen?: unknown } }) => (f.logic?.disabledWhen ? { any: [locked, f.logic.disabledWhen] } : locked);
  return {
    ...schema,
    fields: [
      { key: LOCK_KEY, type: 'hidden', defaultValue: false },
      ...schema.fields.map((f) => ('key' in f && f.type !== 'hidden' ? { ...f, logic: { ...('logic' in f ? f.logic : {}), disabledWhen: disabled(f as { logic?: { disabledWhen?: unknown } }) } } : f)),
    ],
  } as DfFormSchema;
}
