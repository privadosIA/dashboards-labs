import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CATALOG } from '@lab/animation-core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION } from '@lab/music-motion';
import { AssistFailed, SONGS } from '@lab/music-studio-kit';
import { AnimationFailure } from '@lab/animation-core';
import { NEVER, of, throwError } from 'rxjs';

import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { FakeProviders } from '../flow.testing';
import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { PlanCard, type PlanStart } from './plan-card';

const settle = async (fixture: ComponentFixture<unknown>) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

async function create(options: { write?: () => unknown; models?: () => unknown; lang?: 'es' | 'en'; plan?: () => unknown } = {}) {
  const spent = { generate: vi.fn(), create: vi.fn(), propose: vi.fn(), askDraft: vi.fn(), render: vi.fn() };
  const songs = { write: vi.fn(options.write ?? (() => of({ title: 'Night Drive', lyrics: '[verse]\nla', style: 'synthwave' }))), generate: spent.generate };
  const animation = {
    catalog: () => of(options.plan ? { ...CATALOG, features: [...CATALOG.features, 'plan'] } : CATALOG),
    plan: vi.fn(options.plan ?? (() => throwError(() => new Error('not here')))),
    assistModels: options.models ?? (() => of({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 1, fits: true }] })),
    create: spent.create,
    propose: spent.propose,
    askDraft: spent.askDraft,
    render: spent.render,
  };
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, provideLabForms({ lang: options.lang ?? 'en' }), { provide: ANIMATION, useValue: animation }, { provide: SONGS, useValue: songs }, { provide: ASSIST_PROVIDERS, useValue: new FakeProviders() }] });
  const fixture = TestBed.createComponent(PlanCard);
  const started: PlanStart[] = [];
  fixture.componentInstance.started.subscribe((s) => started.push(s));
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const type = async (text: string) => {
    const box = get('sentence') as HTMLTextAreaElement;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  const choose = async (provider: string, modelName = '') => {
    (fixture.componentInstance as unknown as { assistant: { set(v: { provider: string; model: string }): void } }).assistant.set({ provider, model: modelName });
    await settle(fixture);
  };
  return { fixture, el, get, type, click, choose, started, songs, spent, animation };
}

