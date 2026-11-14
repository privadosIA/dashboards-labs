import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { throwError } from 'rxjs';

import { FAKE_BUILTIN, FAKE_ROUTER, FakeProviders, settle } from '../../testing';
import { ASSIST_OPTIONS } from '../options';
import { ASSIST_PROVIDERS, type ProviderInfo } from '../providers';
import { AssistantPicker } from './assistant-picker';

const builtin = FAKE_BUILTIN;
const router = FAKE_ROUTER;

async function create(options: { providers?: FakeProviders; allowAdd?: boolean; alwaysAdd?: boolean; value?: { provider: string; model: string }; lang?: 'es' | 'en' } = {}) {
  const providers = options.providers ?? new FakeProviders();
  TestBed.configureTestingModule({ providers: [{ provide: ASSIST_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, provideLabForms({ lang: options.lang ?? 'en' }), { provide: ASSIST_PROVIDERS, useValue: providers }] });
  const fixture = TestBed.createComponent(AssistantPicker);
  if (options.value) fixture.componentRef.setInput('value', options.value);
  fixture.componentRef.setInput('routingModels', ['qwen3:8b']);
  if (options.allowAdd !== undefined) fixture.componentRef.setInput('allowAdd', options.allowAdd);
  if (options.alwaysAdd !== undefined) fixture.componentRef.setInput('alwaysAdd', options.alwaysAdd);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  type Picker = { form: { (): Record<string, unknown>; set(v: Record<string, unknown>): void }; schema: () => { fields: { key?: string; type?: string; options?: { value: string; label: string }[] }[] } };
  const internals = () => fixture.componentInstance as unknown as Picker;
  /** The options a select of the form offers: the form library draws them as `mat-select`, so they are read from the schema it is given. */
  const select = (key: string) => ({ options: (internals().schema().fields.find((f) => f.key === key)?.options ?? []).map((o) => ({ textContent: o.label, value: o.value })) });
  /** Chooses a value as the form does: the model of the form changes. */
  const choose = async (key: string, value: string) => {
    internals().form.set({ ...internals().form(), [key]: value });
    await settle(fixture);
  };
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  const value = () => fixture.componentInstance.value();
  return { fixture, el, get, choose, click, select, providers, value };
}

describe('AssistantPicker', () => {
  it('lists how the server routes it and the providers, marking the external ones', async () => {
    const { select } = await create();
    const labels = select('provider').options.map((o) => o.textContent.trim());
    expect(labels).toEqual(['As the server routes it', 'Ollama', 'My router (external)', 'Lab box']);
  });

  it('keeps the routing as the default: nothing is sent and the models are the routing\'s', async () => {
    const { value, select } = await create();
    expect(value()).toEqual({ provider: '', model: '' });
    expect(select('model').options.map((o) => o.textContent.trim())).toContain('qwen3:8b');
  });

  it('uses the built-in Ollama and another Ollama on this network with no consent', async () => {
    const { choose, value, get, providers } = await create();
    await choose('provider', 'ollama');
    expect(value().provider).toBe('ollama');
    expect(get('consent')).toBeNull();
    await choose('provider', 'lab');
    expect(value().provider).toBe('lab');
    expect(providers.acknowledged).toEqual([]);
  });

  it('asks for the consent of a remote provider before using it, saying what leaves the machine and where to', async () => {
    const { choose, get, value, providers } = await create();
    await choose('provider', 'router');
    expect(get('consent')).not.toBeNull();
    expect(get('consent')!.textContent).toContain('My router');
    expect(get('consent')!.textContent).toContain('https://r.example/v1');
    expect(get('consent')!.textContent).toContain('leave this machine');
    expect(value().provider).toBe('');
    expect(providers.acknowledged).toEqual([]);
  });

  it('declining keeps the choice as it was and records nothing', async () => {
    const { choose, click, get, value, providers } = await create({ value: { provider: 'ollama', model: '' } });
    await choose('provider', 'router');
    await click('consent-decline');
    expect(get('consent')).toBeNull();
    expect(value().provider).toBe('ollama');
    expect(providers.acknowledged).toEqual([]);
  });

  it('accepting records the server\'s consent and uses the provider with its model', async () => {
    const { choose, click, get, value, providers } = await create();
    await choose('provider', 'router');
    await click('consent-accept');
    expect(providers.acknowledged).toEqual(['router']);
    expect(get('consent')).toBeNull();
    expect(value()).toEqual({ provider: 'router', model: 'gpt-x' });
  });

  it('does not ask again for a provider consented in this picker', async () => {
    const { choose, click, get, providers } = await create();
    await choose('provider', 'router');
    await click('consent-accept');
    await choose('provider', 'ollama');
    await choose('provider', 'router');
    expect(get('consent')).toBeNull();
    expect(providers.acknowledged).toEqual(['router']);
  });

  it('the model of a provider is chosen from its own models', async () => {
    const { choose, click, value } = await create();
    await choose('provider', 'router');
    await click('consent-accept');
    await choose('model', 'gpt-y');
    expect(value()).toEqual({ provider: 'router', model: 'gpt-y' });
  });

  describe('with no Ollama', () => {
    const none = () => new FakeProviders([builtin], false);

    it('says the assistant is missing and offers to add an external provider', async () => {
      const { get } = await create({ providers: none() });
      expect(get('no-ollama')).not.toBeNull();
      expect(get('add-provider')).not.toBeNull();
    });

    it('does not show what is missing in red until Add is pressed, and then says it and sends nothing', async () => {
      const { fixture, el, click, providers } = await create({ providers: none() });
      const errors = () => el.querySelectorAll('lab-add-provider .mat-mdc-form-field-error, lab-add-provider mat-error, lab-add-provider .df-error').length;
      expect(errors()).toBe(0);
      expect(el.querySelector<HTMLButtonElement>('[data-testid="add-submit"]')!.disabled).toBe(false);
      await click('add-submit');
      await settle(fixture);
      expect(providers.added).toEqual([]);
      expect(errors()).toBeGreaterThan(0);
    });

    it('adds it with the key sent once, asks for its consent, and uses it; the key is not in the value', async () => {
      const { fixture, el, get, click, providers, value } = await create({ providers: none() });
      const set = async (selector: string, text: string) => {
        const input = el.querySelector<HTMLInputElement>(selector)!;
        input.value = text;
        input.dispatchEvent(new Event('input'));
        await settle(fixture);
      };
      const inputs = [...el.querySelectorAll<HTMLInputElement>('lab-add-provider input[type="text"], lab-add-provider input[type="password"]')];
      expect(inputs.length).toBe(4);
      for (const [i, text] of ['Mine', 'https://x.example/v1', 'sk-secret', 'm'].entries()) {
        inputs[i].value = text;
        inputs[i].dispatchEvent(new Event('input'));
        await settle(fixture);
      }
      void set;
      await click('add-submit');
      expect(providers.added).toEqual([{ name: 'Mine', kind: 'openai', baseUrl: 'https://x.example/v1', key: 'sk-secret', model: 'm' }]);
      expect(get('consent')).not.toBeNull();
      await click('consent-accept');
      expect(providers.acknowledged).toEqual(['mine']);
      expect(value()).toEqual({ provider: 'mine', model: 'm' });
      expect(JSON.stringify(value())).not.toContain('sk-secret');
      // the form is gone once the provider is saved: the key it held is gone with it
      expect(get('add-provider')).toBeNull();
    });

    it('shows the server\'s refusal and keeps the form', async () => {
      const { fixture, el, get, click } = await create({ providers: new FakeProviders([builtin], false, () => throwError(() => new Error('a key is not sent over plain http'))) });
      const inputs = [...el.querySelectorAll<HTMLInputElement>('lab-add-provider input[type="text"], lab-add-provider input[type="password"]')];
      for (const [i, text] of ['Mine', 'http://x/v1', 'k', 'm'].entries()) {
        inputs[i].value = text;
        inputs[i].dispatchEvent(new Event('input'));
        await settle(fixture);
      }
      await click('add-submit');
      expect(get('add-problem')!.textContent).toContain('plain http');
      expect(get('add-provider')).not.toBeNull();
    });

    it('does not offer the form where it is not allowed', async () => {
      const { get } = await create({ providers: none(), allowAdd: false });
      expect(get('no-ollama')).not.toBeNull();
      expect(get('add-provider')).toBeNull();
    });
  });

  it('offers no form when Ollama answers, or when another provider is saved', async () => {
    expect((await create()).get('add-provider')).toBeNull();
    TestBed.resetTestingModule();
    expect((await create({ providers: new FakeProviders([builtin, router], false) })).get('add-provider')).toBeNull();
  });

  describe('with alwaysAdd and the built-in Ollama answering', () => {
    const fill = async (fixture: Awaited<ReturnType<typeof create>>['fixture'], el: HTMLElement, texts: string[]) => {
      const inputs = [...el.querySelectorAll<HTMLInputElement>('lab-add-provider input[type="text"], lab-add-provider input[type="password"]')];
      for (const [i, text] of texts.entries()) {
        inputs[i].value = text;
        inputs[i].dispatchEvent(new Event('input'));
        await settle(fixture);
      }
    };

    it('shows the Add provider button and no form until it is pressed', async () => {
      const { get } = await create({ alwaysAdd: true });
      expect(get('add-provider-open')).not.toBeNull();
      expect(get('add-provider')).toBeNull();
      expect(get('no-ollama')).toBeNull();
    });

    it('opens the form, adds an external provider, asks for its consent, uses it and closes the form', async () => {
      const { fixture, el, get, click, providers, value } = await create({ alwaysAdd: true });
      await click('add-provider-open');
      expect(get('add-provider')).not.toBeNull();
      await fill(fixture, el, ['Mine', 'https://x.example/v1', 'sk-secret', 'm']);
      await click('add-submit');
      expect(providers.added).toEqual([{ name: 'Mine', kind: 'openai', baseUrl: 'https://x.example/v1', key: 'sk-secret', model: 'm' }]);
      await click('consent-accept');
      expect(value()).toEqual({ provider: 'mine', model: 'm' });
      expect(get('add-provider')).toBeNull();
    });

    it('closes the form with the button again', async () => {
      const { get, click } = await create({ alwaysAdd: true });
      await click('add-provider-open');
      await click('add-provider-open');
      expect(get('add-provider')).toBeNull();
    });

    it('shows the server\'s refusal and keeps the form open', async () => {
      const { fixture, el, get, click } = await create({ alwaysAdd: true, providers: new FakeProviders([builtin], true, () => throwError(() => new Error('a key is not sent over plain http'))) });
      await click('add-provider-open');
      await fill(fixture, el, ['Mine', 'http://x/v1', 'k', 'm']);
      await click('add-submit');
      expect(get('add-problem')!.textContent).toContain('plain http');
      expect(get('add-provider')).not.toBeNull();
    });

    it('is not shown where adding is not allowed', async () => {
      expect((await create({ alwaysAdd: true, allowAdd: false })).get('add-provider-open')).toBeNull();
    });
  });

  it('offers no button when alwaysAdd is off and Ollama answers (the guided flow)', async () => {
    expect((await create()).get('add-provider-open')).toBeNull();
  });

  it('speaks Spanish when the host does', async () => {
    const { select } = await create({ lang: 'es' });
    expect(select('provider').options[0].textContent).toContain('Como lo enruta el servidor');
  });
});

describe('AssistantPicker with the host\'s own words', () => {
  it('shows the title, the hint and the consent sentence the host gives instead of the flow\'s', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ASSIST_OPTIONS, useValue: { lang: 'en' } }, provideLabForms({ lang: 'en' }), { provide: ASSIST_PROVIDERS, useValue: new FakeProviders() }] });
    const fixture = TestBed.createComponent(AssistantPicker);
    fixture.componentRef.setInput('title', 'The writer');
    fixture.componentRef.setInput('hint', 'My own hint.');
    fixture.componentRef.setInput('consentSentence', (name: string, address: string) => `${name} -> ${address}`);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h3')!.textContent).toBe('The writer');
    expect(el.querySelector('.hint')!.textContent).toBe('My own hint.');
    (fixture.componentInstance as unknown as { consent: { set: (p: ProviderInfo) => void } }).consent.set(router);
    await settle(fixture);
    expect(el.querySelector('[data-testid="consent"] p')!.textContent).toBe('My router -> https://r.example/v1');
  });
});
