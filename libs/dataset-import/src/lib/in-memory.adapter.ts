import { type Observable, defer, of, throwError } from 'rxjs';

import type { DatasetMode, DatasetPreview } from './model';
import { DatasetFailed, type DatasetPort } from './port';

/** The text of each entry when the file is the server's tuple format (`[id, title, lora_info, text]`), else null. */
function tuples(content: string): string[] | null {
  try {
    const data: unknown = JSON.parse(content);
    return Array.isArray(data) && data.every((e) => Array.isArray(e)) ? data.map((e) => String((e as unknown[])[3] ?? '')) : null;
  } catch {
    return null;
  }
}

/** A port that makes up its answers, for `?adapter=memory` and the specs: it counts the lines of the file and keeps the ids it was asked to create. */
export class InMemoryDataset implements DatasetPort {
  private readonly created = new Set<string>();

  preview(content: string, mode: DatasetMode): Observable<DatasetPreview> {
    return defer(() => {
      const items = tuples(content);
      const entries = items ? items.length : content.split('\n').filter((line) => line.trim()).length;
      if (!entries) return throwError(() => new DatasetFailed('rejected', 'The file is empty.'));
      // Graphics: a graphic with a `Duration:` and no `Dialogue:` is quiet; the other modes make up a quarter of the entries.
      const quiet = mode === 'motion' && items ? items.filter((text) => /^Duration:/m.test(text) && !/^Dialogue:/m.test(text)).length : Math.floor(entries / 4);
      const kind = mode === 'music' ? 'tracks' : mode === 'motion' ? 'graphics' : 'scenes';
      return of({ yaml: `${kind}: ${entries}\n`, report: `Read ${entries} entries (${mode}).`, entries, imported: entries, quiet, rejected: 0 });
    });
  }

  confirm(id: string): Observable<string> {
    return defer(() => {
      if (this.created.has(id)) return throwError(() => new DatasetFailed('taken'));
      this.created.add(id);
      return of(id);
    });
  }
}
