import { firstValueFrom } from 'rxjs';

import { InMemoryVideoGeneration } from './in-memory.adapter';
import { DEFAULT_SETTINGS, NO_REFERENCES, type GenerationSettings } from './model';
import { GenerationRefused } from './validate';

const img = { name: 'a.png', dataUrl: 'data:image/png;base64,AA==' };
const file = (name: string) => ({ name, blob: new Blob(['x']) });
const frames = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a fox', model: 'balanced', ...over });
const refs = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a fox', model: 'reference', ...over });

describe('InMemoryVideoGeneration inputs', () => {
  it('lists the inputs each demonstration model takes', async () => {
    const models = await firstValueFrom(new InMemoryVideoGeneration({ pace: 0 }).models());
    const by = Object.fromEntries(models.map((m) => [m.id, m.inputs]));
    expect(by['balanced']?.endImage).toBe(true);
    expect(by['fast']?.endImage).toBe(false);
    expect(by['reference']?.referenceImages?.max).toBe(2);
  });

  it('reports the inputs of a generation, start image first', async () => {
    const port = new InMemoryVideoGeneration({ pace: 0 });
    const g = await firstValueFrom(port.create(frames({ startImage: img, endImage: img })));
    expect(g.inputs?.map((i) => i.kind)).toEqual(['start_image', 'end_image']);
  });

  it('refuses an end image without a start image and creates nothing', async () => {
    const port = new InMemoryVideoGeneration({ pace: 0 });
    await expect(firstValueFrom(port.create(frames({ endImage: img })))).rejects.toBeInstanceOf(GenerationRefused);
    expect(await firstValueFrom(port.list())).toEqual([]);
  });

  it('makes a generation from references, in order', async () => {
    const port = new InMemoryVideoGeneration({ pace: 0 });
    const g = await firstValueFrom(port.create(refs({ references: { ...NO_REFERENCES, images: [file('1.png'), file('2.png')] } })));
    expect(g.inputs?.map((i) => i.name)).toEqual(['1.png', '2.png']);
  });

  it('repeats a generation with its inputs, nothing sent again, and leaves the original alone', async () => {
    const port = new InMemoryVideoGeneration({ pace: 0 });
    const first = await firstValueFrom(port.create(refs({ references: { ...NO_REFERENCES, images: [file('1.png')] } })));
    const again = await firstValueFrom(port.repeat(first.id));
    expect(again.id).not.toBe(first.id);
    expect(again.inputs?.map((i) => i.name)).toEqual(['1.png']);
    expect((await firstValueFrom(port.list())).length).toBe(2);
  });

  it('says the inputs are gone when a reuse has nothing to reuse', async () => {
    const port = new InMemoryVideoGeneration({ pace: 0 });
    const reuse = { of: 'gen-9', inputs: [{ kind: 'reference_image' as const, name: '1.png', url: '' }] };
    await expect(firstValueFrom(port.create(refs({ reuse })))).rejects.toThrow(/no longer kept/);
  });
});
