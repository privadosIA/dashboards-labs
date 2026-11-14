import { type Observable, defer, of } from 'rxjs';

import type { EnginesQuery } from '../kinds/kinds';
import type { EnginesView } from './model';
import type { EnginesPort } from './port';

/** The panels with no server: fixed, plausible values (a stopped HeartMuLa that starts, an engine this machine cannot run, a model with a measured time and one without). */
export class InMemoryEngines implements EnginesPort {
  private readonly started = new Set<string>();

  load(query: EnginesQuery): Observable<EnginesView> {
    return defer(() => {
      switch (query) {
        case 'music-engines':
          return of<EnginesView>({
            kind: 'music',
            cards: [
              { id: 'ace-step', name: 'ACE-Step', state: 'ready', source: 'none', isDefault: true },
              { id: 'heartmula', name: 'HeartMuLa', state: this.started.has('heartmula') ? 'ready' : 'stopped', ...(this.started.has('heartmula') ? {} : { reason: 'not_running' }), source: 'none' },
              { id: 'diffrhythm2', name: 'DiffRhythm2', state: 'unavailable', reason: 'no_gpu', source: 'none' },
            ],
          });
        case 'generation-options':
          return of<EnginesView>({
            kind: 'video',
            cards: [
              { id: 'h3-full', name: 'MiniMax H3', state: 'unavailable', reason: 'not enough video memory', audio: true, clipSeconds: 6, seconds: 420, source: 'server' },
              { id: 'ltx', name: 'LTX 2.3', state: 'ready', audio: true, clipSeconds: 5, seconds: 180, source: 'server', isDefault: true },
              { id: 'wan-medium', name: 'Wan 2.2', state: 'ready', audio: false, clipSeconds: 4, seconds: 240, source: 'server' },
            ],
          });
        case 'image-models':
          return of<EnginesView>({
            kind: 'images',
            cards: [
              { id: 'v1-5-pruned-emaonly.safetensors', name: 'Stable Diffusion 1.5', state: 'ready', seconds: 6, source: 'history', styles: ['general'], rank: 2 },
              { id: 'juggernautXL_v9.safetensors', name: 'Juggernaut XL v9 (SDXL, photorealistic)', description: 'Photorealistic.', state: 'ready', seconds: 14, source: 'catalog', sourceNote: '1024x1024', measured: false, styles: ['photo'], rank: 3 },
              { id: 'ponyDiffusionV6XL.safetensors', name: 'Pony Diffusion V6 XL (SDXL, illustration and anime)', state: 'ready', source: 'none', styles: ['anime'], rank: 1 },
            ],
          });
        case 'graphics':
          return of<EnginesView>({ kind: 'graphics', chrome: true, parts: 24 });
        case 'piece-catalog':
          return of<EnginesView>({ kind: 'piece', styles: ['typographic', 'illustrated'], levels: ['simple', 'medium', 'advanced'], frameRates: [24, 30, 60], features: ['animate', 'layers', 'plan'] });
      }
    });
  }

  startMusic(engine: string): Observable<void> {
    return defer(() => {
      this.started.add(engine);
      return of(undefined);
    });
  }
}
