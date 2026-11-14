import { firstValueFrom, from, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AnimationFailure, type AnimationPort, type PartText } from '@lab/animation-core';

/**
 * The text of the parts a page uses, read through the port once per instance and kept. A part the server says is missing (a built-in one, or
 * one that is gone) has no text: it answers `null` and the page draws a placeholder. Any other failure also answers `null` for now, but is
 * not kept, so the next page asks again.
 */
export class FragmentSource {
  private readonly cache = new Map<string, Promise<PartText | null>>();

  constructor(private readonly port: Pick<AnimationPort, 'partText'>) {}

  fragment(name: string): Observable<PartText | null> {
    let known = this.cache.get(name);
    if (!known) {
      known = firstValueFrom(this.port.partText(name)).catch((e: unknown) => {
        if (!(e instanceof AnimationFailure && e.kind === 'missing')) this.cache.delete(name);
        return null;
      });
      this.cache.set(name, known);
    }
    return from(known);
  }

  /** The text of every named part, by name. */
  load(names: readonly string[]): Observable<ReadonlyMap<string, PartText | null>> {
    const unique = [...new Set(names)];
    return from(Promise.all(unique.map((n) => firstValueFrom(this.fragment(n))))).pipe(map((texts) => new Map(unique.map((n, i) => [n, texts[i]] as const))));
  }

  /** Forgets what was read, for a part that was just approved. */
  forget(name?: string): void {
    if (name === undefined) this.cache.clear();
    else this.cache.delete(name);
  }
}
