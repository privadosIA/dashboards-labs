import type { DfFormSchema } from '@core/dynamic-forms';

import type { ImageModel } from '../retouch/model';

/**
 * The schema with only the fields the model takes: no `strength` or `negativePrompt` for a model that takes none, and
 * `variants` limited to what it makes (`{max}` in the field's texts becomes that number; a model that makes one has no
 * choice to offer, so the field goes). Without a model, the schema as it is.
 */
export const withModelFields = (schema: DfFormSchema, model?: ImageModel): DfFormSchema => {
  if (!model) return schema;
  const gone = (key: string) => (key === 'strength' && !model.strength) || (key === 'negativePrompt' && !model.negativePrompt) || (key === 'variants' && model.maxVariants <= 1);
  return {
    ...schema,
    fields: schema.fields
      .filter((f) => !('key' in f) || !gone(f.key))
      .map((f) => {
        if (!('key' in f) || f.key !== 'variants') return f;
        const texts = JSON.parse(JSON.stringify(f).replaceAll('{max}', String(model.maxVariants))) as typeof f & { validation?: { max?: number } };
        if (texts.validation) texts.validation.max = model.maxVariants;
        return texts;
      }),
  };
};
