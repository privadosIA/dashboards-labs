import type { DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import en from './dynamic/design-form.en.json';
import es from './dynamic/design-form.es.json';

/** The schema of the song's design form in a language: colours, typefaces, the mode of each section, the concept and the two styles. */
export const designFormSchema = (lang: 'es' | 'en'): DfFormSchema => pickSchema('design-form', { en, es }, lang);
