import { ApiError, type ApiClient } from '@lab/api-client';
import { type Observable, catchError, map, throwError } from 'rxjs';

import type { DatasetMode, DatasetOptions, DatasetPreview } from './model';
import { DatasetFailed, type DatasetPort } from './port';

/** What the adapter uses of the API client. */
export type DatasetApi = Pick<ApiClient, 'post'>;

const count = (value: unknown): number => (typeof value === 'number' ? value : Array.isArray(value) ? value.length : 0);
const words = (value: unknown): string => (typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : '');

/** The two calls the dataset import makes to the server (`POST /api/import/preview` and `/api/import/confirm`). The dataset is never parsed here. */
export class ServerDataset implements DatasetPort {
  constructor(private readonly api: DatasetApi) {}

  preview(content: string, mode: DatasetMode, options: DatasetOptions = {}): Observable<DatasetPreview> {
    return this.api.post('/api/import/preview', { body: { content, ...(mode === 'video' ? {} : { mode }), ...(options.outputMode === 'images' ? { output_mode: 'images' as const } : {}) } }).pipe(
      map((answer) => {
        const a = answer as Record<string, unknown>;
        return {
          yaml: String(a['yaml'] ?? ''),
          report: words(a['report']),
          entries: count(a['entries']),
          imported: count(a['imported']),
          quiet: count(mode === 'music' ? a['instrumental'] : a['silent']),
          rejected: count(a['rejected']),
        };
      }),
      catchError((e) => throwError(() => this.failure(e))),
    );
  }

  confirm(id: string, yaml: string, options: DatasetOptions = {}): Observable<string> {
    return this.api.post('/api/import/confirm', { body: { id, yaml, ...(options.outputMode === 'images' ? { output_mode: 'images' as const } : {}) } }).pipe(
      map((answer) => String((answer as Record<string, unknown>)['id'] ?? id)),
      catchError((e) => throwError(() => this.failure(e))),
    );
  }

  private failure(e: unknown): DatasetFailed {
    if (!(e instanceof ApiError)) return new DatasetFailed('unreachable');
    if (e.status === 409) return new DatasetFailed('taken', e.message);
    if (e.status === 400 || e.status === 422) return new DatasetFailed(/\bid\b/i.test(e.message) ? 'invalidName' : 'rejected', e.message);
    return new DatasetFailed('unreachable', e.message);
  }
}
