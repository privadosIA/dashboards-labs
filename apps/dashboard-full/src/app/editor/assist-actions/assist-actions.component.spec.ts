import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { AssistActionsComponent } from './assist-actions.component';

describe('AssistActionsComponent: availability', () => {
  function mount(field: 'prompt' | 'motion_prompt', data: ReturnType<typeof missing> | null) {
    TestBed.configureTestingModule({ imports: [AssistActionsComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    if (data) TestBed.inject(AvailabilityStore).data.set(data);
    const f = TestBed.createComponent(AssistActionsComponent);
    f.componentRef.setInput('field', field);
    f.componentRef.setInput('sceneId', 's1');
    f.componentRef.setInput('text', 'una mujer lee');
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }
  const ask = (el: HTMLElement) => el.querySelector('[data-testid="assist-ask"]');
  const notice = (el: HTMLElement) => el.querySelector('[data-testid="model-notice"]');

  it('shows its button when the assistant can run', () => {
    const el = mount('prompt', ALL_AVAILABLE as never);
    expect(ask(el)).not.toBeNull();
    expect(notice(el)).toBeNull();
  });

  it('hides the button and says what is missing when the provider answers but has no chat model', () => {
    const el = mount('prompt', missing('assistant', 'no_models'));
    expect(ask(el)).toBeNull();
    expect(notice(el)?.textContent).toContain('ollama pull qwen3:8b');
  });

  it('says it once: the motion prompt\'s instance hides without repeating the notice', () => {
    const el = mount('motion_prompt', missing('assistant', 'no_models'));
    expect(ask(el)).toBeNull();
    expect(notice(el)).toBeNull();
  });

  it('hides everything, with no notice, when nothing answers', () => {
    const el = mount('prompt', missing('assistant', 'unreachable'));
    expect(ask(el)).toBeNull();
    expect(notice(el)).toBeNull();
  });

  it('is hidden while the availability is unknown', () => {
    const el = mount('prompt', null);
    expect(ask(el)).toBeNull();
    expect(notice(el)).toBeNull();
  });
});
