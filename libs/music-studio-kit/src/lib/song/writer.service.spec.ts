import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';

import { InMemorySongs } from './in-memory.adapter';
import type { WriteRequest, Written } from './model';
import { AssistFailed, type SongPort } from './port';
import { SONGS } from './tokens';
import { SongWriter } from './writer.service';

/** Only `write` matters to the writer. */
const portWith = (write: SongPort['write']): SongPort => ({ write }) as SongPort;

function provide(port: SongPort): SongWriter {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SONGS, useValue: port }] });
  return TestBed.inject(SongWriter);
}

const REQUEST: WriteRequest = { text: 'A soothing piano melody', generator: 'heartmula', instrumental: false };

describe('SongWriter', () => {
  it('returns what the assistant wrote and ends not busy and without an error', async () => {
    const writer = provide(new InMemorySongs());
    const written = await writer.write(REQUEST);
    expect(written?.lyrics).toMatch(/\[verse\]/);
    expect(writer.busy()).toBe(false);
    expect(writer.error()).toBeNull();
  });

  it('is busy while it waits', async () => {
    const answer = new Subject<Written>();
    const writer = provide(portWith(() => answer));
    const pending = writer.write(REQUEST);
    expect(writer.busy()).toBe(true);
    answer.next({ title: '', lyrics: '', style: 'pop' });
    answer.complete();
    await pending;
    expect(writer.busy()).toBe(false);
  });

  it('says why when the assistant cannot, and returns nothing', async () => {
    for (const kind of ['unavailable', 'busy', 'refused'] as const) {
      const writer = provide(portWith(() => throwError(() => new AssistFailed(kind))));
      expect(await writer.write(REQUEST)).toBeNull();
      expect(writer.error()).toBe(kind);
    }
  });

  it('calls any other failure unknown, and clears the error on the next try', async () => {
    let fail = true;
    const ok = new InMemorySongs();
    const writer = provide(portWith((r) => (fail ? throwError(() => new Error('boom')) : ok.write(r))));
    await writer.write(REQUEST);
    expect(writer.error()).toBe('unknown');
    fail = false;
    await writer.write(REQUEST);
    expect(writer.error()).toBeNull();
  });
});
