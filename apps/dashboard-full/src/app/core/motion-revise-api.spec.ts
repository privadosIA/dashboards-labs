import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';

describe('ApiService: change the motion of a stored page', () => {
  let http: HttpTestingController;
  let api: ApiService;
  const skipsToast = (context: HttpContext) => context.get(SKIP_ERROR_TOAST) === true;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
  });
  afterEach(() => http.verify());

  it('posts the instruction for the graphic and leaves the error to the caller', () => {
    api.reviseMotionPage('p1', 'intro', 'slower entrances', false).subscribe();
    const req = http.expectOne('/api/projects/p1/scenes/intro/motion/revise');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ instruction: 'slower entrances', overlay: false });
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({});
  });

  it('asks for the overlay page and encodes the scene name', () => {
    api.reviseMotionPage('p1', 'a b', 'a bounce on the title', true).subscribe();
    const req = http.expectOne('/api/projects/p1/scenes/a%20b/motion/revise');
    expect(req.request.body).toEqual({ instruction: 'a bounce on the title', overlay: true });
    req.flush({});
  });

  it('returns the revised page with who retimed it', () => {
    let got: unknown;
    api.reviseMotionPage('p1', 'intro', 'x', false).subscribe((r) => (got = r));
    http.expectOne('/api/projects/p1/scenes/intro/motion/revise').flush({ scene: 'intro', exists: true, html: '<p>', duration: 3, revised: { provider: 'ollama', model: 'm' } });
    expect((got as { revised: { model: string } }).revised.model).toBe('m');
  });
});
