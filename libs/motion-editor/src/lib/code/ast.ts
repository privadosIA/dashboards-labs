import type { Range } from './tokens';

/** The tree of the dialect: only what its grammar has. Every node knows where it was written. */

export interface StringNode {
  readonly kind: 'string';
  readonly value: string;
  readonly range: Range;
}

export interface NumberNode {
  readonly kind: 'number';
  readonly value: number;
  readonly range: Range;
}

export interface BoolNode {
  readonly kind: 'bool';
  readonly value: boolean;
  readonly range: Range;
}

export interface ArrayNode {
  readonly kind: 'array';
  readonly items: readonly Expr[];
  readonly range: Range;
}

export interface Prop {
  readonly key: string;
  readonly keyRange: Range;
  readonly value: Expr;
  readonly range: Range;
}

export interface ObjectNode {
  readonly kind: 'object';
  readonly props: readonly Prop[];
  readonly range: Range;
}

/** `piece(...)`, `layer(...)`, `item(...)`, `beat(...)`, `section(...)`, `line(...)`, `kf(...)` or `parts.<name>(...)`. */
export interface CallNode {
  readonly kind: 'call';
  /** `piece`, `beat`, `section`, `line` or `parts`. */
  readonly callee: string;
  /** The part's camel-cased name, for `parts.<name>`. */
  readonly member?: string;
  readonly calleeRange: Range;
  readonly args: readonly Expr[];
  readonly range: Range;
}

/** `section(...).start`, `chorus.start` (a constant) or `song.end`. */
export interface MemberNode {
  readonly kind: 'member';
  readonly object: CallNode | IdentNode;
  readonly name: string;
  readonly range: Range;
}

/** A reference to a top-level constant, or `song`. */
export interface IdentNode {
  readonly kind: 'ident';
  readonly name: string;
  readonly range: Range;
}

/** Where the parser met something outside the dialect: it was reported and this stands in its place. */
export interface InvalidNode {
  readonly kind: 'invalid';
  readonly range: Range;
}

export type Expr = StringNode | NumberNode | BoolNode | ArrayNode | ObjectNode | CallNode | MemberNode | IdentNode | InvalidNode;

export interface ImportNode {
  readonly names: readonly string[];
  readonly range: Range;
}

export interface ConstNode {
  readonly name: string;
  readonly nameRange: Range;
  readonly value: Expr;
  readonly range: Range;
}

export interface ScriptFile {
  readonly import?: ImportNode;
  readonly consts: readonly ConstNode[];
  /** The array inside `export default script([...])`; absent when the export is missing or broken. */
  readonly pieces?: ArrayNode;
  /** The second argument of `script`: the list of `layer(...)`, when there is one. */
  readonly layers?: ArrayNode;
  readonly range: Range;
}
