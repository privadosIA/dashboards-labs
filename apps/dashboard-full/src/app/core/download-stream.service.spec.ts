import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DownloadStreamService } from './download-stream.service';
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

describe('DownloadStreamService', () => {
  let svc: DownloadStreamService;
  let sources: FakeEventSource[];

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('sessionStorage', fakeStorage());
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(DownloadStreamService);
    sources = [];
    svc.esFactory = (url) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    };
  });

  const handlers = () => {
    const calls = { progress: [] as unknown[], state: [] as unknown[], end: 0 };
    return {
      calls,
      h: {
        onProgress: (p: unknown) => calls.progress.push(p),
        onState: (s: unknown) => calls.state.push(s),
        onEnd: () => calls.end++,
      },
    };
  };

  it('connects to the download events URL and forwards parsed events', () => {
    const { calls, h } = handlers();
    svc.connect('dl-1', h);
    expect(sources[0].url).toBe('/api/downloads/dl-1/events');
    sources[0].named('download-state', '{"id":"dl-1","state":"running","error":""}');
    sources[0].named('progress', '{"id":"dl-1","bytes":10,"total":100}');
    expect(calls.state).toEqual([{ id: 'dl-1', state: 'running', error: '' }]);
    expect(calls.progress).toEqual([{ id: 'dl-1', bytes: 10, total: 100 }]);
  });

  it('ignores malformed payloads', () => {
    const { calls, h } = handlers();
    svc.connect('dl-1', h);
    sources[0].named('progress', 'not json');
    expect(calls.progress).toEqual([]);
  });

  it('stream-end closes the source and notifies once', () => {
    const { calls, h } = handlers();
    svc.connect('dl-1', h);
    sources[0].named('stream-end', '{"id":"dl-1"}');
    expect(sources[0].closed).toBe(true);
    expect(calls.end).toBe(1);
  });

  it('close() stops the source', () => {
    const { h } = handlers();
    const conn = svc.connect('dl-1', h);
    conn.close();
    expect(sources[0].closed).toBe(true);
  });
});
