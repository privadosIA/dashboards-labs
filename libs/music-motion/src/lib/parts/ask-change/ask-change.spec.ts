import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, type DraftInput } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { draft } from '../parts.page.spec';
import { AskChange } from './ask-change';
import { assistTestProviders, chooseAssistant } from '../../../testing/assist';

@Component({ imports: [AskChange], template: '<app-ask-change [manifest]="manifest()" [fragment]="fragment()" />' })
class Host {
  manifest = signal('{"name":"bars"}');
  fragment = signal('<div></div>');
}

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
const type = async (fixture: ComponentFixture<unknown>, el: HTMLElement, value: string) => {
  const box = el.querySelector('textarea')!;
  box.value = value;
  box.dispatchEvent(new Event('input'));
  await settle(fixture);
};

async function create(overrides: Partial<AnimationPort> = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const askDraft = vi.fn((input: DraftInput) => of(draft('changed', { state: 'writing', request: input.request })));
  const port = { askDraft, ...overrides } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ ...assistTestProviders(),{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: port }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Host);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, askDraft, navigate };
}

describe('AskChange', () => {
  it('does not ask with no instruction', async () => {
    const { fixture, el, askDraft } = await create();
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(askDraft).not.toHaveBeenCalled();
  });

  it('asks with the instruction and the text that is in the editor now, and opens the new draft', async () => {
    const { fixture, el, host, askDraft, navigate } = await create();
    host.fragment.set('<p>unsaved</p>');
    await type(fixture, el, 'make the bars blue');
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(askDraft).toHaveBeenCalledWith({ request: 'make the bars blue', base: { manifest: '{"name":"bars"}', fragment: '<p>unsaved</p>' } });
    expect(navigate).toHaveBeenCalledWith(['/parts/changed']);
  });

  it('asks with the assistant chosen, the model or an external provider; without a choice it sends none', async () => {
    const { fixture, el, askDraft } = await create();
    expect(get(el, 'assistant-field')).not.toBeNull();
    await type(fixture, el, 'make it blue');
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(askDraft.mock.calls[0][0]).not.toHaveProperty('model');
    expect(askDraft.mock.calls[0][0]).not.toHaveProperty('provider');
    chooseAssistant(fixture, { provider: 'router', model: 'gpt-x' });
    await settle(fixture);
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(askDraft.mock.calls[1][0]).toMatchObject({ request: 'make it blue', provider: 'router', model: 'gpt-x' });
  });

  it('does not let an instruction of more than 500 characters through', async () => {
    const { fixture, el, askDraft } = await create();
    await type(fixture, el, 'a'.repeat(501));
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(askDraft).not.toHaveBeenCalled();
  });

  it('shows what the server refuses in its own words, keeps the instruction and opens nothing', async () => {
    const { fixture, el, navigate } = await create({ askDraft: () => throwError(() => new AnimationFailure('busy', 'a run is active and the model is local')) });
    await type(fixture, el, 'make it blue');
    (get(el, 'ask-change-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'ask-change-refused')!.textContent).toContain('a run is active');
    expect(el.querySelector('textarea')!.value).toBe('make it blue');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is in Spanish when the host is', async () => {
    const { el } = await create({}, 'es');
    expect(el.querySelector('h2')!.textContent).toContain('Pedir un cambio');
  });
});
