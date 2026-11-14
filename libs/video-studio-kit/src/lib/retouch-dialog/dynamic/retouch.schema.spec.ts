import { TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { withModels } from '../../shared/with-models';
import { DEMO_IMAGE_MODELS } from '../../retouch/in-memory.adapter';
import { STRENGTH_DEFAULT, STRENGTH_MAX, VARIANTS_DEFAULT, VARIANTS_MAX, VARIANTS_MIN } from '../../retouch/model';
import en from './retouch.en.json';
import es from './retouch.es.json';

interface Field {
  key?: string;
  type?: string;
  defaultValue?: unknown;
  validation?: { required?: boolean; min?: number; max?: number };
}

const schemas: [string, DfFormSchema][] = [
  ['es', es as DfFormSchema],
  ['en', en as DfFormSchema],
];

// The limits of a field live in the port and in the schema: this keeps the two equal.
describe.each(schemas)('the %s schema of the retouch', (_lang, schema) => {
  const field = (key: string): Field => (schema.fields as Field[]).find((f) => f.key === key)!;

  it('asks for the prompt and leaves the negative prompt optional', () => {
    expect(field('prompt').validation?.required).toBe(true);
    expect(field('negativePrompt').type).toBe('textarea');
    expect(field('negativePrompt').validation?.required).toBeFalsy();
  });

  it('declares the model as a select with no options of its own: the port gives the options', () => {
    const model = field('model') as Field & { options?: unknown };
    expect(model.type).toBe('select');
    expect(model.options).toBeUndefined();
  });

  it('accepts the strengths of the port, above 0, and starts at its default', () => {
    const { min, max } = field('strength').validation!;
    expect(max).toBe(STRENGTH_MAX);
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(STRENGTH_DEFAULT);
    expect(field('strength').defaultValue).toBe(STRENGTH_DEFAULT);
  });

  it('accepts the variants of the port and starts at its default', () => {
    expect(field('variants').validation).toMatchObject({ min: VARIANTS_MIN, max: VARIANTS_MAX });
    expect(field('variants').defaultValue).toBe(VARIANTS_DEFAULT);
  });

  it('is accepted by the library, with the models of the port, and draws every field', () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('schema', withModels(schema, DEMO_IMAGE_MODELS, '(unavailable)'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('textarea')).toHaveLength(2);
    expect(el.querySelectorAll('input[type="number"]')).toHaveLength(2);
    expect(el.querySelectorAll('mat-select')).toHaveLength(1);
  });
});
