import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';

import { RoutingStore } from '../../core/routing.store';
import { fakeStorage } from '../../core/storage-fake';
import { AssistModelComponent } from './assist-model.component';
import { AssistModelStore } from './assist-model.store';

const LIST = {
  default: 'qwen3:8b',
  models: [
    { name: 'huihui_ai/qwen3-abliterated:8b', size_bytes: 5e9, fits: true },
    { name: 'gemma4:31b', size_bytes: 19e9, fits: false },
  ],
};

describe('AssistModelComponent', () => {
  function mount() {
    TestBed.configureTestingModule({ imports: [AssistModelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AssistModelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { http, fixture, el, store: TestBed.inject(AssistModelStore) };
  }
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('asks for nothing until the selector is opened', () => {
    const { http, el } = mount();
    expect(el.querySelector('[data-testid=assist-model-select]')).not.toBeNull();
    http.verify(); // no request yet
  });

  it('with the assistant routed to another provider it shows that provider\'s model, not the Ollama selector', () => {
    TestBed.configureTestingModule({ imports: [AssistModelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const local = { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' };
    TestBed.inject(RoutingStore).set({
      routing: { assistant: { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-mini' }, describe_image: local, describe_video: local, quality: local, motion_graphics: local },
      max_calls: 60,
    });
    const fixture = TestBed.createComponent(AssistModelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=assist-model-select]')).toBeNull();
    expect(el.querySelector('[data-testid=assist-model-declared]')?.textContent).toContain('gpt-mini');
    expect(el.textContent).toContain('Cloud');
  });

  it('opening it reads the models and lists them with their size, the default first', async () => {
    const { http, fixture } = mount();
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await select.open();
    http.expectOne('/api/assist/models').flush(LIST);
    await fixture.whenStable();
    fixture.detectChanges();
    const options = await select.getOptions();
    const texts = await Promise.all(options.map((o) => o.getText()));
    expect(texts[0]).toContain('Por defecto');
    expect(texts[0]).toContain('(qwen3:8b)');
    expect(texts[1]).toContain('huihui_ai/qwen3-abliterated:8b');
    expect(texts[1]).toContain('5.0 GB');
    expect(texts[2]).toContain('gemma4:31b');
    expect(texts[2]).toContain('no cabe en la memoria libre');
  });

  it('shows the warning of a chosen model that does not fit', async () => {
    const { fixture, el, store } = mount();
    store.models.set(LIST.models);
    store.loaded.set(true);
    store.choose('gemma4:31b');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=assist-model-warning]')?.textContent).toContain('no cabe');
    store.choose('huihui_ai/qwen3-abliterated:8b');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=assist-model-warning]')).toBeNull();
  });

  it('shows the remembered choice before the list has been read', async () => {
    localStorage.setItem('mo.assistModel', 'huihui_ai/qwen3-abliterated:8b');
    const { fixture, el } = mount();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('huihui_ai/qwen3-abliterated:8b');
  });
});
