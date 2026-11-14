import type { DfFormSchema } from '@core/dynamic-forms';

type Node = DfFormSchema['fields'][number];

import { HIT_STYLES, VERSE_STYLES, type Catalog } from '@lab/animation-core';
import type { Texts } from '../../core/texts';
import { withLock } from '../../shared/lock';
import { modeKey } from './design-model';

/**
 * The design schema with what the server owns filled in: the typefaces and the modes from the catalog, a mode choice for
 * each section tag of the song, and the lock that disables every field while the piece is being drawn. Before the catalog
 * arrives the choices have no options, which the library accepts as long as the key is there.
 */
export function withDesignCatalog(schema: DfFormSchema, catalog: Catalog | null, tags: readonly string[], t: Texts['design']): DfFormSchema {
  const modes = (catalog?.modes ?? []).map((m) => ({ value: m, label: t.modes[m] ?? m }));
  const fonts = (catalog?.fonts ?? []).map((f) => ({ value: f, label: f }));
  const fields = schema.fields.flatMap((f): Node[] => {
    if (!('key' in f)) return [f];
    if (f.key === 'display' || f.key === 'body') return [{ ...f, options: fonts } as Node];
    if (f.key === 'defaultMode') {
      const perTag = tags.map((tag, i) => ({ key: modeKey(i), type: 'radio', label: `${t.modeOf} ${tag}`, defaultValue: 'dark', props: { inline: true }, layout: { cssClass: 'mode-field' }, options: modes }) as Node);
      return [{ ...f, options: modes } as Node, ...perTag];
    }
    if (f.key === 'verseStyle') return [{ ...f, options: VERSE_STYLES.map((v) => ({ value: v, label: t.verseStyles[v] })) } as Node];
    if (f.key === 'hitStyle') return [{ ...f, options: HIT_STYLES.map((v) => ({ value: v, label: t.hitStyles[v] })) } as Node];
    return [f];
  });
  return withLock({ ...schema, fields });
}
