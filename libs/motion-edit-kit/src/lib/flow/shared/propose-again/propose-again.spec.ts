import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FakeProviders, settle } from '../../flow.testing';
import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { ProposeAgain } from './propose-again';

async function create(inputs: { prompt?: string; provider?: string; model?: string } = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }, provideLabForms({ lang: 'en' }), { provide: ASSIST_PROVIDERS, useValue: new FakeProviders() }] });
  const fixture = TestBed.createComponent(ProposeAgain);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  const out: { prompt: string; model: string; provider: string }[] = [];
  fixture.componentInstance.submitted.subscribe((e) => out.push(e));
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, out, click: async (id: string) => (el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(), settle(fixture)) };
}

describe('ProposeAgain', () => {
  it('offers the provider and model again, starting from what the proposal was asked with', async () => {
    const { fixture, click, out } = await create({ prompt: 'warmer', provider: 'ollama', model: 'qwen3:8b' });
    await click('again-submit');
    expect(out).toEqual([{ prompt: 'warmer', provider: 'ollama', model: 'qwen3:8b' }]);
    void fixture;
  });

  it('hands over another provider and model chosen in the picker', async () => {
    const { fixture, click, out } = await create({ prompt: 'warmer' });
    (fixture.componentInstance as unknown as { assistant: { set(v: { provider: string; model: string }): void } }).assistant.set({ provider: 'lab', model: 'qwen3:8b' });
    await settle(fixture);
    await click('again-submit');
    expect(out).toEqual([{ prompt: 'warmer', provider: 'lab', model: 'qwen3:8b' }]);
  });

  it('is not offered the form to add a provider', async () => {
    const { el } = await create({ prompt: 'x' });
    expect(el.querySelector('lab-add-provider')).toBeNull();
  });
});
