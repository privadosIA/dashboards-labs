import { Injectable, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import type { Environment } from '../../environments/environment.model';

/** The buttons of the Projects header that open another section in a tab of its own. */
export type SectionLink = keyof Environment['sectionLinks'];

/**
 * Which of those buttons are shown. The `environment` of the build says (all of them, except in the `tutorial` configuration), and a deployment's
 * `config.json` can overrule it button by button: `{"sections": {"animation": false, "dataset": true}}`. A key that is missing or is not a boolean
 * leaves the environment's answer; a `config.json` that is missing or not JSON changes nothing.
 */
@Injectable({ providedIn: 'root' })
export class SectionLinksService {
  private readonly overrides = signal<Partial<Record<SectionLink, boolean>>>({});

  shown(link: SectionLink): boolean {
    return this.overrides()[link] ?? environment.sectionLinks[link];
  }

  /** Reads the `sections` of the deployment's `config.json`; called once before the app starts. */
  async load(): Promise<void> {
    try {
      const res = await fetch(new URL('config.json', document.baseURI), { cache: 'no-store' });
      if (!res.ok) return;
      const sections = ((await res.json()) as { sections?: Record<string, unknown> | null }).sections;
      if (!sections || typeof sections !== 'object') return;
      const overrides: Partial<Record<SectionLink, boolean>> = {};
      for (const link of Object.keys(environment.sectionLinks) as SectionLink[]) {
        if (typeof sections[link] === 'boolean') overrides[link] = sections[link];
      }
      this.overrides.set(overrides);
    } catch {
      // No file, or not JSON: the environment decides.
    }
  }
}
