import { TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { defaultModelId, withModels } from './with-models';

const base: DfFormSchema = {
  version: '1.0',
  id: 'with-models',
  fields: [
    { key: 'prompt', type: 'textarea', label: 'Prompt' },
    { key: 'model', type: 'select', label: 'Model' },
  ],
};
const modelField = (schema: DfFormSchema) =>
  schema.fields.find((f) => 'key' in f && f.key === 'model') as { defaultValue?: unknown; options?: { value: string; label: string; disabled?: boolean }[] };
const A = { id: 'a', name: 'A', available: true };
const B = { id: 'b', name: 'B', available: true };
const OFF = (id: string, name: string) => ({ id, name, available: false });
const SUFFIX = '(unavailable)';

describe('withModels', () => {
  it('sets the options and the default from the models, and leaves the other fields alone', () => {
    const schema = withModels(base, [A, B], SUFFIX);
    expect(modelField(schema).options).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
    expect(modelField(schema).defaultValue).toBe('a');
    expect(schema.fields[0]).toBe(base.fields[0]);
  });

  it('shows a model that cannot be used disabled, with the suffix, and does not take it as the default', () => {
    const schema = withModels(base, [OFF('h3', 'H3'), A, B], SUFFIX);
    expect(modelField(schema).options).toEqual([
      { value: 'h3', label: `H3 ${SUFFIX}`, disabled: true },
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
    expect(modelField(schema).defaultValue).toBe('a');
  });

  it('has no default when nothing can be used, and writes the suffix it is given', () => {
    const schema = withModels(base, [OFF('h3', 'H3')], '(no disponible)');
    expect(modelField(schema).options).toEqual([{ value: 'h3', label: 'H3 (no disponible)', disabled: true }]);
    expect(modelField(schema).defaultValue).toBeUndefined();
  });

  it('does not change the schema it is given', () => {
    withModels(base, [A], SUFFIX);
    expect(modelField(base).options).toBeUndefined();
  });

  it('gives a field with no options before the list arrives, and the library draws it without failing', () => {
    const schema = withModels(base, [], SUFFIX);
    expect(modelField(schema).options).toEqual([]);
    expect(modelField(schema).defaultValue).toBeUndefined();

    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('schema', schema);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('mat-select')).toHaveLength(1);
  });
});

describe('defaultModelId', () => {
  it('is the first model that can be used, and none before the list arrives or when nothing can be used', () => {
    expect(defaultModelId([OFF('h3', 'H3'), A, B])).toBe('a');
    expect(defaultModelId([A, B])).toBe('a');
    expect(defaultModelId([])).toBeUndefined();
    expect(defaultModelId([OFF('h3', 'H3')])).toBeUndefined();
  });
});
