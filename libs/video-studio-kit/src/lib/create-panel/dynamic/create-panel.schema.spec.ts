import { TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { DEMO_MODELS } from '../../video/in-memory.adapter';
import { DEFAULT_SETTINGS } from '../../video/model';
import { withModels } from '../../shared/with-models';
import en from './create-panel.en.json';
import es from './create-panel.es.json';

interface Field {
  key?: string;
  defaultValue?: unknown;
  options?: { value: string }[];
  validation?: { min?: number; max?: number };
}

const schemas: [string, DfFormSchema][] = [
  ['es', es as DfFormSchema],
  ['en', en as DfFormSchema],
];

// The rules of a setting live in the port and in the schema: this keeps the two equal.
describe.each(schemas)('the %s schema of the creation panel', (_lang, schema) => {
  const field = (key: string): Field => (schema.fields as Field[]).find((f) => f.key === key)!;

  // The settings rows (model, duration, aspect ratio, quality) are drawn by the panel, which owns their options and the
  // rules; the schema keeps them as hidden fields that hold the value and say where the row goes.
  it.each([
    ['aspectRatio', DEFAULT_SETTINGS.aspectRatio],
    ['quality', DEFAULT_SETTINGS.quality],
    ['duration', DEFAULT_SETTINGS.duration],
  ])('holds %s as a hidden field that starts at the default of the port', (key, value) => {
    expect((field(key) as Field & { type: string }).type).toBe('hidden');
    expect(field(key).defaultValue).toBe(value);
  });

  it.each(['modelRow', 'durationRow', 'aspectRow', 'qualityRow'])('has a slot for the %s', (name) => {
    expect((schema.fields as { type?: string; name?: string }[]).some((f) => f.type === 'slot' && f.name === name)).toBe(true);
  });

  it('starts with the audio of the port', () => {
    expect(field('audio').defaultValue).toBe(DEFAULT_SETTINGS.audio);
  });

  it('holds the model as a hidden field with no options of its own: the port gives them', () => {
    const model = field('model') as Field & { type: string; options?: unknown };
    expect(model.type).toBe('hidden');
    expect(model.options).toBeUndefined();
  });

  it('is accepted by the library, with the models of the port, and draws', () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('schema', withModels(schema, DEMO_MODELS, '(unavailable)'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('textarea')).not.toBeNull();
  });
});
