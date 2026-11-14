import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

import type { EnginesQuery } from '../kinds/kinds';
import type { EnginesView } from './model';

/** What the Engines panel needs from a server: read what a kind can run now, and start a stopped music service. */
export interface EnginesPort {
  /** The panel of a kind, read at the moment (never a table of the kit's own). */
  load(query: EnginesQuery): Observable<EnginesView>;
  /** Starts a stopped local music service (`POST /api/music/engines/{engine}/start`). */
  startMusic(engine: string): Observable<void>;
}

export const ENGINES = new InjectionToken<EnginesPort>('ENGINES');
