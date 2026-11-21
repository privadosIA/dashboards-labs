import { computed, signal } from '@angular/core';
import type { Part } from '@lab/motion-parts';

/**
 * A stand-in for `MotionCatalogStore` in the tests that render the scene form: it asks the server for nothing, and has no
 * parts unless a test puts some in (`parts.set([...])`), so the form offers no part way by default.
 */
export class FakeMotionCatalogStore {
  readonly parts = signal<readonly Part[]>([]);
  readonly fonts = signal<readonly string[]>([]);
  readonly known = signal(true);
  readonly available = computed(() => this.parts().length > 0);

  part(name: string): Part | undefined {
    return this.parts().find((p) => p.name === name);
  }

  async load(): Promise<void> {
    // nothing to ask
  }
}
