import { Injectable, inject } from '@angular/core';
import { DfOption, DfOptionsProvider } from '@core/dynamic-forms';
import { Observable, of } from 'rxjs';

/** Where a schema's `options: { source: "remote", endpoint }` comes from: a stream of options (it may keep emitting). */
export type OptionSource = (params: Record<string, unknown>) => Observable<DfOption[]>;

/**
 * The option sources the app's components register under the endpoint names
 * their schemas cite. The library asks for a provider at the root, so the
 * components that own an inventory register theirs here when they start.
 */
@Injectable({ providedIn: 'root' })
export class OptionSourceRegistry {
  private readonly sources = new Map<string, OptionSource>();

  register(endpoint: string, source: OptionSource): void {
    this.sources.set(endpoint, source);
  }

  get(endpoint: string): OptionSource | undefined {
    return this.sources.get(endpoint);
  }
}

/** The one options provider the library is given; it answers from the registry. */
@Injectable()
export class AppOptionsProvider implements DfOptionsProvider {
  private readonly registry = inject(OptionSourceRegistry);

  load(endpoint: string, params: Record<string, unknown>): Observable<DfOption[]> {
    return this.registry.get(endpoint)?.(params) ?? of([]);
  }
}
