import { InjectionToken } from '@angular/core';
import { ANIMATION } from '@lab/animation-core';

import type { InMemoryAnimation } from './in-memory.adapter';

export { ANIMATION };

/** The in-memory adapter, when the host chose it (`memory`); `null` when the screens talk to a server. It can load the sample. */
export const IN_MEMORY_ANIMATION = new InjectionToken<InMemoryAnimation | null>('IN_MEMORY_ANIMATION');
