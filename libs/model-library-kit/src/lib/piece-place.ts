import { type Observable, catchError, map, switchMap, throwError } from 'rxjs';

import { LibraryFailed, type ModelCopy, type ModelPlacePort, type PlacedFile } from './port';

/**
 * What a piece's models need from whoever keeps the pieces (the animation port of the dashboards implements it as it is): list, keep, remove and copy from the library. The failures it raises have a `kind` (`refused`,
 * `busy`, `missing`, `unavailable`) and the server's words as `reason`.
 */
export interface PieceModelsApi {
  pieceModels?(id: string): Observable<readonly PlacedFile[]>;
  uploadPieceModel?(id: string, name: string, file: Blob): Observable<void>;
  deletePieceModel?(id: string, name: string): Observable<void>;
  addPieceModel?(id: string, from: string, name?: string): Observable<{ readonly name: string; readonly pictures: readonly string[] }>;
}

const STATUS: Record<string, number> = { refused: 400, missing: 404, busy: 409, unavailable: 503 };

/** The failure as the library's views read it: a status and the server's words. */
const refused = (e: unknown): Observable<never> => {
  const failure = e as { kind?: string; reason?: string; message?: string };
  return throwError(() => (e instanceof LibraryFailed ? e : new LibraryFailed(STATUS[failure?.kind ?? ''] ?? 0, failure?.reason ?? failure?.message ?? '')));
};

/**
 * The models of one piece as a place: the files kept with the piece on the server. `available` follows the server's feature (`blender-models`), so a server without it shows no models. The piece is read each time
 * (the editor changes piece while the port stays), and a copy from the library says whether it wrote anything by looking at what the piece had before.
 */
export class PieceModelPlace implements ModelPlacePort {
  constructor(
    private readonly api: PieceModelsApi,
    private readonly pieceId: () => string,
    /** Whether the server lists `blender-models`. */
    readonly available: () => boolean,
  ) {}

  private call<T>(make: (() => Observable<T>) | undefined): Observable<T> {
    return make ? make() : throwError(() => new LibraryFailed(503, ''));
  }

  list(): Observable<PlacedFile[]> {
    return this.call(this.api.pieceModels?.bind(this.api, this.pieceId())).pipe(
      map((files) => [...files]),
      catchError(refused),
    );
  }

  upload(name: string, file: Blob): Observable<void> {
    return this.call(this.api.uploadPieceModel?.bind(this.api, this.pieceId(), name, file)).pipe(catchError(refused));
  }

  remove(name: string): Observable<void> {
    return this.call(this.api.deletePieceModel?.bind(this.api, this.pieceId(), name)).pipe(catchError(refused));
  }

  add(from: string, name?: string): Observable<ModelCopy> {
    return this.list().pipe(
      switchMap((before) =>
        this.call(this.api.addPieceModel?.bind(this.api, this.pieceId(), from, name)).pipe(
          map((copy): ModelCopy => ({ name: copy.name, pictures: copy.pictures, added: !before.some((f) => f.name === copy.name) })),
          catchError(refused),
        ),
      ),
    );
  }
}
