import { type Observable, of, throwError } from 'rxjs';

import { PieceModelPlace, type PieceModelsApi } from './piece-place';
import { LibraryFailed, type PlacedFile } from './port';

class FakeApi implements PieceModelsApi {
  calls: string[] = [];
  files: PlacedFile[] = [{ name: 'hero.glb', kind: 'model', size: 9, clips: ['idle'], triangles: 10, needs: [] }];
  failWith: { kind: string; reason: string } | null = null;
  private fail<T>(): Observable<T> | null {
    return this.failWith ? throwError(() => Object.assign(new Error(this.failWith?.reason), this.failWith)) : null;
  }
  pieceModels(id: string): Observable<readonly PlacedFile[]> {
    this.calls.push(`list ${id}`);
    return this.fail() ?? of(this.files);
  }
  uploadPieceModel(id: string, name: string): Observable<void> {
    this.calls.push(`upload ${id} ${name}`);
    return this.fail() ?? of(undefined);
  }
  deletePieceModel(id: string, name: string): Observable<void> {
    this.calls.push(`delete ${id} ${name}`);
    return this.fail() ?? of(undefined);
  }
  addPieceModel(id: string, from: string, name?: string): Observable<{ name: string; pictures: string[] }> {
    this.calls.push(`add ${id} ${from} ${name ?? ''}`);
    return this.fail() ?? of({ name: name ?? `${from.split('/')[1]}.glb`, pictures: [`${from.split('/')[0]}--colormap.png`] });
  }
}
const run = <T>(o: Observable<T>): Promise<T> => new Promise((ok, no) => o.subscribe({ next: ok, error: no }));

describe('PieceModelPlace', () => {
  let api: FakeApi;
  let piece: string;
  let place: PieceModelPlace;
  beforeEach(() => {
    api = new FakeApi();
    piece = 'p1';
    place = new PieceModelPlace(api, () => piece, () => true);
  });

  it('works on the piece the editor shows now', async () => {
    await run(place.list());
    piece = 'p2';
    await run(place.upload('a.glb', new Blob(['x'])));
    await run(place.remove('a.glb'));
    expect(api.calls).toEqual(['list p1', 'upload p2 a.glb', 'delete p2 a.glb']);
  });

  it('says whether a copy wrote anything by what the piece had before', async () => {
    expect(await run(place.add('kenney-food-kit/pizza'))).toEqual({ name: 'pizza.glb', pictures: ['kenney-food-kit--colormap.png'], added: true });
    expect((await run(place.add('x/hero', 'hero.glb'))).added).toBe(false);
  });

  it('turns the animation failures into a status and the server’s words', async () => {
    for (const [kind, status] of [['refused', 400], ['busy', 409], ['missing', 404], ['unavailable', 503]] as const) {
      api.failWith = { kind, reason: `the server said ${kind}` };
      const error = await run(place.remove('hero.glb')).catch((e) => e);
      expect(error).toBeInstanceOf(LibraryFailed);
      expect([error.status, error.said]).toEqual([status, `the server said ${kind}`]);
    }
  });

  it('is unavailable on a port with no piece models', async () => {
    const bare = new PieceModelPlace({}, () => 'p1', () => false);
    expect(bare.available()).toBe(false);
    expect(((await run(bare.list()).catch((e) => e)) as LibraryFailed).status).toBe(503);
  });
});
