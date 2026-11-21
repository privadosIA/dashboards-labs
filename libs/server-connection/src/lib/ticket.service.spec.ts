import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClient } from '@lab/api-client';

import { CONNECTION_STORES } from './connection.service';
import { TicketService } from './ticket.service';

function setup(token: string) {
  const saved = token ? JSON.stringify({ server: 'http://host:4666', token }) : null;
  const store = { getItem: () => saved, setItem: () => undefined, removeItem: () => undefined };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient({ baseUrl: 'http://host:4666', token }),
      { provide: CONNECTION_STORES, useValue: { persistent: store, session: null } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  return { http, tickets: TestBed.inject(TicketService) };
}

const flushTicket = (http: HttpTestingController, ticket: string, lifeMs = 600_000) => {
  const req = http.expectOne('http://host:4666/api/auth/ticket');
  expect(req.request.method).toBe('POST');
  req.flush({ ticket, expiresAt: new Date(Date.now() + lifeMs).toISOString() });
};

describe('TicketService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('asks for a ticket at start when a token is set, with the Bearer header', async () => {
    const { http, tickets } = setup('abc');
    const req = http.expectOne('http://host:4666/api/auth/ticket');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush({ ticket: 't1', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    expect(tickets.ticket()).toBe('t1');
    expect(tickets.withTicket('http://host:4666/api/projects/x/artifacts/v.mp4')).toBe('http://host:4666/api/projects/x/artifacts/v.mp4?ticket=t1');
    expect(tickets.withTicket('http://h/a?b=1')).toBe('http://h/a?b=1&ticket=t1');
  });

  it('asks for nothing and leaves the address alone without a token', async () => {
    const { http, tickets } = setup('');
    http.expectNone('http://host:4666/api/auth/ticket');
    expect(await tickets.ensure()).toBeNull();
    expect(tickets.withTicket('http://h/a')).toBe('http://h/a');
  });

  it('renews the ticket a minute before it expires', async () => {
    const { http } = setup('abc');
    flushTicket(http, 't1', 5 * 60_000);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    http.expectNone('http://host:4666/api/auth/ticket');
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    flushTicket(http, 't2');
  });

  it('makes one call for several asks at once, and none while the ticket is fresh', async () => {
    const { http, tickets } = setup('abc');
    const first = tickets.ensure();
    const second = tickets.ensure();
    flushTicket(http, 't1');
    expect(await first).toBe('t1');
    expect(await second).toBe('t1');
    expect(await tickets.ensure()).toBe('t1');
    http.expectNone('http://host:4666/api/auth/ticket');
  });

  it('has no ticket when the server refuses, and does not fail', async () => {
    const { http, tickets } = setup('bad');
    http.expectOne('http://host:4666/api/auth/ticket').flush({}, { status: 401, statusText: 'Unauthorized' });
    await vi.advanceTimersByTimeAsync(0);
    expect(tickets.ticket()).toBeNull();
    expect(tickets.withTicket('http://h/a')).toBe('http://h/a');
  });
});
