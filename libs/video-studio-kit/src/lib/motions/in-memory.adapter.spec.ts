import { firstValueFrom } from 'rxjs';

import { InMemoryMotionLibrary } from './in-memory.adapter';
import { motionPortBehaviour } from './port-behaviour';

const make = () => new InMemoryMotionLibrary({ pace: 0, previewUrl: () => 'blob:preview' });
const video = { name: 'walk.mp4', blob: new Blob(['x']) };

motionPortBehaviour('InMemoryMotionLibrary', make);

describe('InMemoryMotionLibrary', () => {
  it('takes the title from the file when none is given, and gives the preview an address', async () => {
    const added = await firstValueFrom(make().add({ video }));
    expect(added.title).toBe('walk');
    expect(added.preview).toBe('blob:preview');
  });

  it('ends failed, with a reason, when the title says so', async () => {
    const port = make();
    const added = await firstValueFrom(port.add({ video, title: 'bad [fail]' }));
    await new Promise((r) => setTimeout(r, 5));
    const found = (await firstValueFrom(port.list())).find((m) => m.id === added.id)!;
    expect(found.state).toBe('failed');
    expect(found.error).toBeTruthy();
  });

  it('lists the newest first and tells the list again when a motion gets ready', async () => {
    const port = make();
    const seen: string[][] = [];
    const sub = port.list().subscribe((l) => seen.push(l.map((m) => `${m.title}:${m.state}`)));
    await firstValueFrom(port.add({ video, title: 'a' }));
    await firstValueFrom(port.add({ video, title: 'b' }));
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    expect(seen.at(-1)).toEqual(['b:ready', 'a:ready']);
    expect(seen.some((l) => l[0] === 'b:processing')).toBe(true);
  });
});
