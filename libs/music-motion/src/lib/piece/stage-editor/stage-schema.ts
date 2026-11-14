import type { DfFormSchema } from '@core/dynamic-forms';

import type { Catalog, Stage } from '@lab/animation-core';
import type { Texts } from '../../core/texts';
import { withLock } from '../../shared/lock';
import { charKey } from './stage-model';

type Node = DfFormSchema['fields'][number];

/**
 * The stage's form, made from the catalog: the backgrounds, and for each character the characters, and the poses and
 * expressions of the one it is now, the actions and its place. Only what the catalog has can be chosen.
 */
export function buildStageSchema(stage: Stage | undefined, catalog: Catalog, t: Texts['stage']): DfFormSchema {
  const none = { value: '', label: t.none };
  const list = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
  const number = (key: string, label: string, min: number, max: number): Node => ({ key, type: 'number', label, validation: { required: true, min, max } }) as Node;
  const fields: Node[] = [{ key: 'background', type: 'select', label: t.background, options: [none, ...list(catalog.backgrounds.map((b) => b.name))] } as Node];
  (stage?.characters ?? []).forEach((c, i) => {
    const entry = catalog.characters.find((x) => x.name === c.character);
    fields.push(
      { key: charKey(i, 'character'), type: 'select', label: `${t.character} ${i + 1}`, options: list(catalog.characters.map((x) => x.name)) } as Node,
      { key: charKey(i, 'pose'), type: 'select', label: t.pose, options: list(entry?.poses ?? (c.pose ? [c.pose] : [])) } as Node,
      { key: charKey(i, 'expression'), type: 'select', label: t.expression, options: list(entry?.expressions ?? (c.expression ? [c.expression] : [])) } as Node,
      { key: charKey(i, 'action'), type: 'select', label: t.action, options: [none, ...list(catalog.actions)] } as Node,
      number(charKey(i, 'x'), t.x, 0, 100),
      number(charKey(i, 'y'), t.y, 0, 100),
      number(charKey(i, 'size'), t.size, 1, 100),
    );
  });
  return withLock({ version: '1.0', id: 'stage', layout: { columns: 3 }, fields });
}
