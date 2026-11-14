import { signal } from '@angular/core';

import { EngineAvailability } from './api.models';

/** A stand-in for EnginesStore in tests that do not care about the optional engines: nothing is available and nothing is asked. */
export function fakeEngines(heartmula: EngineAvailability | null = null, diffrhythm2: EngineAvailability | null = null) {
  const data = signal<Record<string, EngineAvailability> | null>(heartmula || diffrhythm2 ? { ...(heartmula ? { heartmula } : {}), ...(diffrhythm2 ? { diffrhythm2 } : {}) } : null);
  return {
    data,
    heartmula: signal(heartmula),
    heartmulaAvailable: signal(heartmula?.available === true || heartmula?.reason === 'not_running'),
    heartmulaInstallable: signal(false),
    heartmulaStopped: signal(heartmula?.reason === 'not_running'),
    diffrhythm2: signal(diffrhythm2),
    diffrhythm2Available: signal(diffrhythm2?.available === true || diffrhythm2?.reason === 'not_running'),
    diffrhythm2Installable: signal(false),
    diffrhythm2Stopped: signal(diffrhythm2?.reason === 'not_running'),
    refresh: () => Promise.resolve(),
  };
}
