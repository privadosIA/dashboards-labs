import type { Warning } from '../store/checks';
import { warningText } from '../store/warning-text';
import { motionEditorTexts, type MotionEditorLang } from '../texts';
import type { Range } from './tokens';

/** What the parser and the mapper can say about the code, each with the arguments its message needs. */
export type DiagnosticCode =
  | 'unterminated-string'
  | 'unterminated-comment'
  | 'bad-escape'
  | 'bad-number'
  | 'unexpected-character'
  | 'not-representable'
  | 'expected'
  | 'missing-export'
  | 'bad-import'
  | 'duplicate-const'
  | 'unknown-const'
  | 'const-later'
  | 'not-a-piece'
  | 'piece-needs'
  | 'unknown-key'
  | 'duplicate-id'
  | 'no-from'
  | 'bad-end'
  | 'time-expected'
  | 'time-range'
  | 'beat-range'
  | 'beat-fraction'
  | 'no-section'
  | 'no-line'
  | 'bad-value'
  | 'bad-call'
  | 'unknown-part'
  | 'unknown-param'
  | 'param-type'
  | 'param-option'
  | 'param-whole'
  | 'param-min'
  | 'param-max'
  | 'param-length'
  | 'extra-collision'
  | 'extras-limit'
  | 'not-animatable'
  | 'kf-empty'
  | 'kf-outside'
  | 'kf-order'
  | 'no-animate'
  | 'no-layers'
  | 'not-a-layer'
  | 'layer-problem'
  | 'check';

export type DiagnosticArgs = Readonly<Record<string, string | number>>;

export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: DiagnosticCode;
  readonly args: DiagnosticArgs;
  /** In English; `diagnosticText` gives it in the language asked for. */
  readonly message: string;
  /** From 1, as Monaco counts. `endColumn` is just after the last character. */
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly pieceId?: string;
  /** The editor's own check this stands for (code `check`), which has its words in both languages. */
  readonly warning?: Warning;
}

type Make = (a: DiagnosticArgs) => string;

const EN: Record<DiagnosticCode, Make> = {
  'unterminated-string': () => 'The text is not closed.',
  'unterminated-comment': () => 'The comment is not closed.',
  'bad-escape': (a) => `${a['text']} is not an escape the text can have.`,
  'bad-number': (a) => `${a['text']} is not a number.`,
  'unexpected-character': (a) => `Unexpected character ${a['text']}.`,
  'not-representable': (a) => `not representable: ${a['what']}`,
  expected: (a) => `Expected ${a['what']}.`,
  'missing-export': () => 'The script must end with export default script([ ... ]).',
  'bad-import': () => "Only one import is allowed: import { ... } from '@motion/script'.",
  'duplicate-const': (a) => `The constant ${a['name']} is already defined.`,
  'unknown-const': (a) => `${a['name']} is not a constant of this script.`,
  'const-later': (a) => `The constant ${a['name']} is defined further down: define it before using it.`,
  'not-a-piece': () => 'Each item of the script must be a piece({ ... }).',
  'piece-needs': (a) => `A piece needs "${a['key']}".`,
  'unknown-key': (a) => `"${a['key']}" is not something ${a['where']} has; put fields the editor does not know in extra.`,
  'duplicate-id': (a) => `Another piece is already called "${a['id']}".`,
  'no-from': () => 'The first piece needs from (where it starts).',
  'bad-end': (a) => `This piece ends at ${a['end']} s, not after its start (${a['start']} s).`,
  'time-expected': () => 'A time is a number of seconds, beat(n), section(tag).start or .end, or song.end.',
  'time-range': () => 'A time cannot be negative.',
  'beat-range': (a) => `The song has beats ${a['first']} to ${a['last']}; there is no beat ${a['n']}.`,
  'beat-fraction': () => 'The part of the beat must be at least 0 and less than 1.',
  'no-section': (a) => (a['k'] === undefined ? `The song has no "${a['tag']}" section.` : `The song has no "${a['tag']}" section number ${a['k']}.`),
  'no-line': (a) => `The song has no line ${a['n']}.`,
  'bad-value': (a) => `Expected ${a['what']}.`,
  'bad-call': (a) => `${a['name']} takes ${a['what']}.`,
  'unknown-part': (a) => `The part "${a['name']}" is not in the catalog.`,
  'unknown-param': (a) => `The part "${a['part']}" has no parameter "${a['param']}".`,
  'param-type': (a) => `"${a['param']}" must be ${a['type']}.`,
  'param-option': (a) => `"${a['param']}" must be one of: ${a['options']}.`,
  'param-whole': (a) => `"${a['param']}" must be a whole number.`,
  'param-min': (a) => `"${a['param']}" must be at least ${a['limit']}.`,
  'param-max': (a) => `"${a['param']}" must be at most ${a['limit']}.`,
  'param-length': (a) => `"${a['param']}" must be at most ${a['limit']} characters.`,
  'extra-collision': (a) => `"${a['key']}" is something the piece already has: write it there, not in extra.`,
  'extras-limit': (a) => `A piece takes at most ${a['limit']} extra parts.`,
  'not-animatable': (a) => `The parameter "${a['param']}" of "${a['part']}" cannot be animated.`,
  'kf-empty': (a) => `The animation of "${a['param']}" needs at least one kf(...).`,
  'kf-outside': (a) => `This keyframe is at ${a['t']} s, outside the ${a['of'] ?? 'piece'} (0 s to ${a['length']} s).`,
  'kf-order': () => 'Each keyframe must be after the one before it.',
  'no-animate': () => 'This server does not take animated parameters.',
  'no-layers': () => 'This server does not take layers.',
  'not-a-layer': () => 'Each item of the layers must be a layer(id, [item(...), ...]).',
  'layer-problem': (a) => String(a['text']),
  check: (a) => String(a['text']),
};

