import { firstValueFrom } from 'rxjs';

import { InMemoryBlenderScene, MEMORY_DESCRIPTION } from './memory.adapter';
import { SceneFailed } from './port';

const context = { scope: 'a.scene.json', seconds: 5, aspectRatio: '16:9' };

describe('InMemoryBlenderScene', () => {
  it('has nothing for a scope until one is written, then keeps it for that scope only', async () => {
    const port = new InMemoryBlenderScene();
    expect(await firstValueFrom(port.load('a.scene.json'))).toBeNull();
    const written = await firstValueFrom(port.write(context, 'a title', null));
    expect(written.description).toEqual(MEMORY_DESCRIPTION());
    expect(written.model).toBe('memory-model');
    expect((await firstValueFrom(port.load('a.scene.json')))?.description).toEqual(written.description);
    expect(await firstValueFrom(port.load('b.scene.json'))).toBeNull();
  });

  it('changing a description moves the camera and keeps the rest', async () => {
    const port = new InMemoryBlenderScene();
    const first = await firstValueFrom(port.write(context, 'a title', null));
    const changed = await firstValueFrom(port.write(context, 'further away', first.description));
    expect((changed.description['camera'] as { lens: number }).lens).toBeLessThan((first.description['camera'] as { lens: number }).lens);
    expect(changed.description['objects']).toEqual(first.description['objects']);
  });

  it('refuses an idea with [fail] as the server refuses one that never passes', async () => {
    const e = await firstValueFrom(new InMemoryBlenderScene().write(context, 'a cube [fail]', null)).catch((x) => x);
    expect(e).toBeInstanceOf(SceneFailed);
    expect((e as SceneFailed).status).toBe(422);
  });

  it('saves what has version 1 and refuses what has not, naming the fault', async () => {
    const port = new InMemoryBlenderScene();
    expect((await firstValueFrom(port.save(context, { version: 1 }))).description).toEqual({ version: 1 });
    const e = await firstValueFrom(port.save(context, { version: 2 })).catch((x) => x);
    expect([(e as SceneFailed).status, (e as SceneFailed).said]).toEqual([400, 'version: must be 1']);
  });

  it('draws a picture, and refuses a second outside the scene or a description that is not one', async () => {
    const port = new InMemoryBlenderScene();
    expect((await firstValueFrom(port.preview(context, { version: 1 }, 2))).type).toBe('image/png');
    expect(((await firstValueFrom(port.preview(context, { version: 1 }, 9)).catch((x) => x)) as SceneFailed).said).toContain('outside the scene');
    expect(((await firstValueFrom(port.preview(context, { version: 3 }, 1)).catch((x) => x)) as SceneFailed).status).toBe(400);
  });
});
