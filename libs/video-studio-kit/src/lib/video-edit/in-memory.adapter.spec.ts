import { firstValueFrom, toArray } from 'rxjs';

import { InMemoryVideoEdit, VideoEditNotFound } from './in-memory.adapter';
import type { VideoEditRequest } from './model';
import { portBehaviour } from './port-behaviour';
import { VideoEditRefused } from './validate';

const file = { name: 'a.mp4', blob: new Blob(['x']) };
const image = { name: 'p.png', blob: new Blob(['x']) };
const make = () => new InMemoryVideoEdit({ pace: 0, steps: 2, videoUrl: () => 'blob:result' });
const scale = (over: Partial<VideoEditRequest> = {}): VideoEditRequest => ({ tool: 'scale', settings: { factor: 2 }, video: file, ...over });

portBehaviour('InMemoryVideoEdit', make);

describe('InMemoryVideoEdit', () => {
  it('lists the seven tools in order, with depth marked unavailable and its reason', async () => {
    const tools = await firstValueFrom(make().tools());
    expect(tools.map((t) => t.id)).toEqual(['scale', 'interpolate', 'reframe', 'remove-background', 'depth', 'extend', 'motion-control']);
    expect(tools.find((t) => t.id === 'depth')).toMatchObject({ available: false });
    expect(tools.find((t) => t.id === 'depth')?.reason).toBeTruthy();
  });

  it('creates an edit queued, and follows it queued, running, done with its result', async () => {
    const port = make();
    const created = await firstValueFrom(port.create(scale()));
    expect(created).toMatchObject({ tool: 'scale', state: 'queued', progress: 0 });
    const states = await firstValueFrom(port.follow(created.id).pipe(toArray()));
    expect(states.map((e) => e.state)).toEqual(['queued', 'running', 'running', 'done']);
    const done = states.at(-1)!;
    expect(done).toMatchObject({ progress: 100, result: { video: 'blob:result', format: 'mp4', hasAudio: true, width: 1280 } });
  });

  it('ends failed with an error and no result when the prompt asks for it', async () => {
    const port = make();
    const created = await firstValueFrom(port.create({ tool: 'extend', settings: { prompt: 'x [fail]' }, video: file }));
    const last = (await firstValueFrom(port.follow(created.id).pipe(toArray()))).at(-1)!;
    expect(last.state).toBe('failed');
    expect(last.error).toBeTruthy();
    expect(last.result).toBeUndefined();
  });

  it('lists newest first and removes, ending a follow without another emission', async () => {
    const port = make();
    const a = await firstValueFrom(port.create(scale()));
    const b = await firstValueFrom(port.create(scale()));
    expect((await firstValueFrom(port.list())).map((e) => e.id)).toEqual([b.id, a.id]);
    const seen: string[] = [];
    const sub = port.follow(a.id).subscribe((e) => seen.push(e.state));
    await firstValueFrom(port.remove(a.id));
    expect(sub.closed).toBe(true);
    expect(seen).toEqual(['queued']);
    expect((await firstValueFrom(port.list())).map((e) => e.id)).toEqual([b.id]);
  });

  it('refuses what the server refuses, and creates nothing', async () => {
    const port = make();
    const refusals: VideoEditRequest[] = [
      { tool: 'extend', settings: { seconds: 12 }, video: file },
      scale({ video: undefined }),
      scale({ image }),
      { tool: 'motion-control', settings: {}, video: file },
      { tool: 'depth', settings: {}, video: file },
    ];
    for (const r of refusals) await expect(firstValueFrom(port.create(r))).rejects.toBeInstanceOf(VideoEditRefused);
    expect(await firstValueFrom(port.list())).toEqual([]);
  });

  it('takes a library motion instead of a video for Motion Control', async () => {
    const created = await firstValueFrom(make().create({ tool: 'motion-control', settings: { strength: 0.8 }, motion: 'm1', image }));
    expect(created.motion).toBe('m1');
  });

  it('says so when following an edit that does not exist', async () => {
    await expect(firstValueFrom(make().follow('nope'))).rejects.toBeInstanceOf(VideoEditNotFound);
  });
});
