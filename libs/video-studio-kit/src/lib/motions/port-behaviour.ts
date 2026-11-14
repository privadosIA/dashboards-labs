/** What every MotionLibraryPort does, whichever adapter is behind it: both adapters' specs run these. */
import { firstValueFrom } from 'rxjs';

import type { MotionLibraryPort } from './port';
import { MotionRefused } from './validate';

const video = (name = 'walk.mp4') => ({ name, blob: new Blob(['x']) });
/** Reads the library until the motion is no longer processing. */
async function settled(port: MotionLibraryPort, id: string) {
  for (let i = 0; i < 100; i++) {
    const found = (await firstValueFrom(port.list())).find((m) => m.id === id);
    if (found && found.state !== 'processing') return found;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('the motion never settled');
}

export function motionPortBehaviour(label: string, make: () => MotionLibraryPort): void {
  describe(`${label}: the behaviour of a library of motions`, () => {
    it('starts empty', async () => {
      expect(await firstValueFrom(make().list())).toEqual([]);
    });

    it('adds a motion as processing, and it becomes ready', async () => {
      const port = make();
      const added = await firstValueFrom(port.add({ video: video(), title: 'Walk', tags: ['walk'] }));
      expect(added).toMatchObject({ title: 'Walk', state: 'processing', tags: ['walk'] });
      expect(await settled(port, added.id)).toMatchObject({ id: added.id, state: 'ready' });
    });

    it('refuses a missing or unreadable video and adds nothing', async () => {
      const port = make();
      await expect(firstValueFrom(port.add({ video: video('notes.txt') }))).rejects.toBeInstanceOf(MotionRefused);
      expect(await firstValueFrom(port.list())).toEqual([]);
    });

    it('adds a motion from an address, with its tags, and refuses an address together with a file', async () => {
      const port = make();
      const added = await firstValueFrom(port.add({ source: 'https://example.com/clips/dance.mp4', tags: ['dance'] }));
      expect(added).toMatchObject({ state: 'processing' });
      await expect(firstValueFrom(port.add({ source: 'https://example.com/a.mp4', video: video() }))).rejects.toBeInstanceOf(MotionRefused);
      await expect(firstValueFrom(port.add({ source: 'ftp://example.com/a.mp4' }))).rejects.toBeInstanceOf(MotionRefused);
      expect(await firstValueFrom(port.list())).toHaveLength(1);
    });

    it('removes a motion from the library', async () => {
      const port = make();
      const added = await firstValueFrom(port.add({ video: video() }));
      await firstValueFrom(port.remove(added.id));
      expect(await firstValueFrom(port.list())).toEqual([]);
    });
  });
}
