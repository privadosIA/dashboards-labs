import type { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ASSIST_PROVIDERS, provideAssistKit } from '@lab/assist-kit';
import { FAKE_BUILTIN, FakeProviders } from '@lab/assist-kit/testing';

import { AssistantField } from '../lib/shared/assistant-field/assistant-field';

/** What the assistant picker of the screens needs in a spec: its language and a providers port with only the built-in Ollama, answering. */
export const assistTestProviders = (lang: 'es' | 'en' = 'en') => [provideAssistKit({ lang }), { provide: ASSIST_PROVIDERS, useValue: new FakeProviders([FAKE_BUILTIN], true) }];

/** The assistant the person chooses in the field of a screen: what the picker would hand over. */
export function chooseAssistant(fixture: { debugElement: DebugElement }, value: { provider: string; model: string }): void {
  const field = fixture.debugElement.query(By.directive(AssistantField)).componentInstance as AssistantField;
  field.value.set(value);
}
