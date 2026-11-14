import type { DfFormSchema } from '@core/dynamic-forms';

import { withLock } from './lock';
import { readDefault, type Part, type PartParam } from './model';
import type { MotionPartsTexts } from './texts';

type Node = DfFormSchema['fields'][number];

const fill = (text: string, values: Record<string, number | undefined>): string => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/** What a field says when its value is not accepted: the limits of the parameter, in words. */
function messages(p: PartParam, t: MotionPartsTexts): Record<string, string> {
  const range = fill(t.range, { min: p.min, max: p.max });
  return {
    required: t.required,
    min: range,
    max: range,
    pattern: p.type === 'int' ? t.whole : range,
    maxLength: fill(t.maxLength, { max: p.maxLength }),
  };
}

/** The field of one parameter: its type says which control, its limits become the field's rules, its default starts it. */
function fieldOf(p: PartParam, t: MotionPartsTexts): Node {
  const def = readDefault(p);
  const base = { key: p.name, label: p.name, ...(def !== undefined ? { defaultValue: def } : {}), ...(p.description ? { placeholder: p.description } : {}) };
  switch (p.type) {
    case 'bool':
      return { ...base, type: 'checkbox' } as Node;
    case 'enum':
      return { ...base, type: 'select', options: (p.options ?? []).map((o) => ({ value: o, label: o })) } as Node;
    case 'int':
    case 'number':
      return {
        ...base,
        type: 'number',
        validation: { required: true, ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}), ...(p.type === 'int' ? { pattern: '^-?[0-9]+$' } : {}), messages: messages(p, t) },
      } as Node;
    default:
      return { ...base, type: 'text', validation: { ...(p.maxLength !== undefined ? { maxLength: p.maxLength } : {}), messages: messages(p, t) } } as Node;
  }
}

/** The form of a part's parameters, made from what the catalog says about it (it is known only when the catalog arrives). */
export const buildParamsSchema = (part: Part, t: MotionPartsTexts): DfFormSchema => withLock({ version: '1.0', id: `params-${part.name}`, layout: { columns: 2 }, fields: part.params.map((p) => fieldOf(p, t)) });

type FormModel = Record<string, unknown>;

/** The values the form starts with: the piece's, and a parameter it has none for takes the part's default. */
export function toParamsModel(part: Part, values: Readonly<Record<string, unknown>> | undefined): FormModel {
  const model: FormModel = {};
  for (const p of part.params) model[p.name] = values?.[p.name] ?? readDefault(p) ?? (p.type === 'bool' ? false : '');
  return model;
}

/**
 * The parameters the form holds, as the types the server wants: a whole number, a number, a switch, a text. A number field
 * that is empty or not a number is left out (the server's rule decides what that means).
 */
export function fromParamsModel(part: Part, model: FormModel): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of part.params) {
    const v = model[p.name];
    switch (p.type) {
      case 'int':
      case 'number': {
        const n = typeof v === 'number' ? v : v === '' || v == null ? NaN : Number(v);
        if (Number.isFinite(n) && (p.type === 'number' || Number.isInteger(n))) out[p.name] = n;
        break;
      }
      case 'bool':
        out[p.name] = v === true;
        break;
      default:
        if (typeof v === 'string') out[p.name] = v;
    }
  }
  return out;
}
