import { ApiError, type components } from '@lab/api-client';
import { firstValueFrom, of, throwError } from 'rxjs';

import { DEFAULT_EDIT, type EditRequest } from './model';
import { ServerImageEdit, toEditRequest, type EditApi } from './server.adapter';
import { EditRefused } from './validate';

type Model = components['schemas']['ImageModel'];
type Edit = components['schemas']['ImageEdit'];

const model = (over: Partial<Model>): Model => ({
  id: 'm',
  name: 'M',
  description: 'd',
  kind: 'img2img',
  available: true,
  strength: true,
  negative_prompt: true,
  max_variants: 8,
  default: false,
  ...over,
});
const MODELS = [
  model({ id: 'kontext', name: 'Kontext', kind: 'instruction', strength: false, negative_prompt: false, max_variants: 1, default: true }),
  model({ id: 'qwen', name: 'Qwen', kind: 'instruction', strength: false, negative_prompt: false, max_variants: 1, available: false, reason: 'the model files are not installed' }),
  model({ id: 'sd', name: 'SD', max_variants: 4 }),
  model({ id: 'xl', name: 'XL', max_variants: 8 }),
];
const OPTIONS = { video: [], image_models: MODELS, aspect_ratios: ['16:9'], qualities: ['draft'] };

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const request = (over: Partial<EditRequest> = {}): EditRequest => ({
  ...DEFAULT_EDIT,
  image: { name: 'photo.png', dataUrl: PNG },
  model: 'sd',
  prompt: 'make it night',
  negativePrompt: 'blur',
  strength: 0.7,
  variants: 3,
  ...over,
});
const done = (variants: number): Edit => ({
  id: 'api-edit-1',
  state: 'done',
  progress: 100,
  request: { model: 'sd', prompt: 'p' },
  client: 'video-studio',
  run_id: 'r',
  created_at: '2026-11-02T10:00:00Z',
  size_bytes: 1,
  results: Array.from({ length: variants }, (_, i) => ({ variant: i + 1, seed: 1000 + i, image: `/api/projects/api-edit-1/artifacts/out/api-edit-1/imagen_1_v${i + 1}.png` })),
});

class FakeApi {
  states: Edit[] = [];
  posted: { request: Record<string, unknown>; image: File }[] = [];
  deleted: string[] = [];
  read: string[] = [];
  failRead = false;

  get = ((path: string) => {
    if (path === '/api/generation/options') return of(OPTIONS);
    const next = this.states.length > 1 ? this.states.shift()! : this.states[0];
    return of(next);
  }) as unknown as EditApi['get'];
  postForm = ((_: string, form: FormData) => {
    this.posted.push({ request: JSON.parse(form.get('request') as string), image: form.get('image') as File });
    return of({ id: 'api-edit-1' });
  }) as unknown as EditApi['postForm'];
  delete = ((_: string, options: { path: { id: string } }) => {
    this.deleted.push(options.path.id);
    return of(undefined);
  }) as unknown as EditApi['delete'];
  getBlobAt = ((address: string) => {
    this.read.push(address);
    return this.failRead ? throwError(() => new ApiError(404, 'not_found', 'gone')) : of({ body: new Blob(['png'], { type: 'image/png' }), contentType: 'image/png' });
  }) as unknown as EditApi['getBlobAt'];
}

const setup = () => {
  const api = new FakeApi();
  return { api, port: new ServerImageEdit(api as unknown as EditApi, { pollMs: 1 }) };
};

describe('toEditRequest', () => {
  it('sends the strength and the negative prompt to a model that takes them, with the variants it makes', () => {
    expect(toEditRequest(request(), MODELS[2])).toEqual({ model: 'sd', prompt: 'make it night', variants: 3, strength: 0.7, negative_prompt: 'blur', client: 'video-studio' });
    expect(toEditRequest(request({ variants: 6, negativePrompt: '  ' }), MODELS[2])).toEqual({ model: 'sd', prompt: 'make it night', variants: 4, strength: 0.7, client: 'video-studio' });
  });
  it('sends neither to an instruction model and asks for one picture', () => {
    expect(toEditRequest(request({ model: 'kontext' }), MODELS[0])).toEqual({ model: 'kontext', prompt: 'make it night', variants: 1, client: 'video-studio' });
  });
});

