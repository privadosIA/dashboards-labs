import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { authInterceptor } from './auth.interceptor';
import { fakeStorage } from './storage-fake';
import { ConnectionService } from '@lab/server-connection';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let conn: ConnectionService;

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    conn = TestBed.inject(ConnectionService);
  });

  it('sends no Authorization header without a token', () => {
    http.get('/api/projects').subscribe();
    expect(ctrl.expectOne('/api/projects').request.headers.has('Authorization')).toBe(false);
  });

  it('attaches the Bearer token to API requests', () => {
    conn.save({ server: 'http://h:4666', token: 'tok' }, false);
    http.get('http://h:4666/api/projects').subscribe();
    expect(ctrl.expectOne('http://h:4666/api/projects').request.headers.get('Authorization')).toBe(
      'Bearer tok',
    );
  });

  it('never sends the token to another host', () => {
    conn.save({ server: 'http://h:4666', token: 'tok' }, false);
    http.get('http://other.example/api/projects').subscribe();
    http.get('http://h:4666.evil.example/api/x').subscribe();
    for (const r of ctrl.match(() => true)) expect(r.request.headers.has('Authorization')).toBe(false);
  });
});
