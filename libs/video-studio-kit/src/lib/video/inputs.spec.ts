import { forModel } from './inputs';
import { DEFAULT_SETTINGS, NO_REFERENCES, START_ONLY, type GenerationSettings, type ModelInputs, type ReferenceFile } from './model';
import { GenerationRefused, validate } from './validate';

const FRAMES: ModelInputs = { startImage: true, endImage: true };
const REFS: ModelInputs = { startImage: false, endImage: false, referenceImages: { min: 1, max: 2 }, referenceVideos: { max: 1, maxSeconds: 2 }, referenceAudios: { max: 1, maxSeconds: 3 } };
const img = { name: 'a.png', dataUrl: 'data:image/png;base64,AA' };
const file = (name: string, seconds?: number): ReferenceFile => ({ name, blob: new Blob(['x']), ...(seconds !== undefined ? { seconds } : {}) });
const ok = (patch: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, model: 'm', prompt: 'a fox', ...patch });
const refs = (patch: Partial<NonNullable<GenerationSettings['references']>>) => ({ ...NO_REFERENCES, ...patch });

describe('the inputs of a request', () => {
  it('accepts a start image with an end image for a model that takes both', () => {
    expect(validate(ok({ startImage: img, endImage: img }), undefined, true, FRAMES)).toEqual([]);
  });

  it('refuses an end image without a start image', () => {
    expect(validate(ok({ endImage: img }), undefined, true, FRAMES)).toEqual(['end-image-needs-start']);
  });

  it('refuses an end image for a model that does not take one', () => {
    expect(validate(ok({ startImage: img, endImage: img }), undefined, true, START_ONLY)).toEqual(['end-image-not-accepted']);
  });

  it('refuses references for a model that takes none', () => {
    expect(validate(ok({ references: refs({ images: [file('r.png')] }) }), undefined, true, START_ONLY)).toEqual(['references-not-accepted']);
  });

  it('refuses references mixed with a start image', () => {
    expect(validate(ok({ startImage: img, references: refs({ images: [file('r.png')] }) }), undefined, true, REFS)).toContain('references-mixed');
  });

  it('refuses a references model with no reference image', () => {
    expect(validate(ok({ references: refs({ audios: [file('a.wav', 1)] }) }), undefined, true, REFS)).toEqual(['reference-image-required']);
  });

  it('refuses more reference images than the maximum, saying the maximum', () => {
    const settings = ok({ references: refs({ images: [file('1.png'), file('2.png'), file('3.png')] }) });
    const problems = validate(settings, undefined, true, REFS);
    expect(problems).toEqual(['reference-images-max']);
    expect(new GenerationRefused(problems, REFS).message).toContain('at most 2');
  });

  it('refuses a video or an audio longer than the model takes, and accepts one whose length is unknown', () => {
    expect(validate(ok({ references: refs({ images: [file('1.png')], videos: [file('v.mp4', 3)] }) }), undefined, true, REFS)).toEqual(['reference-video-seconds']);
    expect(validate(ok({ references: refs({ images: [file('1.png')], audios: [file('a.wav', 4)] }) }), undefined, true, REFS)).toEqual(['reference-audio-seconds']);
    expect(validate(ok({ references: refs({ images: [file('1.png')], videos: [file('v.mp4')] }) }), undefined, true, REFS)).toEqual([]);
  });

  it('accepts a full set of references and lets the first image stand for the prompt', () => {
    const references = refs({ images: [file('1.png'), file('2.png')], videos: [file('v.mp4', 2)], audios: [file('a.wav', 3)] });
    expect(validate(ok({ prompt: '', references }), undefined, true, REFS)).toEqual([]);
  });

  it('counts the files the server keeps for reuse, and refuses reuse together with files', () => {
    const reuse = { of: 'g1', inputs: [{ kind: 'reference_image' as const, name: 'r.png', url: 'u' }] };
    expect(validate(ok({ reuse }), undefined, true, REFS)).toEqual([]);
    expect(validate(ok({ reuse, references: refs({ images: [file('1.png')] }) }), undefined, true, REFS)).toContain('reuse-with-files');
  });
});

describe('forModel', () => {
  it('drops what the model does not take and keeps the rest', () => {
    const settings = ok({ startImage: img, endImage: img, references: refs({ images: [file('1.png')] }) });
    expect(forModel(settings, FRAMES)).toMatchObject({ startImage: img, endImage: img, references: NO_REFERENCES });
    const only = forModel(settings, REFS);
    expect(only.startImage).toBeNull();
    expect(only.endImage).toBeNull();
    expect(only.references?.images).toHaveLength(1);
    expect(forModel(settings, START_ONLY)).toMatchObject({ startImage: img, endImage: null });
  });

  it('keeps the original settings untouched so choosing the model again brings the inputs back', () => {
    const settings = ok({ startImage: img, endImage: img });
    forModel(settings, START_ONLY);
    expect(settings.endImage).toBe(img);
  });

  it('drops the reuse when the model cannot take every file of it', () => {
    const reuse = { of: 'g1', inputs: [{ kind: 'end_image' as const, name: 'e.png', url: 'u' }, { kind: 'start_image' as const, name: 's.png', url: 'u' }] };
    expect(forModel(ok({ reuse }), FRAMES).reuse).toBe(reuse);
    expect(forModel(ok({ reuse }), START_ONLY).reuse).toBeUndefined();
  });
});
