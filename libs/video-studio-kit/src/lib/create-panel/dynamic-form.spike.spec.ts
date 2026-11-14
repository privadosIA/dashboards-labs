import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

// The three things the creation panel relies on and the library does not document: an object in a `hidden` field,
// a model replaced from outside, and a `pattern` on a number field. The prompt has no static `required`: the library
// combines it with `requiredWhen`, so a static one would ask for the prompt even with an image.
const schema: DfFormSchema = {
  version: '1.0',
  id: 'spike',
  fields: [
    {
      key: 'prompt',
      type: 'textarea',
      label: 'Prompt',
      validation: { messages: { required: 'Write a prompt or choose a start image.' } },
      logic: { requiredWhen: { field: 'startImage', operator: 'empty' } },
    },
    { key: 'duration', type: 'number', label: 'Duration', defaultValue: 5, validation: { required: true, min: 4, max: 30, pattern: '^[0-9]+$' } },
    { key: 'startImage', type: 'hidden' },
  ],
};

@Component({
  selector: 'lab-host',
  imports: [DynamicFormComponent],
  template: `<dynamic-form [schema]="schema" [(model)]="model" showErrors="always" (statusChange)="status.set($event)" />`,
})
class HostComponent {
  readonly schema = schema;
  readonly model = signal<Record<string, unknown>>({});
  readonly status = signal('');
}

async function draw(model: Record<string, unknown> = {}): Promise<ComponentFixture<HostComponent>> {
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.model.set(model);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function type(fixture: ComponentFixture<HostComponent>, selector: string, value: string): Promise<void> {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('what the library does for the creation panel', () => {
  it('asks for the prompt while there is no image', async () => {
    const fixture = await draw();
    expect(fixture.componentInstance.status()).toBe('INVALID');
  });

  it('does not ask for the prompt when an object sits in the hidden field', async () => {
    const fixture = await draw({ startImage: { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' } });
    expect(fixture.componentInstance.status()).toBe('VALID');
    expect(fixture.componentInstance.model()['startImage']).toEqual({ name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' });
  });

  it('asks for the prompt again when the image is taken out of the model', async () => {
    const fixture = await draw({ startImage: { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' } });
    fixture.componentInstance.model.set({ duration: 5 });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('INVALID');
  });

  it('refreshes the controls when the model is replaced', async () => {
    const fixture = await draw({ prompt: 'one', duration: 5 });
    fixture.componentInstance.model.set({ prompt: 'two', duration: 12 });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('two');
    expect(el.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('12');
  });

  it('refuses 4.5, 3 and 31 on the duration and accepts 20', async () => {
    const fixture = await draw({ prompt: 'a cat', duration: 5 });
    expect(fixture.componentInstance.status()).toBe('VALID');
    for (const [value, status] of [['4.5', 'INVALID'], ['3', 'INVALID'], ['31', 'INVALID'], ['20', 'VALID']]) {
      await type(fixture, 'input[type="number"]', value);
      expect(fixture.componentInstance.status(), value).toBe(status);
    }
  });
});
