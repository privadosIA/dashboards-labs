import { DEFAULT_EDIT, STRENGTH_MAX, VARIANTS_MAX, VARIANTS_MIN, type EditRequest, type ImageModel } from './model';
import { EditRefused, validateEdit } from './validate';

const image = { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' };
const ok = (patch: Partial<EditRequest> = {}): EditRequest => ({ ...DEFAULT_EDIT, image, model: 'balanced', prompt: 'make it watercolor', ...patch });

const model = (id: string, over: Partial<ImageModel> = {}): ImageModel => ({
  id,
  name: id,
  description: id,
  available: true,
  strength: true,
  negativePrompt: true,
  maxVariants: 4,
  ...over,
});

describe('validateEdit', () => {
  it('accepts a valid request, with or without a negative prompt', () => {
    expect(validateEdit(ok())).toEqual([]);
    expect(validateEdit(ok({ negativePrompt: 'blurry, extra fingers' }))).toEqual([]);
    expect(validateEdit(ok({ negativePrompt: '' }))).toEqual([]);
  });

  it('refuses a blank prompt', () => {
    expect(validateEdit(ok({ prompt: '   ' }))).toEqual(['prompt-required']);
    expect(validateEdit(ok({ prompt: '', negativePrompt: 'blurry' }))).toEqual(['prompt-required']);
  });

  it('accepts a strength above 0 up to the maximum and refuses what is outside', () => {
    expect(validateEdit(ok({ strength: 0.05 }))).toEqual([]);
    expect(validateEdit(ok({ strength: STRENGTH_MAX }))).toEqual([]);
    for (const strength of [0, -0.1, STRENGTH_MAX + 0.2, NaN, Infinity]) expect(validateEdit(ok({ strength })), String(strength)).toEqual(['strength']);
  });

  it('accepts the whole range of variants and refuses just outside it or a fraction', () => {
    expect(validateEdit(ok({ variants: VARIANTS_MIN }))).toEqual([]);
    expect(validateEdit(ok({ variants: VARIANTS_MAX }))).toEqual([]);
    for (const variants of [VARIANTS_MIN - 1, VARIANTS_MAX + 1, 1.5, NaN]) expect(validateEdit(ok({ variants })), String(variants)).toEqual(['variants']);
  });

  it('refuses an empty model, and a model outside the identifiers it is given', () => {
    expect(validateEdit(ok({ model: '' }))).toEqual(['model']);
    expect(validateEdit(ok({ model: 'other' }))).toEqual([]);
    const models = [model('balanced'), model('detailed')];
    expect(validateEdit(ok({ model: 'other' }), models)).toEqual(['model']);
    expect(validateEdit(ok({ model: 'detailed' }), models)).toEqual([]);
    expect(validateEdit(ok({ model: '' }), [model('balanced')])).toEqual(['model']);
  });

  it('refuses a model that is listed but not available, as an unknown one', () => {
    const models = [model('off', { available: false }), model('balanced')];
    expect(validateEdit(ok({ model: 'off' }), models)).toEqual(['model']);
    expect(validateEdit(ok({ model: 'balanced' }), models)).toEqual([]);
  });

  it('judges the variants against what the chosen model makes', () => {
    const models = [model('balanced'), model('wide', { maxVariants: 8 }), model('single', { maxVariants: 1 })];
    expect(validateEdit(ok({ model: 'wide', variants: 8 }), models)).toEqual([]);
    expect(validateEdit(ok({ model: 'wide', variants: 9 }), models)).toEqual(['variants']);
    expect(validateEdit(ok({ model: 'balanced', variants: 5 }), models)).toEqual(['variants']);
    expect(validateEdit(ok({ model: 'single', variants: 1 }), models)).toEqual([]);
    expect(validateEdit(ok({ model: 'single', variants: 2 }), models)).toEqual(['variants']);
  });

  it('does not judge the strength of a model that takes none', () => {
    const models = [model('balanced'), model('instruction', { strength: false, negativePrompt: false, maxVariants: 1 })];
    for (const strength of [0, 1.2, NaN]) {
      expect(validateEdit(ok({ model: 'instruction', strength, variants: 1 }), models), String(strength)).toEqual([]);
      expect(validateEdit(ok({ model: 'balanced', strength }), models), String(strength)).toEqual(['strength']);
    }
  });

  it('reports every problem at once', () => {
    expect(validateEdit(ok({ prompt: '', strength: 0, variants: 5, model: '' }))).toEqual(['prompt-required', 'strength', 'variants', 'model']);
  });
});

describe('EditRefused', () => {
  it('says what is wrong', () => {
    expect(new EditRefused(['prompt-required']).message).toContain('prompt is needed');
    expect(new EditRefused(['strength']).message).toContain('above 0');
    expect(new EditRefused(['variants']).message).toContain('from 1 to 4');
    expect(new EditRefused(['variants'], 8).message).toContain('from 1 to 8');
    expect(new EditRefused(['model']).message).toContain('one of the available');
    expect(new EditRefused(['strength', 'variants']).message).toContain('; ');
  });
});