const ES: Record<DiagnosticCode, Make> = {
  'unterminated-string': () => 'El texto no está cerrado.',
  'unterminated-comment': () => 'El comentario no está cerrado.',
  'bad-escape': (a) => `${a['text']} no es un escape que el texto pueda tener.`,
  'bad-number': (a) => `${a['text']} no es un número.`,
  'unexpected-character': (a) => `Carácter inesperado ${a['text']}.`,
  'not-representable': (a) => `no representable: ${a['what']}`,
  expected: (a) => `Se esperaba ${a['what']}.`,
  'missing-export': () => 'El guion debe terminar con export default script([ ... ]).',
  'bad-import': () => "Solo se admite un import: import { ... } from '@motion/script'.",
  'duplicate-const': (a) => `La constante ${a['name']} ya está definida.`,
  'unknown-const': (a) => `${a['name']} no es una constante de este guion.`,
  'const-later': (a) => `La constante ${a['name']} se define más abajo: defínela antes de usarla.`,
  'not-a-piece': () => 'Cada elemento del guion debe ser un piece({ ... }).',
  'piece-needs': (a) => `Una pieza necesita «${a['key']}».`,
  'unknown-key': (a) => `«${a['key']}» no es algo que tenga ${a['where']}; los campos que el editor no conoce van en extra.`,
  'duplicate-id': (a) => `Otra pieza ya se llama «${a['id']}».`,
  'no-from': () => 'La primera pieza necesita from (dónde empieza).',
  'bad-end': (a) => `Esta pieza acaba en ${a['end']} s, que no es después de su inicio (${a['start']} s).`,
  'time-expected': () => 'Un tiempo es un número de segundos, beat(n), section(tag).start o .end, o song.end.',
  'time-range': () => 'Un tiempo no puede ser negativo.',
  'beat-range': (a) => `La canción tiene los pulsos ${a['first']} a ${a['last']}; no hay pulso ${a['n']}.`,
  'beat-fraction': () => 'La parte del pulso debe ser al menos 0 y menos de 1.',
  'no-section': (a) => (a['k'] === undefined ? `La canción no tiene sección «${a['tag']}».` : `La canción no tiene la sección «${a['tag']}» número ${a['k']}.`),
  'no-line': (a) => `La canción no tiene la línea ${a['n']}.`,
  'bad-value': (a) => `Se esperaba ${a['what']}.`,
  'bad-call': (a) => `${a['name']} admite ${a['what']}.`,
  'unknown-part': (a) => `La parte «${a['name']}» no está en el catálogo.`,
  'unknown-param': (a) => `La parte «${a['part']}» no tiene el parámetro «${a['param']}».`,
  'param-type': (a) => `«${a['param']}» debe ser ${a['type']}.`,
  'param-option': (a) => `«${a['param']}» debe ser una de: ${a['options']}.`,
  'param-whole': (a) => `«${a['param']}» debe ser un número entero.`,
  'param-min': (a) => `«${a['param']}» debe ser al menos ${a['limit']}.`,
  'param-max': (a) => `«${a['param']}» debe ser como mucho ${a['limit']}.`,
  'param-length': (a) => `«${a['param']}» debe tener como mucho ${a['limit']} caracteres.`,
  'extra-collision': (a) => `«${a['key']}» es algo que la pieza ya tiene: escríbelo ahí, no en extra.`,
  'extras-limit': (a) => `Una pieza admite como mucho ${a['limit']} partes extra.`,
  'not-animatable': (a) => `El parámetro «${a['param']}» de «${a['part']}» no se puede animar.`,
  'kf-empty': (a) => `La animación de «${a['param']}» necesita al menos un kf(...).`,
  'kf-outside': (a) => `Este fotograma clave está en ${a['t']} s, fuera de ${a['of'] === 'item' ? 'el elemento' : 'la pieza'} (de 0 s a ${a['length']} s).`,
  'kf-order': () => 'Cada fotograma clave debe ir después del anterior.',
  'no-animate': () => 'Este servidor no admite parámetros animados.',
  'no-layers': () => 'Este servidor no admite capas.',
  'not-a-layer': () => 'Cada elemento de las capas debe ser un layer(id, [item(...), ...]).',
  // The server's own sentence, which stays in its words.
  'layer-problem': (a) => String(a['text']),
  check: (a) => String(a['text']),
};

