import type { DfFormSchema } from '@core/dynamic-forms';

type Listed = { id: string; name: string; available: boolean };

/** The identifier a form starts with: the first model that can be used, or none while the list has not arrived (or nothing can). */
export const defaultModelId = (models: readonly Listed[]): string | undefined => models.find((m) => m.available)?.id;

/**
 * The schema with the `model` field's options and default set from the models a port lists (a JSON schema cannot know
 * them: they come from whoever does the work). A model that is not available is an option that is disabled, with
 * `unavailableLabel` after its name; the default is the first available one. Before the list arrives the field has no
 * options, which the library accepts as long as the key is there.
 */
export const withModels = (schema: DfFormSchema, models: readonly Listed[], unavailableLabel: string): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => {
    if (!('key' in f) || f.key !== 'model') return f;
    const options = models.map((m) => (m.available ? { value: m.id, label: m.name } : { value: m.id, label: `${m.name} ${unavailableLabel}`, disabled: true }));
    const first = defaultModelId(models);
    return first ? { ...f, defaultValue: first, options } : { ...f, options };
  }),
});
