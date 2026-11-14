import type { DfFormSchema } from '@core/dynamic-forms';

import { HIT_STYLES, VERSE_STYLES, type Catalog, type Design } from '@lab/animation-core';
import type { Texts } from '../../../core/texts';
import { withLock } from '../../../shared/lock';

type Node = DfFormSchema['fields'][number];

/**
 * The schema of a piece's own design with what the server and the song own filled in: the typefaces and styles to choose
 * (the empty choice says what the song has), and the song's colours as the hint of each colour field.
 */
export function withPieceDesign(schema: DfFormSchema, catalog: Catalog, song: Design, t: Texts): DfFormSchema {
  const songs = (v: string): string => t.script.songValue.replace('{value}', v);
  const fonts = (own: string) => [{ value: '', label: songs(own) }, ...catalog.fonts.map((f) => ({ value: f, label: f }))];
  const styles = <K extends string>(own: string | undefined, all: readonly K[], names: Record<K, string>) => [{ value: '', label: songs(own ? (names[own as K] ?? own) : names[all[0]]) }, ...all.map((s) => ({ value: s, label: names[s] }))];
  const fields = schema.fields.map((f): Node => {
    if (!('key' in f)) return f;
    switch (f.key) {
      case 'dark':
      case 'light':
      case 'accent':
        return { ...f, placeholder: songs(song[f.key]) } as Node;
      case 'display':
      case 'body':
        return { ...f, options: fonts(song[f.key]) } as Node;
      case 'verse_style':
        return { ...f, options: styles(song.verseStyle, VERSE_STYLES, t.design.verseStyles) } as Node;
      case 'hit_style':
        return { ...f, options: styles(song.hitStyle, HIT_STYLES, t.design.hitStyles) } as Node;
      default:
        return f;
    }
  });
  return withLock({ ...schema, fields });
}
