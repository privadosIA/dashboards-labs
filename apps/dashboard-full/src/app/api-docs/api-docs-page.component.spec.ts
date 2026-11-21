import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectionService } from '@lab/server-connection';
import { ApiDocsPageComponent } from './api-docs-page.component';
import { SwaggerHostComponent } from './swagger-host.component';

@Component({ selector: 'app-swagger-host', template: '<i data-testid="host"></i>' })
class StubHostComponent {
  readonly spec = input.required<Record<string, unknown>>();
}

const DOC = {
  openapi: '3.0.3',
  servers: [{ url: '/' }],
  security: [{ bearer: [] }],
  paths: { '/api/projects': { get: {} } },
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }, schemas: {} },
};

describe('ApiDocsPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ApiDocsPageComponent>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const host = () => fixture.debugElement.children.map((c) => c.componentInstance).find((c) => c instanceof StubHostComponent) as StubHostComponent | undefined;

  async function open(server = '') {
    await TestBed.configureTestingModule({
      imports: [ApiDocsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      .overrideComponent(ApiDocsPageComponent, {
        remove: { imports: [SwaggerHostComponent] },
        add: { imports: [StubHostComponent] },
      })
      .compileComponents();
    if (server) TestBed.inject(ConnectionService).save({ server, token: '' }, false);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ApiDocsPageComponent);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('renders the description with «Try it out» aimed at the own origin and no security scheme', async () => {
    await open();
    http.expectOne('/api/openapi.json').flush(DOC);
    await fixture.whenStable();
    fixture.detectChanges();

    const spec = host()?.spec() as Record<string, unknown>;
    expect(spec['servers']).toEqual([{ url: window.location.origin }]);
    expect(spec['security']).toBeUndefined();
    expect((spec['components'] as Record<string, unknown>)['securitySchemes']).toBeUndefined();
    expect(spec['paths']).toEqual(DOC.paths);
    expect(text()).toContain('actúa sobre el servidor real');
  });

  it('aims «Try it out» at the connected server', async () => {
    await open('http://box:4666');
    http.expectOne('http://box:4666/api/openapi.json').flush(DOC);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((host()?.spec() as Record<string, unknown>)['servers']).toEqual([{ url: 'http://box:4666' }]);
  });

  for (const [status, expected] of [
    [401, 'el token falta o es incorrecto'],
    [0, 'No se puede conectar con el servidor'],
    [404, 'no publica la descripción'],
  ] as const) {
    it(`explains a ${status} instead of showing an empty page`, async () => {
      await open();
      const req = http.expectOne('/api/openapi.json');
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush({ error: { code: 'x', message: 'y' } }, { status, statusText: 'x' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text()).toContain(expected);
      expect(host()).toBeUndefined();
    });
  }
});
