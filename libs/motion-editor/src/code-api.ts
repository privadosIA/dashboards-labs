// The script as code: kept out of the main entry so the application's first bundle does not carry it; only the editor page, which is lazy, imports it.
export { parse, type ParseResult } from './lib/code/parse';
export { tokenize, type Comment, type Pos, type Range, type Token } from './lib/code/tokens';
export type { ArrayNode, CallNode, ConstNode, Expr, ObjectNode, Prop, ScriptFile } from './lib/code/ast';
export { diagnostic, diagnosticText, type Diagnostic, type DiagnosticCode } from './lib/code/diagnostics';
export { anchorFor, resolveTime, tagOf, type Resolved, type TimeRef } from './lib/code/anchors';
export { mapCode, toScript, type MapOptions, type MapResult, type PieceSite } from './lib/code/to-script';
export { toCode, jsonCode, quote } from './lib/code/to-code';
export { declarationsFor, SCRIPT_DECLARATIONS_PATH, SCRIPT_MODULE } from './lib/code/declarations';
export { camelName, snakeName } from './lib/code/names';
