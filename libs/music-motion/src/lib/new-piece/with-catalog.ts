import type { DfFormSchema } from '@core/dynamic-forms';

import type { Catalog } from '@lab/animation-core';
import type { Texts } from '../core/texts';

/**
 * The schema with the options of the style, level and frame-rate fields set from the catalog (a JSON schema cannot know
 * them: the server owns them). Before the catalog arrives the fields have no options, which the library accepts as long as
 * the key is there. A value the dashboard has no name for is shown as it is.
 */
export const withCatalog = (schema: DfFormSchema, catalog: Catalog | null, t: Texts['newPiece']): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => {
    if (!('key' in f) || !catalog) return f;
    switch (f.key) {
      case 'style':
        return { ...f, options: catalog.styles.map((s) => ({ value: s, label: t.styles[s] ?? s })) };
      case 'level':
        return { ...f, options: catalog.levels.map((l) => ({ value: l, label: t.levels[l] ?? l })) };
      case 'fps':
        return { ...f, options: catalog.frameRates.map((r) => ({ value: String(r), label: String(r) })) };
      default:
        return f;
    }
  }),
});
