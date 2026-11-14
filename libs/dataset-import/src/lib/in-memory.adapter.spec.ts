import { firstValueFrom } from 'rxjs';

import { InMemoryDataset } from './in-memory.adapter';
import { DatasetFailed } from './port';

describe('InMemoryDataset', () => {
  it('counts the lines of the file as entries', async () => {
    const preview = await firstValueFrom(new InMemoryDataset().preview('a\nb\n\nc\nd', 'music'));
    expect(preview.entries).toBe(4);
    expect(preview.imported).toBe(4);
    expect(preview.yaml).toContain('tracks');
  });

  it('writes scenes for video', async () => {
    expect((await firstValueFrom(new InMemoryDataset().preview('a', 'video'))).yaml).toContain('scenes');
  });

  it('writes graphics for motion and counts the graphics with a duration and no dialogue as quiet', async () => {
    const file = JSON.stringify([
      ['g1', 'Counter', '', 'Graphic: counter\nDuration: 4'],
      ['g2', 'Toggle', '', 'Part: toggle\nParam count: 3\nDuration: 3\nDialogue: "hello"'],
      ['g3', 'Title', '', 'Graphic: title'],
    ]);
    const preview = await firstValueFrom(new InMemoryDataset().preview(file, 'motion'));
    expect(preview).toMatchObject({ entries: 3, imported: 3, quiet: 1, rejected: 0 });
    expect(preview.yaml).toContain('graphics');
  });

  it('rejects an empty file', async () => {
    const e = await firstValueFrom(new InMemoryDataset().preview('  \n', 'music')).catch((x) => x as DatasetFailed);
    expect((e as DatasetFailed).kind).toBe('rejected');
  });

  it('never creates the same id twice', async () => {
    const port = new InMemoryDataset();
    expect(await firstValueFrom(port.confirm('a'))).toBe('a');
    const e = await firstValueFrom(port.confirm('a')).catch((x) => x as DatasetFailed);
    expect((e as DatasetFailed).kind).toBe('taken');
  });
});
