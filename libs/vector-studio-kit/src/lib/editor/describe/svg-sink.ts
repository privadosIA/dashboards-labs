import { Injectable, inject } from '@angular/core';
import { ANIMATION } from '@lab/music-motion';
import type { SinkModels, VectorSvgSink } from '@lab/vector-editor';
import { map, type Observable } from 'rxjs';

/** Where the model chosen last time is kept (a convenience of this browser: without storage the dialog just starts from the server's own). */
export const MODEL_KEY = 'vector-studio.model';

export function rememberedModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberModel(model: string): void {
  try {
    if (model) localStorage.setItem(MODEL_KEY, model);
    else localStorage.removeItem(MODEL_KEY);
  } catch {
    // Not kept: the next visit starts from the server's model.
  }
}

/**
 * The describe dialog's assistant, over the port the dashboard already has (`ANIMATION`: the server's adapter or the in-memory one). A failure of the port
 * reaches the dialog as an `Error` whose message is the server's own words; unsubscribing cancels the request.
 */
@Injectable()
export class SvgSink implements VectorSvgSink {
  private readonly port = inject(ANIMATION);

  models(): Observable<SinkModels> {
    return this.port.assistModels();
  }

  write(text: string, model: string, provider = ''): Observable<string> {
    return this.port.writeSvg({ text, ...(model ? { model } : {}), ...(provider ? { provider } : {}) }).pipe(map((svg) => svg));
  }
}
