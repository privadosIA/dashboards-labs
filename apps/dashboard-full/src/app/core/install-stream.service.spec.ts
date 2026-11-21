import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { InstallJob } from './api.models';
import { InstallStreamService } from './install-stream.service';
import { EventSourceLike } from './run-stream.service';
import { fakeStorage } from './storage-fake';

class FakeEventSource implements EventSourceLike {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  closed = false;
  readyState = 0;
  constructor(public url: string) {}
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(type, fn);
  }
  close(): void {
    this.closed = true;
  }
  named(type: string, data: string): void {
    this.listeners.get(type)?.({ data } as MessageEvent<string>);
  }
}

const job = (extra: Partial<InstallJob> = {}): InstallJob => ({ id: 'install-1', engine: 'heartmula', backend: 'docker', state: 'running', parts: [{ part: 'weights', state: 'running' }], created_at: '2026-11-19T10:00:00Z', ...extra });

describe('InstallStreamService', () => {
  let svc: InstallStreamService;
  let sources: FakeEventSource[];

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(InstallStreamService);
    sources = [];
    svc.esFactory = (url) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    };
  });

  const handlers = () => {
    const calls = { state: [] as InstallJob[], log: [] as string[], end: 0 };
    return { calls, h: { onState: (j: InstallJob) => calls.state.push(j), onLog: (l: string) => calls.log.push(l), onEnd: () => calls.end++ } };
  };

  it('connects to the events of the install and forwards the state and the log lines in order', () => {
    const { calls, h } = handlers();
    svc.connect('install-1', h);
    expect(sources[0].url).toBe('/api/music/installs/install-1/events');
    sources[0].named('state', JSON.stringify(job()));
    sources[0].named('log', '{"line":"fetching the weights"}');
    sources[0].named('state', JSON.stringify(job({ state: 'done' })));
    expect(calls.state.map((j) => j.state)).toEqual(['running', 'done']);
    expect(calls.log).toEqual(['fetching the weights']);
  });

  it('ignores malformed payloads and a log without a line', () => {
    const { calls, h } = handlers();
    svc.connect('install-1', h);
    sources[0].named('state', 'not json');
    sources[0].named('log', 'not json');
    sources[0].named('log', '{"other":1}');
    expect(calls.state).toEqual([]);
    expect(calls.log).toEqual([]);
  });

  it('stream-end closes the source and notifies once', () => {
    const { calls, h } = handlers();
    svc.connect('install-1', h);
    sources[0].named('stream-end', '{}');
    expect(sources[0].closed).toBe(true);
    expect(calls.end).toBe(1);
  });

  it('reopens a source the browser gave up on, and not after the end or after close()', async () => {
    vi.useFakeTimers();
    try {
      const { h } = handlers();
      const conn = svc.connect('install-1', h);
      sources[0].readyState = 2;
      sources[0].onerror?.({});
      await vi.advanceTimersByTimeAsync(1100);
      expect(sources).toHaveLength(2);
      conn.close();
      sources[1].readyState = 2;
      sources[1].onerror?.({});
      await vi.advanceTimersByTimeAsync(1100);
      expect(sources).toHaveLength(2);
      expect(sources[1].closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
