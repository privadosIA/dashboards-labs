import { TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { DEMO_TOOLS } from '../../video-edit/in-memory.adapter';
import type { ToolId } from '../../video-edit/model';
import { settingsSchema } from './schemas';

interface Field {
  key?: string;
  type?: string;
  defaultValue?: unknown;
  options?: { value: unknown }[];
}

const WITH_FORM: ToolId[] = ['scale', 'interpolate', 'reframe', 'remove-background', 'extend', 'motion-control'];

// The options of a choice are part of the shape of the form: this keeps them equal to what the tools accept.
describe.each(['es', 'en'] as const)('the %s settings schemas of the video tools', (lang) => {
  it.each(WITH_FORM)('%s asks for exactly the settings of the tool, with the choices the tool accepts', (id) => {
    const schema = settingsSchema(id, lang) as DfFormSchema;
    const fields = schema.fields as Field[];
    const info = DEMO_TOOLS.find((t) => t.id === id)!;
    // `motion` is not a setting: it carries the chosen library motion into the form, so `start` can wait for one
    expect(fields.map((f) => f.key).filter((k) => k !== 'motion')).toEqual(info.settings.map((s) => s.name));
    for (const spec of info.settings) {
      const field = fields.find((f) => f.key === spec.name)!;
      if (spec.kind === 'choice') expect(field.options?.map((o) => o.value)).toEqual(spec.values);
      expect(field.defaultValue).toBe(spec.default);
    }
  });

  it('has none for a tool with no settings', () => {
    expect(settingsSchema('depth', lang)).toBeNull();
  });

  it.each(WITH_FORM)('%s is accepted by the library and draws one select per choice setting', (id) => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang })] });
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('schema', settingsSchema(id, lang));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('mat-select')).toHaveLength(DEMO_TOOLS.find((t) => t.id === id)!.settings.filter((x) => x.kind === 'choice').length);
  });
});
