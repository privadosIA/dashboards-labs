/** What every VideoEditPort does, whichever adapter is behind it: both adapters' specs run these. */
import { firstValueFrom, toArray } from 'rxjs';

import type { VideoEditRequest } from './model';
import type { VideoEditPort } from './port';
import { VideoEditRefused } from './validate';

const file = { name: 'a.mp4', blob: new Blob(['x']) };
const image = { name: 'p.png', blob: new Blob(['x']) };

export function portBehaviour(label: string, make: () => VideoEditPort): void {
  describe(`${label}: the behaviour of a video edit port`, () => {
    it('lists the tools in the contract order, an unavailable one marked with its reason', async () => {
      const tools = await firstValueFrom(make().tools());
      expect(tools.map((t) => t.id)).toEqual(['scale', 'interpolate', 'reframe', 'remove-background', 'depth', 'extend', 'motion-control']);
      const depth = tools.find((t) => t.id === 'depth')!;
      expect(depth.available).toBe(false);
      expect(depth.reason).toBeTruthy();
      expect(tools.find((t) => t.id === 'motion-control')).toMatchObject({ needsImage: true, acceptsMotion: true });
    });

    it('creates an edit queued and follows it to done with a result', async () => {
      const port = make();
      const created = await firstValueFrom(port.create({ tool: 'scale', settings: { factor: 2 }, video: file }));
      expect(created).toMatchObject({ tool: 'scale', state: 'queued' });
      const states = await firstValueFrom(port.follow(created.id).pipe(toArray()));
      const last = states.at(-1)!;
      expect(last.state).toBe('done');
      expect(last.result).toMatchObject({ format: 'mp4', hasAudio: true });
      expect(last.result!.video).toBeTruthy();
      expect(states.every((e, i) => i === 0 || e.progress >= states[i - 1].progress)).toBe(true);
    });

    it('refuses a setting out of its limits and a missing video, and creates nothing', async () => {
      const port = make();
      const refusals: VideoEditRequest[] = [
        { tool: 'extend', settings: { seconds: 12 }, video: file },
        { tool: 'scale', settings: {} },
        { tool: 'scale', settings: {}, video: file, image },
        { tool: 'motion-control', settings: {}, video: file },
      ];
      for (const r of refusals) await expect(firstValueFrom(port.create(r))).rejects.toBeInstanceOf(VideoEditRefused);
      const list = await firstValueFrom(port.list());
      expect(list).toEqual([]);
    });

    it('removes an edit from the list', async () => {
      const port = make();
      const created = await firstValueFrom(port.create({ tool: 'interpolate', settings: { fps: 60 }, video: file }));
      await firstValueFrom(port.remove(created.id));
      expect(await firstValueFrom(port.list())).toEqual([]);
    });
  });
}