describe('PlanCard', () => {
  it('shows the plan card after the sentence is made into a plan, and spends nothing: no song, piece, proposal, draft or render is asked for', async () => {
    const { get, type, click, songs, spent } = await create();
    expect(get('plan-form')).toBeNull();
    expect((get('make-plan') as HTMLButtonElement).disabled).toBe(true);
    await type('a neon synthwave track about driving at night');
    await click('make-plan');
    expect(get('plan-form')).not.toBeNull();
    expect(songs.write).toHaveBeenCalledTimes(1);
    for (const call of Object.values(spent)) expect(call).not.toHaveBeenCalled();
  });

  it('fills the song fields from the writing and every field can be edited', async () => {
    const { el, get, type, click } = await create();
    await type('night drive');
    await click('make-plan');
    const inputs = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('dynamic-form input[type="text"], dynamic-form textarea')];
    expect(inputs.some((i) => i.value === 'Night Drive')).toBe(true);
    expect(inputs.some((i) => i.value === 'synthwave')).toBe(true);
    expect(inputs.every((i) => !i.disabled)).toBe(true);
    expect(get('start')).not.toBeNull();
  });

  it('keeps the fields editable and Start available when the writing fails, and says why', async () => {
    const { get, el, type, click, started } = await create({ write: () => throwError(() => new AssistFailed('unavailable', 'no ollama')) });
    await type('night drive');
    await click('make-plan');
    expect(get('write-failed')!.textContent).toContain('unavailable: no ollama');
    const inputs = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('dynamic-form input[type="text"], dynamic-form textarea')];
    expect(inputs.every((i) => !i.disabled)).toBe(true);
    expect((get('start') as HTMLButtonElement).disabled).toBe(false);
    await click('start');
    expect(started).toHaveLength(1);
    expect(started[0].plan.song.lyrics).toBe('');
  });

  it('says the assistant is not available when the server lists no models, and still lets the flow start', async () => {
    const { get, type, click, started } = await create({ models: () => of({ default: '', models: [] }) });
    await type('night drive');
    await click('make-plan');
    expect(get('no-models')!.textContent).toContain('assistant is not available');
    await click('start');
    expect(started).toHaveLength(1);
  });

  it('says so when the models cannot be read at all', async () => {
    const { get, type, click } = await create({ models: () => throwError(() => new Error('down')) });
    await type('night drive');
    await click('make-plan');
    expect(get('no-models')).not.toBeNull();
  });

  it('hands over the sentence and the edited plan on Start, with the sentence as the animation prompt', async () => {
    const { get, type, click, started } = await create();
    await type('  night drive, illustrated  ');
    await click('make-plan');
    await click('start');
    expect(started).toHaveLength(1);
    expect(started[0].prompt).toBe('night drive, illustrated');
    expect(started[0].plan.animation.choices).toMatchObject({ style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720', prompt: 'night drive, illustrated' });
    expect(started[0].plan.song).toMatchObject({ title: 'Night Drive', style: 'synthwave' });
    expect(get('invalid-parts')).toBeNull();
  });

  it('sends the run\'s provider and model with the song\'s writing, and puts the same pair on every call that writes', async () => {
    const { type, click, choose, songs, started } = await create();
    await choose('ollama', 'qwen3:8b');
    await type('night drive');
    await click('make-plan');
    expect(songs.write).toHaveBeenCalledWith(expect.objectContaining({ provider: 'ollama', model: 'qwen3:8b' }));
    await click('start');
    expect(started[0].plan.song).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
    expect(started[0].plan.animation).toMatchObject({ provider: 'ollama', model: 'qwen3:8b' });
  });

  it('sends no provider and no model when none is chosen: the server\'s routing applies', async () => {
    const { type, click, songs, started } = await create();
    await type('night drive');
    await click('make-plan');
    const call = (songs.write.mock.calls as unknown as Record<string, unknown>[][])[0][0];
    expect('provider' in call).toBe(false);
    expect('model' in call).toBe(false);
    await click('start');
    expect(started[0].plan.animation.provider).toBeUndefined();
  });

  describe('when the server plans in one call', () => {
    const assisted = {
      song: { title: 'Night Drive', caption: 'a synthwave sentence', lyrics: '[Verse]\nla', tags: 'synthwave', instrumental: false, seconds: 90 },
      animation: { style: 'illustrated', level: 'medium', fps: 24, mode: 'dark', concept: 'a drive', prompt: 'night drive' },
      parts: [{ name: 'year-counter', exists: false, request: 'a counter of years' }],
      warnings: ['no level was named'],
    };

    it('fills the whole card from one call, with the run\'s provider and model and the language, and creates nothing', async () => {
      const { type, click, choose, get, el, animation, songs, spent, started } = await create({ plan: () => of(assisted), lang: 'es' });
      await choose('ollama', 'qwen3:8b');
      await type('night drive');
      await click('make-plan');
      expect(animation.plan).toHaveBeenCalledTimes(1);
      expect(animation.plan).toHaveBeenCalledWith({ text: 'night drive', generator: 'ace-step', language: 'es', provider: 'ollama', model: 'qwen3:8b' });
      expect(songs.write).not.toHaveBeenCalled();
      for (const call of Object.values(spent)) expect(call).not.toHaveBeenCalled();
      const inputs = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('dynamic-form input, dynamic-form textarea')];
      expect(inputs.some((i) => i.value === 'Night Drive')).toBe(true);
      expect(inputs.some((i) => i.value === '90')).toBe(true);
      expect(inputs.some((i) => i.value.includes('year-counter: a counter of years'))).toBe(true);
      expect(get('warnings')!.textContent).toContain('no level was named');
      expect(get('not-used')).toBeNull();
      await click('start');
      expect(started[0].plan.song.seconds).toBe(90);
      expect(started[0].plan.animation.choices).toMatchObject({ style: 'illustrated', level: 'medium', fps: 24 });
      expect(started[0].plan.parts).toEqual([{ name: 'year-counter', request: 'a counter of years' }]);
    });

    it('says it can take a minute or two while it works', async () => {
      const { type, click, get } = await create({ plan: () => NEVER });
      await type('night drive');
      await click('make-plan');
      expect(get('takes-time')!.textContent).toContain('a minute or two');
    });

    it('falls back to the usual plan when the call fails, and says why; every field stays editable and Start works', async () => {
      const { type, click, get, el, songs, started } = await create({ plan: () => throwError(() => new AnimationFailure('busy', 'a run is active')) });
      await type('night drive');
      await click('make-plan');
      expect(get('not-used')!.textContent).toContain('a run is active');
      expect(songs.write).toHaveBeenCalledTimes(1);
      expect(get('warnings')).toBeNull();
      const inputs = [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('dynamic-form input[type="text"], dynamic-form textarea')];
      expect(inputs.some((i) => i.value === 'Night Drive')).toBe(true);
      expect(inputs.every((i) => !i.disabled)).toBe(true);
      await click('start');
      expect(started).toHaveLength(1);
    });

    it('does not call it on a server that does not list plan: the usual plan, with no message', async () => {
      const { type, click, get, animation, songs } = await create();
      await type('night drive');
      await click('make-plan');
      expect(animation.plan).not.toHaveBeenCalled();
      expect(songs.write).toHaveBeenCalledTimes(1);
      expect(get('not-used')).toBeNull();
      expect(get('takes-time')).toBeNull();
    });
  });

  it('does not make a plan from an empty sentence or one that is too long', async () => {
    const { get, type, songs } = await create();
    await type('   ');
    expect((get('make-plan') as HTMLButtonElement).disabled).toBe(true);
    await type('x'.repeat(2001));
    expect((get('make-plan') as HTMLButtonElement).disabled).toBe(true);
    expect(songs.write).not.toHaveBeenCalled();
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('make-plan')!.textContent).toContain('Preparar el plan');
  });
});
