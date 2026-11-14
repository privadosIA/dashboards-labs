import type { DfFormSchema } from '@core/dynamic-forms';

import { hitWords, wordsOf, type Catalog, type Level, type ScriptPiece } from '@lab/animation-core';
import type { Texts } from '../../core/texts';
import { withLock } from '../../shared/lock';
import { keywordKey } from './row-model';

type Node = DfFormSchema['fields'][number];

/** The hidden fields that say the first piece cannot start later and the last cannot end earlier: they are the song's. */
export const FIXED_START = 'fixedStart';
export const FIXED_END = 'fixedEnd';

/**
 * The form of one piece of the script, made when its catalog arrives: the part to choose (one that needs more level than
 * the piece has is marked, not hidden: the server replaces it), the mode, the two cuts, a keyword to choose among the
 * words of each line and the word hit with its time and length. The song's own start and end cannot be edited.
 */
export function buildRowSchema(piece: ScriptPiece, catalog: Catalog, level: Level, t: Texts['script']): DfFormSchema {
  const extras = new Set((piece.with ?? []).map((x) => x.part));
  const parts = catalog.parts.filter((p) => p.name === piece.part || !extras.has(p.name)).map((p) => ({ value: p.name, label: p.levels.includes(level) ? p.name : `${p.name} ${t.aboveLevel}` }));
  const modes = catalog.modes.map((m) => ({ value: m, label: m }));
  const none = { value: '', label: t.none };
  const time = (key: string, label: string, fixed?: string): Node =>
    ({ key, type: 'number', label, validation: { required: true, min: 0 }, ...(fixed ? { logic: { disabledWhen: { field: fixed, operator: 'truthy' } } } : {}) }) as Node;
  const fields: Node[] = [
    { key: FIXED_START, type: 'hidden', defaultValue: false } as Node,
    { key: FIXED_END, type: 'hidden', defaultValue: false } as Node,
    { key: 'part', type: 'select', label: t.part, options: parts } as Node,
    { key: 'mode', type: 'radio', label: t.mode, props: { inline: true }, options: modes } as Node,
    time('start', t.start, FIXED_START),
    time('end', t.end, FIXED_END),
    ...(piece.lines ?? []).map((line, n) => ({ key: keywordKey(n), type: 'select', label: `${t.keyword}: ${line.text ?? ''}`.trim(), options: [none, ...wordsOf(line).map((w) => ({ value: w, label: w }))] }) as Node),
  ];
  const words = hitWords(piece);
  if (words.length) {
    const shown = { showWhen: { field: 'hitWord', operator: 'notEmpty' }, resetOnHide: false };
    fields.push(
      { key: 'hitWord', type: 'select', label: t.hitWord, options: [none, ...words.map((w) => ({ value: w, label: w }))] } as Node,
      { key: 'hitAt', type: 'number', label: t.hitAt, logic: shown } as Node,
      { key: 'hitLength', type: 'number', label: t.hitLength, validation: { min: 0.1 }, logic: shown } as Node,
    );
  }
  return withLock({ version: '1.0', id: `script-row-${piece.id}`, layout: { columns: 2 }, fields });
}