describe('ServerImageEdit', () => {
  it('offers the available models, the server\'s default first', async () => {
    expect((await firstValueFrom(setup().port.models())).map((m) => m.id)).toEqual(['kontext', 'qwen', 'sd', 'xl']);
  });

  it('lists the unavailable models too, marked with the server\'s reason', async () => {
    const models = await firstValueFrom(setup().port.models());
    expect(models.map((m) => m.available)).toEqual([true, false, true, true]);
    expect(models[1].reason).toBe('the model files are not installed');
    expect(models[0].reason).toBeUndefined();
  });

  it('refuses a model that is listed but unavailable, and sends nothing', async () => {
    const { api, port } = setup();
    await expect(firstValueFrom(port.edit(request({ model: 'qwen', variants: 1 })))).rejects.toThrow(EditRefused);
    expect(api.posted).toEqual([]);
  });

  it('says what each model takes and the most variants it makes', async () => {
    const models = await firstValueFrom(setup().port.models());
    expect(models.map(({ id, strength, negativePrompt, maxVariants }) => ({ id, strength, negativePrompt, maxVariants }))).toEqual([
      { id: 'kontext', strength: false, negativePrompt: false, maxVariants: 1 },
      { id: 'qwen', strength: false, negativePrompt: false, maxVariants: 1 },
      { id: 'sd', strength: true, negativePrompt: true, maxVariants: 4 },
      { id: 'xl', strength: true, negativePrompt: true, maxVariants: 8 },
    ]);
  });

  it('asks for as many variants as a model makes, up to its maximum, and refuses more', async () => {
    const { api, port } = setup();
    api.states = [done(8)];
    await firstValueFrom(port.edit(request({ model: 'xl', variants: 8 })));
    expect(api.posted[0].request['variants']).toBe(8);
    await expect(firstValueFrom(port.edit(request({ model: 'xl', variants: 9 })))).rejects.toThrow('from 1 to 8');
    await expect(firstValueFrom(port.edit(request({ model: 'sd', variants: 5 })))).rejects.toThrow(EditRefused);
    expect(api.posted).toHaveLength(1);
  });

  it('retouches: posts the form, waits for it, reads the pictures with their seeds and deletes the edit', async () => {
    const { api, port } = setup();
    api.states = [{ ...done(0), state: 'queued', progress: 0, results: undefined }, { ...done(0), state: 'running', progress: 40, results: undefined }, done(3)];
    const results = await firstValueFrom(port.edit(request()));
    expect(api.posted).toHaveLength(1);
    expect(api.posted[0].request).toEqual({ model: 'sd', prompt: 'make it night', variants: 3, strength: 0.7, negative_prompt: 'blur', client: 'video-studio' });
    expect([api.posted[0].image.name, api.posted[0].image.type]).toEqual(['photo.png', 'image/png']);
    expect(results.map((r) => r.seed)).toEqual([1000, 1001, 1002]);
    expect(results.map((r) => r.image.name)).toEqual(['result-1.png', 'result-2.png', 'result-3.png']);
    expect(results[0].image.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(api.read).toHaveLength(3);
    expect(api.deleted).toEqual(['api-edit-1']);
  });

  it('does not send what an instruction model refuses', async () => {
    const { api, port } = setup();
    api.states = [done(1)];
    await firstValueFrom(port.edit(request({ model: 'kontext', variants: 1, strength: 0 })));
    expect(api.posted[0].request).toEqual({ model: 'kontext', prompt: 'make it night', variants: 1, client: 'video-studio' });
  });

  it('refuses more than one variant from a model that makes one', async () => {
    const { api, port } = setup();
    await expect(firstValueFrom(port.edit(request({ model: 'kontext', variants: 2 })))).rejects.toThrow(EditRefused);
    expect(api.posted).toEqual([]);
  });

  it('errors with the message of a failed edit, and still deletes it', async () => {
    const { api, port } = setup();
    api.states = [{ ...done(0), state: 'failed', results: undefined, error: 'out of memory' }];
    await expect(firstValueFrom(port.edit(request()))).rejects.toThrow('out of memory');
    expect(api.deleted).toEqual(['api-edit-1']);
  });

  it('deletes the edit even when a picture cannot be read', async () => {
    const { api, port } = setup();
    api.states = [done(2)];
    api.failRead = true;
    await expect(firstValueFrom(port.edit(request()))).rejects.toBeInstanceOf(ApiError);
    expect(api.deleted).toEqual(['api-edit-1']);
  });

  it('refuses with the studio\'s rules and sends nothing', async () => {
    const { api, port } = setup();
    await expect(firstValueFrom(port.edit(request({ prompt: ' ' })))).rejects.toBeInstanceOf(EditRefused);
    await expect(firstValueFrom(port.edit(request({ model: 'qwen' })))).rejects.toBeInstanceOf(EditRefused); // unavailable
    expect(api.posted).toHaveLength(0);
  });
});
