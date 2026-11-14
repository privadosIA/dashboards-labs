import type { DfFormSchema } from '@core/dynamic-forms';

import { HIT_STYLES, VERSE_STYLES, type Catalog } from '@lab/animation-core';
import type { Texts } from '../core/texts';

type Node = DfFormSchema['fields'][number];

/** The preset schema with what the server owns filled in: the typefaces, the modes, the styles and the parts of the catalog. */
export function withPresetCatalog(schema: DfFormSchema, catalog: Catalog | null, t: Texts): DfFormSchema {
  const fonts = (catalog?.fonts ?? []).map((f) => ({ value: f, label: f }));
  const modes = (catalog?.modes ?? []).map((m) => ({ value: m, label: t.design.modes[m] ?? m }));
  const fields = schema.fields.map((f): Node => {
    if (!('key' in f)) return f;
    switch (f.key) {
      case 'display':
      case 'body':
        return { ...f, options: fonts } as Node;
      case 'defaultMode':
        return { ...f, options: modes } as Node;
      case 'verseStyle':
        return { ...f, options: VERSE_STYLES.map((v) => ({ value: v, label: t.design.verseStyles[v] })) } as Node;
      case 'hitStyle':
        return { ...f, options: HIT_STYLES.map((v) => ({ value: v, label: t.design.hitStyles[v] })) } as Node;
      case 'parts':
        return { ...f, options: (catalog?.parts ?? []).map((p) => ({ value: p.name, label: p.name })) } as Node;
      default:
        return f;
    }
  });
  return { ...schema, fields };
}