/** What the construct a `not representable` names, in the language of the person (the word the parser keeps in `args.what` is English). */
const WHAT_ES: Readonly<Record<string, string>> = {
  'arrow function': 'función flecha',
  'template literal': 'plantilla de texto',
  arithmetic: 'aritmética',
  spread: 'propagación (...)',
  'computed key': 'clave calculada',
  'shorthand property': 'propiedad abreviada',
  method: 'método',
  statement: 'sentencia',
  'import of another module': 'import de otro módulo',
  'new expression': 'expresión new',
  'unary operator': 'operador unario',
  'parenthesised expression': 'expresión entre paréntesis',
  'numeric key': 'clave numérica',
  'optional chaining': 'encadenado opcional (?.)',
  comparison: 'comparación',
  conditional: 'condicional',
  'computed member access': 'acceso calculado a un miembro',
  'member access': 'acceso al miembro',
  'call of': 'llamada a',
};

export function diagnosticText(d: Pick<Diagnostic, 'code' | 'args' | 'message' | 'warning'>, lang: MotionEditorLang): string {
  if (d.warning) return warningText(motionEditorTexts(lang), d.warning);
  if (lang === 'en') return d.message;
  const args = d.code === 'not-representable' ? { ...d.args, what: translateWhat(String(d.args['what'] ?? '')) } : d.args;
  return ES[d.code](args);
}

function translateWhat(what: string): string {
  const key = Object.keys(WHAT_ES).find((k) => what === k || what.startsWith(`${k} `));
  return key ? `${WHAT_ES[key]}${what.slice(key.length)}` : what;
}

export function diagnostic(severity: Diagnostic['severity'], code: DiagnosticCode, args: DiagnosticArgs, range: Range, pieceId?: string, warning?: Warning): Diagnostic {
  return {
    severity,
    code,
    args,
    message: EN[code](args),
    line: range.start.line,
    column: range.start.column,
    endLine: range.end.line,
    endColumn: range.end.column,
    ...(pieceId !== undefined ? { pieceId } : {}),
    ...(warning ? { warning } : {}),
  };
}
