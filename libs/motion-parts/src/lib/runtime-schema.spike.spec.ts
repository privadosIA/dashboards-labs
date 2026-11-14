import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

// Spike: the parameters of a part are known only when the catalog arrives, so their form is a schema made in code, not a
// JSON file. What this checks about the library: it draws a schema object made at run time with a field of each type of
// parameter, enforces `min`, `max` and `maxLength` from it, and draws again when the schema is replaced (another part).
const toppings = (count: number): DfFormSchema => ({
  version: '1.0',
  id: 'part-params',
  fields: [
    { key: 'label', type: 'text', label: 'Label', defaultValue: 'allow', validation: { maxLength: 5 } },
    { key: 'count', type: 'number', label: 'Count', defaultValue: 3, validation: { min: 1, max: count, pattern: '^[0-9]+$' } },
    { key: 'speed', type: 'number', label: 'Speed', defaultValue: 1.5, validation: { min: 0.5, max: 4 } },
    { key: 'on', type: 'checkbox', label: 'On', defaultValue: true },
    { key: 'align', type: 'select', label: 'Align', defaultValue: 'left', options: [{ value: 'left', label: 'left' }, { value: 'center', label: 'center' }] },
  ],
});

@Component({
  selector: 'lab-host',
  imports: [DynamicFormComponent],
  template: `<dynamic-form [schema]="schema()" [(model)]="model" showErrors="always" (statusChange)="status.set($event)" />`,
})
class HostComponent {
  readonly schema = signal(toppings(6));
  readonly model = signal<Record<string, unknown>>({});
  readonly status = signal('');
}

async function settle(fixture: ComponentFixture<HostComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function draw(): Promise<ComponentFixture<HostComponent>> {
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
  const fixture = TestBed.createComponent(HostComponent);
  await settle(fixture);
  return fixture;
}

describe('a form schema made at run time', () => {
  it('draws a field for each type of parameter and starts with their defaults', async () => {
    const fixture = await draw();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelectorAll('input[type="text"], input[type="number"], input[type="checkbox"], mat-checkbox, mat-select, select').length).toBeGreaterThanOrEqual(5);
    expect(fixture.componentInstance.model()).toMatchObject({ label: 'allow', count: 3, speed: 1.5, on: true, align: 'left' });
    expect(fixture.componentInstance.status()).toBe('VALID');
  });

  it('refuses a value outside the limits the catalog gave', async () => {
    const fixture = await draw();
    fixture.componentInstance.model.set({ ...fixture.componentInstance.model(), count: 9 });
    await settle(fixture);
    expect(fixture.componentInstance.status()).toBe('INVALID');
    fixture.componentInstance.model.set({ ...fixture.componentInstance.model(), count: 2, label: 'toolong' });
    await settle(fixture);
    expect(fixture.componentInstance.status()).toBe('INVALID');
    fixture.componentInstance.model.set({ ...fixture.componentInstance.model(), label: 'ok' });
    await settle(fixture);
    expect(fixture.componentInstance.status()).toBe('VALID');
  });

  it('takes the limits of a replaced schema', async () => {
    const fixture = await draw();
    fixture.componentInstance.model.set({ ...fixture.componentInstance.model(), count: 5 });
    await settle(fixture);
    expect(fixture.componentInstance.status()).toBe('VALID');
    fixture.componentInstance.schema.set(toppings(4));
    await settle(fixture);
    expect(fixture.componentInstance.status()).toBe('INVALID');
  });
});
