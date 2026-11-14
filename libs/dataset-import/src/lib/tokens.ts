import { InjectionToken } from '@angular/core';

import type { DatasetLang, DatasetMode, ImportedEntry } from './model';
import type { DatasetPort } from './port';

export const DATASET_PORT = new InjectionToken<DatasetPort>('DATASET_PORT');

export interface DatasetImportOptions {
  /** The dashboard's language. */
  lang: DatasetLang;
  /** What this dashboard imports: its own kind of project. */
  mode: DatasetMode;
  /** True for the adapter that makes up its answers (`?adapter=memory`). */
  memory?: boolean;
}

export const DATASET_IMPORT_OPTIONS = new InjectionToken<DatasetImportOptions>('DATASET_IMPORT_OPTIONS');

/**
 * What a dashboard does with the first entry of a dataset it has just imported (the music one fills its form with it). Optional: without it the
 * import only creates the project.
 */
export const DATASET_ENTRY_SINK = new InjectionToken<(entry: ImportedEntry) => void>('DATASET_ENTRY_SINK');
