import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ConnectionService } from '@lab/server-connection';
import { SwaggerHostComponent } from './swagger-host.component';

type Req = { url: string; headers: Record<string, string> };
const swagger = vi.hoisted(() => ({ options: undefined as undefined | Record<string, unknown> }));

vi.mock('swagger-ui-dist/swagger-ui-es-bundle.js', () => ({
  default: (opts: Record<string, unknown>) => {
    swagger.options = opts;
    return {};
  },
}));

describe('SwaggerHostComponent', () => {
  let conn: ConnectionService;

  beforeEach(async () => {
    swagger.options = undefined;
    await TestBed.configureTestingModule({ imports: [SwaggerHostComponent] }).compileComponents();
    conn = TestBed.inject(ConnectionService);
  });

  async function render(spec: Record<string, unknown>) {
    const fixture = TestBed.createComponent(SwaggerHostComponent);
    (fixture.componentRef as ComponentRef<SwaggerHostComponent>).setInput('spec', spec);
    fixture.detectChanges();
    await vi.waitFor(() => expect(swagger.options).toBeDefined());
    return fixture;
  }

  const intercept = (req: Req) => (swagger.options!['requestInterceptor'] as (r: Req) => Req)(req);

  it('hands Swagger UI the document itself, not a URL to fetch', async () => {
    const spec = { openapi: '3.0.3', paths: {} };
    await render(spec);
    expect(swagger.options!['spec']).toBe(spec);
    expect(swagger.options!['url']).toBeUndefined();
  });

  it('adds the session token to requests aimed at the connected API, read at request time', async () => {
    conn.save({ server: 'http://box:4666', token: 'abc' }, false);
    await render({ openapi: '3.0.3' });
    expect(intercept({ url: 'http://box:4666/api/projects', headers: {} }).headers['Authorization']).toBe('Bearer abc');

    conn.save({ server: 'http://box:4666', token: 'def' }, false);
    expect(intercept({ url: 'http://box:4666/api/runs', headers: {} }).headers['Authorization']).toBe('Bearer def');
  });

  it('never sends the token to another host or outside /api', async () => {
    conn.save({ server: 'http://box:4666', token: 'abc' }, false);
    await render({ openapi: '3.0.3' });
    expect(intercept({ url: 'http://elsewhere:1/api/projects', headers: {} }).headers['Authorization']).toBeUndefined();
    expect(intercept({ url: 'http://box:4666/other', headers: {} }).headers['Authorization']).toBeUndefined();
  });

  it('sends no credentials when no token is set', async () => {
    conn.save({ server: '', token: '' }, false);
    await render({ openapi: '3.0.3' });
    expect(intercept({ url: '/api/projects', headers: {} }).headers['Authorization']).toBeUndefined();
  });
});
