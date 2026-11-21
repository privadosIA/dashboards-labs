import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ShareService, fileNameOf } from './share.service';

describe('ShareService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => vi.unstubAllGlobals());

  it('names the file after the last segment of the address', () => {
    expect(fileNameOf('/api/projects/p/artifacts/songs/a%20b.mp3?x=1')).toBe('a b.mp3');
  });

  it('hands the file to the share sheet when the browser can share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const svc = TestBed.inject(ShareService);
    expect(svc.canShareFiles()).toBe(true);
    const done = svc.share('/a/song.mp3');
    TestBed.inject(HttpTestingController).expectOne('/a/song.mp3').flush(new Blob(['x'], { type: 'audio/mpeg' }));
    await done;
    expect(share).toHaveBeenCalledOnce();
    expect(svc.busy()).toBeNull();
  });

  it('does not treat a cancelled sheet as an error', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(new DOMException('x', 'AbortError')) });
    const svc = TestBed.inject(ShareService);
    const done = svc.share('/a/song.mp3');
    TestBed.inject(HttpTestingController).expectOne('/a/song.mp3').flush(new Blob(['x']));
    await expect(done).resolves.toBeUndefined();
  });

  it('saves a file that is already in memory with the name it is given, and frees the address', () => {
    vi.useFakeTimers();
    const created = vi.fn(() => 'blob:x');
    const revoked = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: created, revokeObjectURL: revoked });
    const clicked: { href: string; download: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    TestBed.inject(ShareService).saveBlob(new Blob(['zip']), 'data.zip');
    expect(created).toHaveBeenCalledOnce();
    expect(clicked).toEqual([{ href: 'blob:x', download: 'data.zip' }]);
    vi.advanceTimersByTime(10_000);
    expect(revoked).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
    vi.useRealTimers();
  });
});
