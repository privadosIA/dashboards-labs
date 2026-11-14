import type { Lang } from '@lab/forms-kit';
import { pickSchema } from '@lab/forms-kit';
import type { DfFormSchema } from '@core/dynamic-forms';

import type { ToolId } from '../../video-edit/model';
import extendEn from './dynamic/extend.en.json';
import extendEs from './dynamic/extend.es.json';
import interpolateEn from './dynamic/interpolate.en.json';
import interpolateEs from './dynamic/interpolate.es.json';
import motionControlEn from './dynamic/motion-control.en.json';
import motionControlEs from './dynamic/motion-control.es.json';
import reframeEn from './dynamic/reframe.en.json';
import reframeEs from './dynamic/reframe.es.json';
import removeBackgroundEn from './dynamic/remove-background.en.json';
import removeBackgroundEs from './dynamic/remove-background.es.json';
import scaleEn from './dynamic/scale.en.json';
import scaleEs from './dynamic/scale.es.json';

/** The settings form of each tool, one JSON per language. A tool with no settings of its own (depth) has none. */
const FILES: Partial<Record<ToolId, { en: unknown; es: unknown }>> = {
  scale: { en: scaleEn, es: scaleEs },
  interpolate: { en: interpolateEn, es: interpolateEs },
  reframe: { en: reframeEn, es: reframeEs },
  'remove-background': { en: removeBackgroundEn, es: removeBackgroundEs },
  extend: { en: extendEn, es: extendEs },
  'motion-control': { en: motionControlEn, es: motionControlEs },
};

/** The schema of a tool's settings in a language, or null when the tool has no settings to ask for. */
export function settingsSchema(tool: ToolId, lang: Lang): DfFormSchema | null {
  const files = FILES[tool];
  return files ? pickSchema(tool, files, lang) : null;
}
