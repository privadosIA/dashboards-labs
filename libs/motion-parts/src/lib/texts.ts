export type MotionPartsLang = 'es' | 'en';

/** Every text of the form of a part's parameters, in each language. Add a key and TypeScript asks for both. */
export interface MotionPartsTexts {
  levels: string;
  /** A part that supports less than the level it is used at. */
  aboveLevel: string;
  noParams: string;
  /** The messages of a field that is refused; `{min}`, `{max}` and `{max}` of the length are filled in. */
  range: string;
  whole: string;
  maxLength: string;
  required: string;
}

const es: MotionPartsTexts = {
  levels: 'Niveles',
  aboveLevel: '(pide más nivel)',
  noParams: 'Esta parte no tiene parámetros.',
  range: 'Debe estar entre {min} y {max}.',
  whole: 'Debe ser un número entero.',
  maxLength: 'Puede tener hasta {max} caracteres.',
  required: 'Falta este valor.',
};

const en: MotionPartsTexts = {
  levels: 'Levels',
  aboveLevel: '(needs a higher level)',
  noParams: 'This part has no parameters.',
  range: 'It must be from {min} to {max}.',
  whole: 'It must be a whole number.',
  maxLength: 'It can have up to {max} characters.',
  required: 'This value is needed.',
};

/** The texts for a language; one the library has no texts for gets English. */
export const motionPartsTexts = (lang: string): MotionPartsTexts => (lang === 'es' ? es : en);
