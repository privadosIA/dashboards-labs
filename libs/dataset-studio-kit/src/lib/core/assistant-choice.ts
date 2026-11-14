import { Injectable, signal } from '@angular/core';
import type { Assistant } from '@lab/assist-kit';

/** The assistant chosen for the whole studio: the Providers tab sets it and Generate reads it, so it outlives the page that is open. */
@Injectable({ providedIn: 'root' })
export class AssistantChoice {
  readonly value = signal<Assistant>({ provider: '', model: '' });
}
