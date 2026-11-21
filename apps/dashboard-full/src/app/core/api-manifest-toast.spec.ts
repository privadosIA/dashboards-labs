import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';

describe('the manifests of a project that has not run yet', () => {
  it('are asked without a toast: the pages that read them show an empty state of their own', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ApiService);
    const http = TestBed.inject(HttpTestingController);
    api.getManifest('Gabbie', 'Gabbie').subscribe({ error: () => undefined });
    expect(http.expectOne('/api/projects/Gabbie/artifacts/out/Gabbie/manifest.json').request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    api.getMusicManifest('Cancion', 'Cancion').subscribe({ error: () => undefined });
    expect(http.expectOne('/api/projects/Cancion/artifacts/out/Cancion/manifest.json').request.context.get(SKIP_ERROR_TOAST)).toBe(true);
  });
});
