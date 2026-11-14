import type { DfFormSchema } from '@core/dynamic-forms';
import type { Lang } from '@lab/forms-kit';
import { pickSchema } from '@lab/forms-kit';

import motionAddEn from './dynamic/motion-add.en.json';
import motionAddEs from './dynamic/motion-add.es.json';

/** The form that adds a motion (title, tags and the address of a video), in a language. */
export const motionAddSchema = (lang: Lang): DfFormSchema | null => pickSchema('motion-add', { en: motionAddEn, es: motionAddEs }, lang);
