import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RoutingResponse } from '../../core/api.models';
import { RoutingStore } from '../../core/routing.store';
import { ProviderBadgeComponent } from './provider-badge.component';

const local = { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' };
const remote = (name: string) => ({ provider: name.toLowerCase(), name, remote: true, consented: true, model: 'm' });

describe('ProviderBadgeComponent', () => {
  function setup(routing: Partial<RoutingResponse['routing']>, tasks: unknown) {
    TestBed.configureTestingModule({ imports: [ProviderBadgeComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(RoutingStore).set({ routing: { assistant: local, describe_image: local, describe_video: local, quality: local, motion_graphics: local, ...routing }, max_calls: 60 });
    const fixture = TestBed.createComponent(ProviderBadgeComponent);
    fixture.componentRef.setInput('tasks', tasks);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const badge = (el: HTMLElement) => el.querySelector('[data-testid="provider-badge"]');

  it('shows nothing for the built-in Ollama', () => {
    expect(badge(setup({}, 'assistant'))).toBeNull();
  });

  it('shows "external · name" when the task runs on a remote provider', () => {
    const b = badge(setup({ assistant: remote('OpenRouter') }, 'assistant'));
    expect(b?.textContent).toContain('externo');
    expect(b?.textContent).toContain('OpenRouter');
  });

  it('shows nothing for a provider on this machine, even if it is not the built-in one', () => {
    expect(badge(setup({ assistant: { ...local, provider: 'lan', name: 'LAN' } }, 'assistant'))).toBeNull();
  });

  it('names each remote provider of several tasks once', () => {
    const b = badge(setup({ describe_image: remote('Cloud'), describe_video: remote('Cloud') }, ['describe_image', 'describe_video']));
    expect(b?.textContent?.match(/Cloud/g)?.length).toBe(1);
  });

  it('names two different remote providers of several tasks', () => {
    const two = badge(setup({ describe_image: remote('Cloud'), describe_video: remote('Other') }, ['describe_image', 'describe_video']));
    expect(two?.textContent).toContain('Cloud');
    expect(two?.textContent).toContain('Other');
  });

  it('says nothing until the routing is known', () => {
    TestBed.configureTestingModule({ imports: [ProviderBadgeComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const f = TestBed.createComponent(ProviderBadgeComponent);
    f.componentRef.setInput('tasks', 'assistant');
    f.detectChanges();
    expect(badge(f.nativeElement)).toBeNull();
  });
});
