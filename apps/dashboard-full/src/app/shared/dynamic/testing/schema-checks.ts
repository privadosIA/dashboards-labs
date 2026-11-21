import { TestBed } from '@angular/core/testing';
import { DfFormSchema, SchemaValidatorService } from '@core/dynamic-forms';

import { SchemasByLang } from '../schema-loader';
import { splitAtSlots } from '../slots/split-schema';

/** The schema respects the library's contract (a schema with slots is checked run by run, as it is rendered). */
export function schemaIssues(schema: unknown): string[] {
  const validator = TestBed.inject(SchemaValidatorService);
  const forms = splitAtSlots(schema as DfFormSchema).flatMap((s) => (s.schema ? [s.schema] : []));
  return forms.flatMap((f) => validator.validate(f).errors.map((e) => `${e.path}: ${e.message}`));
}

interface Node {
  key?: string;
  id?: string;
  type?: string;
  logic?: unknown;
  fields?: Node[];
  /** A group's column count, or a table's columns. */
  columns?: Node[] | number;
}

/** What the languages must share: the nodes, their order, types and conditions (never the texts). */
function skeleton(nodes: Node[] | undefined): unknown[] {
  return (nodes ?? []).map((n) => ({
    key: n.key,
    id: n.id,
    type: n.type,
    logic: n.logic,
    fields: skeleton(n.fields),
    columns: Array.isArray(n.columns) ? skeleton(n.columns) : n.columns,
  }));
}

/** The English and Spanish schemas have the same fields in the same order with the same conditions. */
export function skeletonsDiffer(byLang: SchemasByLang): boolean {
  const [a, b] = Object.values(byLang) as { fields?: Node[] }[];
  return JSON.stringify(skeleton(a.fields)) !== JSON.stringify(skeleton(b.fields));
}
