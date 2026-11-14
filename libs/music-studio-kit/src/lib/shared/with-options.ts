import type { DfFormSchema } from '@core/dynamic-forms';

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * The schema with the options (and, when given, the default) of the select with this key set from code: a JSON schema
 * cannot know what only the port knows (the generators the server can use now). Fields with another key are untouched.
 */
export const withOptions = (schema: DfFormSchema, key: string, options: readonly Option[], defaultValue?: string): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => (!('key' in f) || f.key !== key ? f : { ...f, options: [...options], ...(defaultValue !== undefined ? { defaultValue } : {}) })),
});

/** The schema without the fields with these keys. */
export const withoutFields = (schema: DfFormSchema, ...keys: string[]): DfFormSchema => ({
  ...schema,
  fields: schema.fields.filter((f) => !('key' in f) || !keys.includes(f.key as string)),
});

/** The schema with the `logic` (the conditions on other fields) of the field with this key taken away. */
export const withoutLogic = (schema: DfFormSchema, key: string): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => {
    if (!('key' in f) || f.key !== key) return f;
    const { logic: _logic, ...rest } = f as typeof f & { logic?: unknown };
    return rest as typeof f;
  }),
});

/** The schema with the placeholder of the field with this key set from code (it may hold line breaks: a textarea shows them). */
export const withPlaceholder = (schema: DfFormSchema, key: string, placeholder: string): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => (!('key' in f) || f.key !== key ? f : { ...f, placeholder })),
});
