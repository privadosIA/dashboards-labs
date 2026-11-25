import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, type RouterStateSnapshot, Router, UrlTree, provideRouter } from '@angular/router';

import { blenderReadyGuard } from './blender-ready.guard';

describe('blenderReadyGuard', () => {
  const open = (flush: (http: HttpTestingController) => void) => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const result = TestBed.runInInjectionContext(() => blenderReadyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Promise<boolean | UrlTree>;
    flush(http);
    return result;
  };
  const report = (present: boolean) => (http: HttpTestingController) => http.expectOne('/api/environment').flush({ binaries: [{ name: 'blender', required: false, present }], voices: [], loras: [], gpus: [], models: [] });

  it('lets the route open when Blender is present, after waiting for the report', async () => {
    expect(await open(report(true))).toBe(true);
  });

  it('sends the person to the start page when Blender is missing', async () => {
    const result = await open(report(false));
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('sends the person to the start page when the report does not arrive', async () => {
    const result = await open((http) => http.expectOne('/api/environment').flush('down', { status: 500, statusText: 'Server Error' }));
    expect(result).toBeInstanceOf(UrlTree);
  });
});
