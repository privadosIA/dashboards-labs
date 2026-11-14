import { DfFormSchema } from '@core/dynamic-forms';

/** What a static file cannot hold about one field: what the project gives, and limits that depend on the engine. */
export interface FieldOverride {
  placeholder?: string;
  /** HTML attributes of the control (`min`, `max`, `step`…), laid over the ones the file has. */
  attributes?: Record<string, unknown>;
}

interface Node {
  key?: string;
  placeholder?: string;
  props?: { attributes?: Record<string, unknown> } & Record<string, unknown>;
  fields?: Node[];
}

/**
 * The schema with the overrides laid over its fields, by key (also inside groups
 * and slots that hold fields). Only `placeholder` and the control's attributes
 * change, never the structure; a key with no override is left as the file has it.
 */
export function withFieldOverrides(schema: DfFormSchema, overrides: Record<string, FieldOverride | undefined>): DfFormSchema {
  const walk = (nodes: Node[] | undefined): Node[] | undefined =>
    nodes?.map((n) => {
      const o = n.key !== undefined ? overrides[n.key] : undefined;
      const props = o?.attributes ? { ...n.props, attributes: { ...n.props?.attributes, ...o.attributes } } : n.props;
      return {
        ...n,
        ...(o?.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
        ...(props ? { props } : {}),
        ...(n.fields ? { fields: walk(n.fields) } : {}),
      };
    });
  return { ...schema, fields: walk(schema.fields as Node[]) } as DfFormSchema;
}

/** The overrides that are only a placeholder each. */
export function placeholdersOnly(placeholders: Record<string, string | undefined>): Record<string, FieldOverride> {
  return Object.fromEntries(Object.entries(placeholders).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { placeholder: v }]));
}
