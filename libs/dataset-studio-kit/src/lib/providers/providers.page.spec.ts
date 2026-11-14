import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ANIMATION } from '@lab/animation-core';
import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { FAKE_BUILTIN, FAKE_ROUTER, FakeProviders } from '@lab/assist-kit/testing';
import { DATASET_PORT, InMemoryDataset } from '@lab/dataset-import';
import { provideLabForms } from '@lab/forms-kit';
import { of } from 'rxjs';

import { AssistantChoice } from '../core/assistant-choice';
import { provideDatasetStudio } from '../provide-dataset-studio';
import { ProvidersPage } from './providers.page';

const animation = {
  catalog: () => of({ parts: [], fonts: [], styles: [], levels: [], frameRates: [], features: [] }),
  assistModels: () => of({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 1, fits: true }] }),
} as never;

async function create(lang: 'es' | 'en' = 'en') {
  TestBed.resetTestingModule();
  const providers = new FakeProviders([FAKE_BUILTIN, FAKE_ROUTER], true);
  TestBed.configureTestingModule({
    providers: [provideLabForms({ lang }), provideRouter([]), { provide: ANIMATION, useValue: animation }, { provide: DATASET_PORT, useValue: new InMemoryDataset() }, provideDatasetStudio({ lang, memory: true }), { provide: ASSIST_PROVIDERS, useValue: providers }],
  });
  const fixture = TestBed.createComponent(ProvidersPage);
  for (let i = 0; i < 5; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 6));
  }
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ProvidersPage', () => {
  it('has the picker with Add provider always there, even with the built-in Ollama answering', async () => {
    const { el } = await create();
    expect(el.querySelector('[data-testid="assistant-picker"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="add-provider-open"]')).not.toBeNull();
  });

  it('what is chosen in it is the studio\'s assistant', async () => {
    const { fixture } = await create();
    TestBed.inject(AssistantChoice).value.set({ provider: 'router', model: 'gpt-x' });
    fixture.detectChanges();
    expect(TestBed.inject(AssistantChoice).value()).toEqual({ provider: 'router', model: 'gpt-x' });
  });

  it('speaks Spanish when the host does', async () => {
    const { el } = await create('es');
    expect(el.querySelector('h1')!.textContent).toContain('Proveedores del asistente');
  });
});
