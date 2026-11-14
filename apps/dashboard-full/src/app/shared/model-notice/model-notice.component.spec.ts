import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RoutingTask } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { ModelNoticeComponent } from './model-notice.component';

describe('ModelNoticeComponent', () => {
  function mount(task: RoutingTask, data: ReturnType<typeof missing> | null) {
    TestBed.configureTestingModule({ imports: [ModelNoticeComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    if (data) TestBed.inject(AvailabilityStore).data.set(data);
    const f = TestBed.createComponent(ModelNoticeComponent);
    f.componentRef.setInput('task', task);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }
  const notice = (el: HTMLElement) => el.querySelector('[data-testid="model-notice"]');

  it('says a text model is missing in an Ollama, with the command to install one and a link to Settings', () => {
    const el = mount('assistant', missing('assistant', 'no_models'));
    expect(notice(el)?.textContent).toContain('Ollama');
    expect(el.querySelector('[data-testid="model-notice-command"]')?.textContent).toContain('ollama pull qwen3:8b');
    expect(el.querySelector('[data-testid="model-notice-link"]')?.getAttribute('href')).toBe('/settings');
  });

  it('says a model that reads pictures is missing, with its command', () => {
    const el = mount('describe_image', missing('describe_image', 'no_vision_model'));
    expect(notice(el)?.textContent).toContain('imágenes');
    expect(el.querySelector('[data-testid="model-notice-command"]')?.textContent).toContain('ollama pull gemma4:26b');
  });

  it('for another provider it points to Settings and gives no Ollama command', () => {
    const el = mount('describe_image', missing('describe_image', 'no_model', 'openai', 'OpenRouter'));
    expect(notice(el)?.textContent).toContain('OpenRouter');
    expect(notice(el)?.textContent).toContain('modelo de visión');
    expect(el.querySelector('[data-testid="model-notice-command"]')).toBeNull();
    expect(el.querySelector('[data-testid="model-notice-link"]')).not.toBeNull();
  });

  it('shows nothing when the task can run, when nothing answers, and while the availability is unknown', () => {
    expect(notice(mount('assistant', ALL_AVAILABLE as never))).toBeNull();
  });
});

describe('ModelNoticeComponent: nothing to say', () => {
  it('stays silent for an unreachable provider', () => {
    TestBed.configureTestingModule({ imports: [ModelNoticeComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    TestBed.inject(AvailabilityStore).data.set(missing('assistant', 'unreachable'));
    const f = TestBed.createComponent(ModelNoticeComponent);
    f.componentRef.setInput('task', 'assistant');
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="model-notice"]')).toBeNull();
  });

  it('stays silent while the availability is unknown', () => {
    TestBed.configureTestingModule({ imports: [ModelNoticeComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const f = TestBed.createComponent(ModelNoticeComponent);
    f.componentRef.setInput('task', 'describe_image');
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="model-notice"]')).toBeNull();
  });
});
