import type { DfFormSchema } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import type { ImageModel } from '../retouch/model';
import en from './dynamic/retouch.en.json';
import es from './dynamic/retouch.es.json';
import { withModelFields } from './with-model-fields';

const model = (over: Partial<ImageModel> = {}): ImageModel => ({ id: 'm', name: 'M', description: 'd', available: true, strength: true, negativePrompt: true, maxVariants: 4, ...over });
const keys = (schema: DfFormSchema) => schema.fields.flatMap((f) => ('key' in f ? [f.key] : []));
const variants = (schema: DfFormSchema) => schema.fields.find((f) => 'key' in f && f.key === 'variants') as unknown as { label: string; validation: { max: number; messages: Record<string, string> } };

describe('withModelFields', () => {
  for (const lang of ['en', 'es'] as const) {
    const base = pickSchema('retouch', { en, es }, lang);

    it(`keeps every field for a model that takes them all (${lang})`, () => {
      expect(keys(withModelFields(base, model()))).toEqual(keys(base));
    });

    it(`takes the fields a model does not take out, and nothing else (${lang})`, () => {
      expect(keys(withModelFields(base, model({ strength: false })))).toEqual(keys(base).filter((k) => k !== 'strength'));
      expect(keys(withModelFields(base, model({ negativePrompt: false })))).toEqual(keys(base).filter((k) => k !== 'negativePrompt'));
    });

    it(`sets the range of the variants from what the model makes, in the texts and in the limit (${lang})`, () => {
      const field = variants(withModelFields(base, model({ maxVariants: 8 })));
      expect(field.label).toContain('8');
      expect(field.label).not.toContain('{max}');
      expect(field.validation.max).toBe(8);
      for (const message of Object.values(field.validation.messages)) expect(message).not.toContain('{max}');
      expect(field.validation.messages['max']).toContain('8');
    });

    it(`has no variants for a model that makes one (${lang})`, () => {
      expect(keys(withModelFields(base, model({ maxVariants: 1 })))).not.toContain('variants');
    });

    it(`is the schema as it is without a model (${lang})`, () => {
      expect(withModelFields(base)).toBe(base);
    });
  }

  it('does not change the schema it is given', () => {
    const base = pickSchema('retouch', { en, es }, 'en');
    const before = JSON.stringify(base);
    withModelFields(base, model({ maxVariants: 8, strength: false }));
    expect(JSON.stringify(base)).toBe(before);
  });
});
