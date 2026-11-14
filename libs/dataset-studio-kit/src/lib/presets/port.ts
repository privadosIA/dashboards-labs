import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

import type { ImportReport, NewPreset, Preset, PresetList, PresetQuery } from './model';

/** The library of prompt presets: for people to pick from, and for the assistant to receive as examples. */
export interface PromptsPort {
  /** The presets a query asks for, best match first. */
  list(query: PresetQuery): Observable<PresetList>;
  /** Adds one of the person's own. */
  add(preset: NewPreset): Observable<Preset>;
  /** Deletes one of the person's own; a bundled or imported one cannot be deleted. */
  remove(id: string): Observable<void>;
  /** Imports a bundle (`format: prompt-presets`, `version: 1`): every item needs a `source` and a `licence`. */
  importBundle(bundle: unknown): Observable<ImportReport>;
}

export const PROMPTS = new InjectionToken<PromptsPort>('PROMPTS');
