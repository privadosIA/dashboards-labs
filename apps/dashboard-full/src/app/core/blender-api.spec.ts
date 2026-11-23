import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';

describe('ApiService: 3D scene descriptions', () => {
  let http: HttpTestingController;
  let api: ApiService;
  const skipsToast = (context: HttpContext) => context.get(SKIP_ERROR_TOAST) === true;
  const BASE = '/api/projects/p1/blender/descriptions';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
  });
  afterEach(() => http.verify());

  it('writes from an idea and says whether it is a revision', () => {
    api.writeBlenderDescription('p1', 'hola.scene.json', 'a title', 5, false).subscribe();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'hola.scene.json', idea: 'a title', seconds: 5, revise: false });
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({});
    api.writeBlenderDescription('p1', 'hola.scene.json', 'further away', 5, true).subscribe();
    expect(http.expectOne(BASE).request.body.revise).toBe(true);
  });

  it('reads a stored description by its name', () => {
    api.getBlenderDescription('p1', 'a b.scene.json').subscribe();
    const req = http.expectOne(`${BASE}/a%20b.scene.json`);
    expect(req.request.method).toBe('GET');
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({ name: 'a b.scene.json', description: {} });
  });

  it('saves the description with the length of the scene', () => {
    api.saveBlenderDescription('p1', 'hola.scene.json', { version: 1 }, 5).subscribe();
    const req = http.expectOne(`${BASE}/hola.scene.json`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ description: { version: 1 }, seconds: 5 });
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({ name: 'hola.scene.json', description: { version: 1 } });
  });

  it('asks for a frame and gets an image back', () => {
    let got: Blob | undefined;
    api.previewBlenderDescription('p1', 'hola.scene.json', 1.5, 5).subscribe((b) => (got = b));
    const req = http.expectOne(`${BASE}/hola.scene.json/preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ t: 1.5, seconds: 5 });
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['png'], { type: 'image/png' }));
    expect(got?.type).toBe('image/png');
  });

  it('sends a width only when one is asked for', () => {
    api.previewBlenderDescription('p1', 'x.scene.json', 0, 2, 640).subscribe();
    expect(http.expectOne(`${BASE}/x.scene.json/preview`).request.body).toEqual({ t: 0, seconds: 2, width: 640 });
  });
});
