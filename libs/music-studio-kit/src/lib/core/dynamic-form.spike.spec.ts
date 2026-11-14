import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DfFormSchema, DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

// What the song form relies on and the library does not spell out in one place: a text area with a limit, a checkbox, a
// select, and a slot (where the lyrics tools, the style box and the character counters go). The Material theme of
// @lab/forms-kit stops typing at `maxLength` but draws no counter: the counter is a slot.
const schema: DfFormSchema = {
  version: '1.0',
  id: 'spike',
  fields: [
    {
      key: 'title',
      type: 'textarea',
      label: 'Title',
      props: { rows: 2 },
      validation: { required: true, maxLength: 80, messages: { required: 'Write a title.' } },
    },
    { type: 'slot', name: 'lyricsTools' },
    { key: 'instrumental', type: 'checkbox', label: 'Instrumental' },
    {
      key: 'gender',
      type: 'select',
      label: 'Vocal gender',
      defaultValue: 'random',
      options: [{ value: 'random', label: 'Random' }, { value: 'female', label: 'Female' }],
    },
  ],
};

@Component({
  selector: 'lab-host',
  imports: [DynamicFormComponent, DfSlotDirective],
  template: `<dynamic-form [schema]="schema" [(model)]="model" [showDefaultActions]="false" showErrors="always" (statusChange)="status.set($event)">
    <ng-template dfSlot="lyricsTools"><button type="button" class="tool">Structure tags</button><span class="count">{{ length() }}/80</span></ng-template>
  </dynamic-form>`,
})
class HostComponent {
  readonly schema = schema;
  readonly model = signal<Record<string, unknown>>({});
  readonly status = signal('');
  readonly length = () => String(this.model()['title'] ?? '').length;
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

describe('what the library does for the song form', () => {
  it('asks for the title, shows a counter and a slot, a checkbox and a select', async () => {
    const fixture = await draw();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.status()).toBe('INVALID');
    expect(el.querySelector('textarea')).toBeTruthy();
    expect(el.querySelector('textarea')!.getAttribute('maxlength')).toBe('80');
    expect(el.querySelector('.count')!.textContent).toBe('0/80');
    expect(el.querySelector('.tool')).toBeTruthy();
    expect(el.querySelector('input[type=checkbox], [role=checkbox]')).toBeTruthy();
    expect(el.querySelector('select, mat-select, [role=combobox]')).toBeTruthy();
  });

  it('a counter in the slot follows the model, and the form is valid with a title', async () => {
    const fixture = await draw({ title: 'Canción de año' });
    expect((fixture.nativeElement as HTMLElement).querySelector('.count')!.textContent).toBe('14/80');
    expect(fixture.componentInstance.status()).toBe('VALID');
  });
});
