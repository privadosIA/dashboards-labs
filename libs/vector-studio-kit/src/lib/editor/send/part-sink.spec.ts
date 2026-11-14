import { TestBed } from '@angular/core/testing';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import { setKeyframe, toPart, type PartFiles } from '@lab/vector-editor';
import { installBBoxPolyfill, sampleDocument } from '@lab/vector-editor/testing';
import { firstValueFrom, lastValueFrom } from 'rxjs';

import { PartSink } from './part-sink';

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function files(name: string): PartFiles {
  const made = toPart(sampleDocument(), { name, description: 'A logo that turns' });
  if ('problems' in made) throw new Error(made.problems.join());
  return made;
}

function setup() {
  const port = new InMemoryAnimation({ storage: storage() as Storage });
  TestBed.configureTestingModule({
    providers: [PartSink, { provide: ANIMATION, useValue: port }, { provide: TicketService, useValue: { withTicket: (a: string) => `${a}?ticket=t1` } }],
  });
  return { sink: TestBed.inject(PartSink), port };
}

describe('PartSink over the in-memory adapter', () => {
  beforeAll(() => installBBoxPolyfill());

  it('says whether a name is free in the catalog', async () => {
    const { sink, port } = setup();
    const taken = (await firstValueFrom(port.catalog())).parts[0].name;
    expect(await firstValueFrom(sink.isNameFree(taken))).toBe(false);
    expect(await firstValueFrom(sink.isNameFree('spin-logo'))).toBe(true);
  });

  it('makes a draft from the exported part that is ready, with the pictures the adapter drew', async () => {
    const { sink } = setup();
    const d = await firstValueFrom(sink.createDraft(files('spin-logo')));
    expect(d).toMatchObject({ state: 'ready', problems: [] });
    expect(d.previews.length).toBeGreaterThan(0);
    expect(d.previews.every((p) => p.startsWith('data:') || p.endsWith('?ticket=t1'))).toBe(true);
  });

  it('approves it: the part is in the catalog, its text is the one sent, and the name is no longer free', async () => {
    const { sink, port } = setup();
    const sent = files('spin-logo');
    const d = await firstValueFrom(sink.createDraft(sent));
    await lastValueFrom(sink.approve(d.id), { defaultValue: undefined });
    expect(await firstValueFrom(sink.isNameFree('spin-logo'))).toBe(false);
    const part = (await firstValueFrom(port.catalog())).parts.find((p) => p.name === 'spin-logo');
    expect(part).toMatchObject({ source: 'user', description: 'A logo that turns' });
    expect(await firstValueFrom(port.partText('spin-logo'))).toMatchObject({ manifest: sent.manifest, fragment: sent.fragment });
  });

  it('gives back the problems when the adapter refuses the text, and a name that exists', async () => {
    const { sink } = setup();
    const bad = await firstValueFrom(sink.createDraft({ manifest: '{"name":"x"', fragment: '<div></div>' }));
    expect(bad.state).toBe('failed');
    expect(bad.problems.length).toBeGreaterThan(0);
    const first = await firstValueFrom(sink.createDraft(files('spin-logo')));
    await lastValueFrom(sink.approve(first.id), { defaultValue: undefined });
    const again = await firstValueFrom(sink.createDraft(files('spin-logo')));
    expect(again.state).toBe('failed');
    expect(again.problems.join(' ')).toContain('already exists');
  });

  it('replaces the texts of a part of the catalog, and fails with the reason when the adapter refuses', async () => {
    const { sink, port } = setup();
    const d = await firstValueFrom(sink.createDraft(files('spin-logo')));
    await lastValueFrom(sink.approve(d.id), { defaultValue: undefined });
    const changed = toPart(setKeyframe(sampleDocument(), 'tag', 'x', 0, 5), { name: 'spin-logo', description: 'Changed' }) as PartFiles;
    await lastValueFrom(sink.replace('spin-logo', changed), { defaultValue: undefined });
    expect((await firstValueFrom(port.partText('spin-logo'))).manifest).toContain('Changed');
    await expect(lastValueFrom(sink.replace('spin-logo', { manifest: '{"name":"other"', fragment: '' }))).rejects.toThrow();
    await expect(lastValueFrom(sink.replace('nope', changed))).rejects.toThrow();
  });

  it('follows a draft that is already finished: it emits it once and ends', async () => {
    const { sink, port } = setup();
    const d = await firstValueFrom(sink.createDraft(files('spin-logo')));
    const seen = await lastValueFrom(sink.followDraft(d.id));
    expect(seen.id).toBe(d.id);
    expect((await firstValueFrom(port.drafts())).some((x) => x.id === d.id)).toBe(true);
  });
});
