// What vitest.mock-setup.mts hands to the specs (see `inject('mockUrl')`).
import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    mockUrl: string;
  }
}
