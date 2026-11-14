import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { CONNECTION_STORES } from './connection.service';
import { SERVER_CONNECTION_LANG } from './provide-server-connection';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

function setup(server: string) {
  const store = { getItem: () => (server ? JSON.stringify({ server, token: 't' }) : null), setItem: () => undefined, removeItem: () => undefined };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([unauthorizedInterceptor])),
      provideHttpClientTesting(),
      { provide: CONNECTION_STORES, useValue: { persistent: store, session: null } },
      { provide: SERVER_CONNECTION_LANG, useValue: 'en' },
    ],
  });
  return { http: TestBed.inject(HttpClient), controller: TestBed.inject(HttpTestingController), dialog: TestBed.inject(MatDialog) };
}

describe('unauthorizedInterceptor', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('opens the connection box, once, when the configured server answers 401', () => {
    const { http, controller, dialog } = setup('http://host:4666');
    http.get('http://host:4666/api/generations').subscribe({ error: () => undefined });
    http.get('http://host:4666/api/generation/options').subscribe({ error: () => undefined });
    controller.match(() => true).forEach((r) => r.flush({}, { status: 401, statusText: 'Unauthorized' }));
    expect(dialog.openDialogs).toHaveLength(1);
  });

  it('works on the page\'s own server too', () => {
    const { http, controller, dialog } = setup('');
    http.get('/api/generations').subscribe({ error: () => undefined });
    controller.expectOne('/api/generations').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(dialog.openDialogs).toHaveLength(1);
  });

  it('leaves other errors and other servers alone, and does not touch the answer', () => {
    const { http, controller, dialog } = setup('http://host:4666');
    const seen: number[] = [];
    http.get('http://host:4666/api/x').subscribe({ error: (e) => seen.push(e.status) });
    controller.expectOne('http://host:4666/api/x').flush({}, { status: 500, statusText: 'Boom' });
    http.get('http://elsewhere/api/x').subscribe({ error: (e) => seen.push(e.status) });
    controller.expectOne('http://elsewhere/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(seen).toEqual([500, 401]);
    expect(dialog.openDialogs).toHaveLength(0);
  });
});
