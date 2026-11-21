import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TicketService } from '@lab/server-connection';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';

describe('ApiService: the data of the server', () => {
  let http: HttpTestingController;
  let api: ApiService;
  const skipsToast = (context: HttpContext) => context.get(SKIP_ERROR_TOAST) === true;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: TicketService, useValue: { withTicket: (url: string) => url } }],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
  });
  afterEach(() => http.verify());

  it('reads the status of the data and leaves the failure to the card', () => {
    api.getDataStatus().subscribe();
    const req = http.expectOne('/api/data/status');
    expect(req.request.method).toBe('GET');
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({});
  });

  it('imports every pending entity with an empty body and one entity again with its name', () => {
    api.importData().subscribe();
    const all = http.expectOne('/api/data/import');
    expect(all.request.method).toBe('POST');
    expect(all.request.body).toEqual({});
    expect(skipsToast(all.request.context)).toBe(true);
    all.flush({ imports: [] });

    api.importData('music-motion/parts').subscribe();
    const one = http.expectOne('/api/data/import');
    expect(one.request.body).toEqual({ entity: 'music-motion/parts' });
    one.flush({ imports: [] });
  });

  it('cleans the entities named in one request', () => {
    api.cleanLegacyData(['settings', 'providers']).subscribe();
    const req = http.expectOne('/api/data/legacy/clean');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ entities: ['settings', 'providers'] });
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush({ cleaned: [] });
  });

  it('fetches the export as a blob through the page, with no ticket or token in the address', () => {
    api.downloadDataExport().subscribe();
    const req = http.expectOne('/api/data/export');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.url).not.toMatch(/ticket|token/i);
    expect(skipsToast(req.request.context)).toBe(true);
    req.flush(new Blob(['zip']));
  });
});
