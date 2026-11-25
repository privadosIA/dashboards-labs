import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, type TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { EditorStore } from '../../editor.store';
import { ProjectModelPlace } from './project-model-place';

describe('ProjectModelPlace', () => {
  let http: HttpTestingController;
  let place: ProjectModelPlace;
  let packs: TestRequest;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: EditorStore, useValue: { projectId: () => 'p1' } }, ProjectModelPlace] });
    http = TestBed.inject(HttpTestingController);
    place = TestBed.inject(ProjectModelPlace);
    // asking whether the server has the library is the first thing a place does
    packs = http.expectOne('/api/models3d/packs');
  });
  afterEach(() => http.verify());

  it('is available only when the server answers its packs, and not when it has no library', () => {
    expect(place.available()).toBe(false);
    packs.flush({ packs: [] });
    expect(place.available()).toBe(true);
  });

  it('is not available on a server older than the library (404)', () => {
    packs.flush({ error: { message: 'no such endpoint' } }, { status: 404, statusText: 'Not Found' });
    expect(place.available()).toBe(false);
  });

  it('lists the models and the pictures among the sources, with what was read of each model', () => {
    let got: unknown;
    place.list().subscribe((l) => (got = l));
    http.expectOne('/api/projects/p1/sources').flush({
      sources: [
        { name: 'song.mp3', kind: 'audio', size: 5, modified: '' },
        { name: 'hero.glb', kind: 'model', size: 10, modified: '', clips: ['idle'], triangles: 900, needs: ['colormap.png'] },
        { name: 'colormap.png', kind: 'image', size: 3, modified: '' },
      ],
    });
    expect(got).toEqual([
      { name: 'hero.glb', kind: 'model', size: 10, clips: ['idle'], triangles: 900, needs: ['colormap.png'] },
      { name: 'colormap.png', kind: 'picture', size: 3 },
    ]);
  });

  it('uploads and removes through the source operations, and tells 201 from 200 when adding', () => {
    place.upload('hero.glb', new Blob(['glTF'])).subscribe();
    http.expectOne({ method: 'PUT', url: '/api/projects/p1/sources/hero.glb' }).flush({ name: 'hero.glb' }, { status: 201, statusText: 'Created' });
    place.remove('hero.glb').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/projects/p1/sources/hero.glb' }).flush(null, { status: 204, statusText: 'No Content' });
    const answers: boolean[] = [];
    place.add('kenney-food-kit/pizza').subscribe((c) => answers.push(c.added));
    http.expectOne('/api/projects/p1/sources/model').flush({ name: 'pizza.glb', pictures: [] }, { status: 201, statusText: 'Created' });
    place.add('kenney-food-kit/pizza').subscribe((c) => answers.push(c.added));
    http.expectOne('/api/projects/p1/sources/model').flush({ name: 'pizza.glb', pictures: [] }, { status: 200, statusText: 'OK' });
    expect(answers).toEqual([true, false]);
  });
});
