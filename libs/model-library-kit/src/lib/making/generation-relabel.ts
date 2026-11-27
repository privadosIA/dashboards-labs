import { InjectionToken } from '@angular/core';

import type { Generation } from '../port';

/**
 * What a host that keeps client labels offers the list of generations: a way to change the label of one (it opens its own form and answers whether the label
 * changed) and the colour it draws a label with. A host that gives none (the library alone) shows the generations as before, with no label and no action.
 */
export interface GenerationRelabel {
  relabel(generation: Generation): Promise<boolean>;
  colorOf(client: string): string;
}

export const GENERATION_RELABEL = new InjectionToken<GenerationRelabel>('GENERATION_RELABEL');
