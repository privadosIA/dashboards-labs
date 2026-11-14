import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';

import { InMemoryDataset } from './in-memory.adapter';
import { ServerDataset } from './server.adapter';
import { DATASET_IMPORT_OPTIONS, DATASET_PORT, type DatasetImportOptions } from './tokens';

/** Provide it once, with the dashboard's language and what it imports. The import goes through the server the person connected to, or is made up when `memory` is set. */
export function provideDatasetImport(options: DatasetImportOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DATASET_IMPORT_OPTIONS, useValue: options },
    { provide: DATASET_PORT, useFactory: () => (options.memory ? new InMemoryDataset() : new ServerDataset(inject(ApiClient))) },
  ]);
}
