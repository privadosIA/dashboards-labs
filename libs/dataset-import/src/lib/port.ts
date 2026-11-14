import type { Observable } from 'rxjs';

import type { DatasetMode, DatasetOptions, DatasetPreview } from './model';

/** Why an import did not go through: the file, the name, or the server. */
export type DatasetFailure = 'rejected' | 'taken' | 'invalidName' | 'unreachable';

export class DatasetFailed extends Error {
  constructor(
    readonly kind: DatasetFailure,
    /** The server's own words when it gave any. */
    readonly detail = '',
  ) {
    super(detail || kind);
    this.name = 'DatasetFailed';
  }
}

/** What the import dialog needs from a server: read a dataset file into a project file, and create the project. */
export interface DatasetPort {
  /** Converts the dataset (the text of a JSON or HTML file) into a project file; creates nothing. */
  preview(content: string, mode: DatasetMode, options?: DatasetOptions): Observable<DatasetPreview>;
  /** Creates the project `id` with the file `preview` answered; the server never overwrites an id. Answers the id. */
  confirm(id: string, yaml: string, options?: DatasetOptions): Observable<string>;
}
