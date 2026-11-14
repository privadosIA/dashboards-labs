import { Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DfFormSchema, DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { provideLabForms } from '@lab/forms-kit';

import { DEMO_MODELS } from '../video/in-memory.adapter';
import type { VideoModel } from '../video/model';

// What the creation panel needs from the library for the model selector: a `select` whose options and default are set
// from code (they come from the port), a slot after it that shows the description of the selected model, and a schema
// that is replaced (the list arrives or changes) without losing what was typed.
const base: DfFormSchema = {
  version: '1.0',
  id: 'spike',
  fields: [
    { key: 'prompt', type: 'textarea', label: 'Prompt' },
    { key: 'model', type: 'select', label: 'Model' },
    { type: 'slot', name: 'modelHint' },
  ],
};

const withModels = (schema: DfFormSchema, models: readonly VideoModel[]): DfFormSchema => ({
  ...schema,
  fields: schema.fields.map((f) => ('key' in f && f.key === 'model' ? { ...f, defaultValue: models[0].id, options: models.map((m) => ({ value: m.id, label: m.name })) } : f)),
});

@Component({
  selector: 'lab-host',
  imports: [DynamicFormComponent, DfSlotDirective],
  template: `
    <dynamic-form [schema]="schema()" [(model)]="model" [showDefaultActions]="false">
      <ng-template dfSlot="modelHint"><p class="hint">{{ description() }}</p></ng-template>
    </dynamic-form>
  `,
})
class HostComponent {
  readonly models = signal<readonly VideoModel[]>(DEMO_MODELS);
  readonly schema = computed(() => withModels(base, this.models()));
  readonly model = signal<Record<string, unknown>>({});
  readonly description = computed(() => this.models().find((m) => m.id === this.model()['model'])?.description ?? '');
}

async function draw(): Promise<ComponentFixture<HostComponent>> {
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
  const fixture = TestBed.createComponent(HostComponent);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<HostComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('the model selector the creation panel needs from the library', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('selects the first model by default, shows its name and its description in the slot', async () => {
    const fixture = await draw();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.model()['model']).toBe(DEMO_MODELS[0].id);
    expect(el.querySelector('mat-select')?.textContent).toContain(DEMO_MODELS[0].name);
    expect(el.querySelector('.hint')?.textContent).toContain(DEMO_MODELS[0].description);
  });

  it('offers every model and follows the one chosen', async () => {
    const fixture = await draw();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    await settle(fixture);
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(DEMO_MODELS.map((m) => m.name));

    options[1].click();
    await settle(fixture);
    expect(fixture.componentInstance.model()['model']).toBe(DEMO_MODELS[1].id);
    expect(el.querySelector('.hint')?.textContent).toContain(DEMO_MODELS[1].description);
  });

  it('keeps what was typed and the choice when the list of models is replaced', async () => {
    const fixture = await draw();
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.model.set({ prompt: 'a fox', model: DEMO_MODELS[2].id });
    await settle(fixture);

    fixture.componentInstance.models.set([...DEMO_MODELS, { id: 'extra', name: 'Extra', description: 'one more', available: true }]);
    await settle(fixture);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('a fox');
    expect(fixture.componentInstance.model()['model']).toBe(DEMO_MODELS[2].id);
    expect(el.querySelector('.hint')?.textContent).toContain(DEMO_MODELS[2].description);
  });

  it('gets the default when the models arrive after the first render', async () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.models.set([{ id: 'only', name: 'Only', description: 'the one', available: true }]);
    await settle(fixture);
    expect(fixture.componentInstance.model()['model']).toBe('only');
    expect((fixture.nativeElement as HTMLElement).querySelector('.hint')?.textContent).toContain('the one');
  });
});
