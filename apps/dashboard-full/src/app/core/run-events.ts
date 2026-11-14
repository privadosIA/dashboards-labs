import { Injectable, signal } from '@angular/core';

/** Tells the rest of the page that a run it follows has just ended (no dependencies, so any stream can report it). */
@Injectable({ providedIn: 'root' })
export class RunEvents {
  readonly ended = signal(0);
}
