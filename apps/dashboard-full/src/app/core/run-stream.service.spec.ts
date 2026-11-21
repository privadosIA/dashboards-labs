import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ConnectionService, provideServerConnection } from '@lab/server-connection';
import { fakeStorage } from './storage-fake';

import { EventSourceLike, RunStreamService } from './run-stream.service';

class FakeEventSource implements EventSourceLike {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  closed = false;
  readyState = 0;
  onerror: ((e: unknown) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(type, fn);
  }
  close(): void {
    this.closed = true;
  }

  // helpers
  open(): void {
    this.onopen?.({});
  }
  message(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
  named(type: string, data: string): void {
    this.listeners.get(type)?.({ data } as MessageEvent<string>);
  }
}

describe('RunStreamService', () => {
  let svc: RunStreamService;
  let es: FakeEventSource;

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(RunStreamService);
    svc.esFactory = (url) => {
      es = new FakeEventSource(url);
      return es;
    };
  });

  it('collects verbatim pipeline events and raw lines', () => {
    const stream = svc.connect('run-1');
    expect(es.url).toBe('/api/runs/run-1/events');
    es.open();
    es.message('{"timestamp":"t1","type":"pipeline_start"}');
    es.message('{"timestamp":"t2","type":"phase_start","scene_id":"a","phase":"tts"}');

    expect(stream.events().length).toBe(2);
    expect(stream.events()[1].phase).toBe('tts');
    // Presence semantics: pipeline_start has no scene_id key at all.
    expect('scene_id' in stream.events()[0]).toBe(false);
    expect(stream.lines()[0]).toBe('{"timestamp":"t1","type":"pipeline_start"}');
  });

  it('resets buffers on reconnect (the server replays from zero)', () => {
    const stream = svc.connect('run-1');
    es.open();
    es.message('{"type":"pipeline_start","timestamp":"t"}');
    expect(stream.events().length).toBe(1);

    // Drop + auto-reconnect: full replay follows the new open.
    es.open();
    expect(stream.events().length).toBe(0);
    es.message('{"type":"pipeline_start","timestamp":"t"}');
    es.message('{"type":"pipeline_end","timestamp":"t2","duration_ms":5,"artifact":"out/x.mp4"}');
    expect(stream.events().length).toBe(2);
  });

  it('tracks run-state notifications separately from pipeline events', () => {
    const stream = svc.connect('run-1');
    es.open();
    es.named('run-state', '{"id":"run-1","state":"running"}');
    expect(stream.state()?.state).toBe('running');
    expect(stream.events().length).toBe(0);
  });

  it('stream-end marks termination and closes the source (no eternal reconnect)', () => {
    const stream = svc.connect('run-1');
    es.open();
    es.named('stream-end', '{"id":"run-1"}');
    expect(stream.ended()).toBe(true);
    expect(es.closed).toBe(true);
  });

  describe('with a token', () => {
    it('connects with a ticket and reopens with a fresh one when the browser gives up', async () => {
      vi.useFakeTimers();
      try {
        // The connection is read when the services are created (the page reloads when it changes), so it is set first.
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideServerConnection({ lang: 'en' })] });
        TestBed.inject(ConnectionService).save({ server: 'http://host:4666', token: 't' }, false);
        svc = TestBed.inject(RunStreamService);
        const ctrl = TestBed.inject(HttpTestingController);
        const urls: string[] = [];
        svc.esFactory = (url) => {
          urls.push(url);
          es = new FakeEventSource(url);
          return es;
        };
        ctrl.expectOne('http://host:4666/api/auth/ticket').flush({
          ticket: 'T1',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
        const stream = svc.connect('r1');
        await vi.advanceTimersByTimeAsync(0);
        expect(urls).toEqual(['http://host:4666/api/runs/r1/events?ticket=T1']);

        // Ticket expired server-side: the EventSource is CLOSED for good.
        es.readyState = 2;
        es.onerror?.({});
        await vi.advanceTimersByTimeAsync(1100);
        // Still valid locally, so no renewal needed; it simply reopens.
        expect(urls.length).toBe(2);
        stream.close();
        es.readyState = 2;
        es.onerror?.({});
        await vi.advanceTimersByTimeAsync(2000);
        expect(urls.length).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
