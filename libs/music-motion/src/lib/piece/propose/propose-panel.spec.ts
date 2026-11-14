import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { AnimationFailure, type AnimationPort, type AssistModels, type PieceDetail, type Proposal } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { serverDetail } from '../../animation/server.fixture';
import { toDetail } from '../../animation/server-mapping';
import { stubStorage } from '../../../testing/memory-storage';
import { ProposePanel } from './propose-panel';
import { assistTestProviders, chooseAssistant } from '../../../testing/assist';

const detail = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), ...extra });
const proposal = (extra: Partial<Proposal> = {}): Proposal => ({ what: 'script', source: 'assistant', replacements: [], piece: detail({ scriptSource: 'assistant' }), ...extra });

const settle = async (fixture: ComponentFixture<unknown>, ms = 0) => {
  fixture.detectChanges();
  await fixture.whenStable();
  if (ms) await new Promise((r) => setTimeout(r, ms));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

const MODELS: AssistModels = { default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5_200_000_000, fits: true }, { name: 'gemma4:26b', sizeBytes: 17_000_000_000, fits: false }] };

interface Calls {
  propose?: () => unknown;
  proposeAll?: () => unknown;
  assistModels?: () => unknown;
}

async function create(piece: PieceDetail, calls: Calls | (() => unknown) = {}, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const given: Calls = typeof calls === 'function' ? { propose: calls } : calls;
  const call = vi.fn(given.propose ?? (() => of(proposal())));
  const callAll = vi.fn(given.proposeAll ?? (() => of(detail({ proposal: { state: 'waiting', what: 'all', startedAt: 1 } }))));
  const models = vi.fn(given.assistModels ?? (() => of(MODELS)));
  TestBed.configureTestingModule({
    providers: [ ...assistTestProviders(),{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideLabForms({ lang }), { provide: ANIMATION, useValue: { propose: call, proposeAll: callAll, assistModels: models } as unknown as AnimationPort }],
  });
  const fixture = TestBed.createComponent(ProposePanel);
  fixture.componentRef.setInput('piece', piece);
  const proposed = vi.fn();
  fixture.componentInstance.proposed.subscribe(proposed);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const write = async (text: string) => {
    const area = el.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const pick = async (name: string) => {
    chooseAssistant(fixture, { provider: '', model: name });
    await settle(fixture);
  };
  return { fixture, el, call, callAll, models, proposed, write, pick, text: () => el.textContent ?? '' };
}

const button = (el: HTMLElement, testid: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;
const dialogButton = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

async function ask(fixture: ComponentFixture<unknown>, testid: string, answer: 'confirm' | 'cancel' = 'confirm') {
  button(fixture.nativeElement as HTMLElement, testid).click();
  await settle(fixture);
  const text = document.body.textContent ?? '';
  dialogButton(answer).click();
  await settle(fixture, 300);
  return text;
}

describe('ProposePanel', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('asks before replacing, and does nothing when the person says no', async () => {
    const { fixture, call, proposed } = await create(detail());
    const shown = await ask(fixture, 'propose-script', 'cancel');
    expect(shown).toContain('Replace what is there');
    expect(shown).toContain('replaces the current script');
    expect(call).not.toHaveBeenCalled();
    expect(proposed).not.toHaveBeenCalled();
  });

  it('warns more about a design the person edited', async () => {
    const piece = detail();
    const edited = detail({ design: { ...piece.design, edited: true, source: 'user' } });
    const { fixture } = await create(edited);
    expect(await ask(fixture, 'propose-design', 'cancel')).toContain('You edited this design');
    TestBed.resetTestingModule();
    const plain = await create(detail());
    const shown = await ask(plain.fixture, 'propose-design', 'cancel');
    expect(shown).toContain('replaces the current design');
    expect(shown).not.toContain('You edited');
  });

  it('asks the server for what was chosen and hands over the piece as it is after', async () => {
    const answer = proposal({ what: 'design', source: 'assistant', piece: detail({ title: 'After' }) });
    const { fixture, el, call, proposed } = await create(detail(), { propose: () => of(answer) });
    await ask(fixture, 'propose-design');
    expect(call).toHaveBeenCalledWith('api-mm-1', { what: 'design' });
    expect(proposed).toHaveBeenCalledWith(answer.piece);
    expect(el.querySelector('[data-testid="result"]')!.textContent).toContain('Design proposed.');
    expect(el.querySelector('[data-testid="source"]')!.textContent).toContain('The assistant proposed it.');
  });

  it('says plainly that the fixed rule answered and that it is not an error', async () => {
    const { fixture, el } = await create(detail(), { propose: () => of(proposal({ source: 'fallback' })) });
    await ask(fixture, 'propose-script');
    const source = el.querySelector('[data-testid="source"]')!;
    expect(source.textContent).toContain('fixed rule');
    expect(source.textContent).toContain('not an error');
    expect(el.querySelector('[data-testid="problem"]')).toBeNull();
  });

  it('lists each piece with the part it had and the one that took its place', async () => {
    const replacements = [{ piece: 'p1', from: 'wire-sphere', to: 'toggle' }, { piece: 'p3', from: 'glitch-text', to: 'counter' }];
    const { fixture, el } = await create(detail(), { propose: () => of(proposal({ replacements })) });
    await ask(fixture, 'propose-script');
    expect([...el.querySelectorAll('[data-testid="replacements"] li')].map((li) => li.textContent)).toEqual(['p1: wire-sphere → toggle', 'p3: glitch-text → counter']);
  });

  it('lists nothing when the level replaced nothing', async () => {
    const { fixture, el } = await create(detail());
    await ask(fixture, 'propose-script');
    expect(el.querySelector('[data-testid="replacements"]')).toBeNull();
  });

  it('shows the server\'s reason when it cannot propose, and hands over nothing', async () => {
    const { fixture, el, proposed } = await create(detail(), { propose: () => throwError(() => new AnimationFailure('busy', 'piece "api-mm-1" is being drawn: wait for it to end')) });
    await ask(fixture, 'propose-script');
    expect(el.querySelector('[data-testid="problem"]')!.textContent).toContain('The piece is being drawn: piece "api-mm-1" is being drawn');
    expect(proposed).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="result"]')).toBeNull();
  });

  it('is locked while the piece is being drawn', async () => {
    const { el, call } = await create(detail({ state: 'running', progress: 10 }));
    expect(button(el, 'propose-design').disabled).toBe(true);
    expect(button(el, 'propose-script').disabled).toBe(true);
    button(el, 'propose-script').click();
    expect(call).not.toHaveBeenCalled();
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(detail(), {}, 'es');
    expect(text()).toContain('Proponer diseño');
    expect(text()).toContain('Proponer guion');
  });

  it('has a prompt field with the text the piece keeps, up to 2000 characters, and says how many are written', async () => {
    const { el, write, text } = await create(detail({ prompt: 'a calm night' }));
    expect(el.querySelector('textarea')!.value).toBe('a calm night');
    expect(text()).toContain('12 of 2000 characters');
    await write('x'.repeat(2001));
    expect(text()).toContain('2001 of 2000 characters');
    expect(button(el, 'propose-all').disabled).toBe(true);
    expect(button(el, 'propose-design').disabled).toBe(true);
  });

  it('sends the text only when it is not the one the piece keeps, and the model when one is chosen', async () => {
    const { fixture, call, write, pick } = await create(detail({ prompt: 'a calm night' }));
    await ask(fixture, 'propose-design');
    expect(call).toHaveBeenLastCalledWith('api-mm-1', { what: 'design' });
    await write('a loud day');
    await pick('gemma4:26b');
    await ask(fixture, 'propose-script');
    expect(call).toHaveBeenLastCalledWith('api-mm-1', { what: 'script', prompt: 'a loud day', model: 'gemma4:26b' });
  });

  it('has the assistant field with Add provider, and sends an external provider with its model; it stays when the models cannot be read', async () => {
    const { fixture, el, call } = await create(detail());
    expect(el.querySelector('[data-testid="assistant-field"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="add-provider-open"]')).not.toBeNull();
    chooseAssistant(fixture, { provider: 'router', model: 'gpt-x' });
    await settle(fixture);
    await ask(fixture, 'propose-design');
    expect(call).toHaveBeenLastCalledWith('api-mm-1', { what: 'design', provider: 'router', model: 'gpt-x' });
    TestBed.resetTestingModule();
    const none = await create(detail(), { assistModels: () => throwError(() => new AnimationFailure('unavailable', 'no assistant')) });
    expect(none.el.querySelector('[data-testid="assistant-field"]')).not.toBeNull();
    expect(button(none.el, 'propose-design').disabled).toBe(false);
  });

  it('asks for design and script together in the background, warns that both are replaced, and hands over the piece with its proposal', async () => {
    const started = detail({ proposal: { state: 'waiting', what: 'all', startedAt: 1 } });
    const { fixture, callAll, call, proposed, write } = await create(detail(), { proposeAll: () => of(started) });
    await write('a calm night');
    const shown = await ask(fixture, 'propose-all');
    expect(shown).toContain('replaces the current design and script');
    expect(callAll).toHaveBeenCalledWith('api-mm-1', { prompt: 'a calm night' });
    expect(call).not.toHaveBeenCalled();
    expect(proposed).toHaveBeenCalledWith(started);
  });

  it('shows the model and why the fixed rule wrote a single design or script', async () => {
    const { fixture, el } = await create(detail(), { propose: () => of(proposal({ source: 'fallback', model: 'qwen3:8b', fallbackReason: 'a run holds the memory. The fixed rule does not read the prompt.' })) });
    await ask(fixture, 'propose-script');
    expect(el.querySelector('[data-testid="model-used"]')!.textContent).toContain('qwen3:8b');
    expect(el.querySelector('[data-testid="reason"]')!.textContent).toContain('Why not the assistant: a run holds the memory. The fixed rule does not read the prompt.');
  });

  it('shows the server\'s reason when asking for both is refused', async () => {
    const { fixture, el, proposed } = await create(detail(), { proposeAll: () => throwError(() => new AnimationFailure('busy', 'piece "api-mm-1" has a proposal being written')) });
    await ask(fixture, 'propose-all');
    expect(el.querySelector('[data-testid="problem"]')!.textContent).toContain('has a proposal being written');
    expect(proposed).not.toHaveBeenCalled();
  });

  it('is off, with a note, while a proposal is waiting or writing', async () => {
    for (const state of ['waiting', 'writing'] as const) {
      TestBed.resetTestingModule();
      const { el, call, callAll } = await create(detail({ proposal: { state, what: 'all', startedAt: 1 } }));
      for (const id of ['propose-design', 'propose-script', 'propose-all']) expect(button(el, id).disabled).toBe(true);
      expect((el.querySelector('[data-testid="assistant-field"]') as HTMLFieldSetElement).disabled).toBe(true);
      expect(el.querySelector('[data-testid="proposing-note"]')!.textContent).toContain('A proposal is being written');
      button(el, 'propose-all').click();
      expect(call).not.toHaveBeenCalled();
      expect(callAll).not.toHaveBeenCalled();
    }
  });

  it('is on again when the proposal is done or failed', async () => {
    for (const state of ['done', 'failed'] as const) {
      TestBed.resetTestingModule();
      const { el } = await create(detail({ proposal: { state, what: 'all', startedAt: 1 } }));
      expect(button(el, 'propose-all').disabled).toBe(false);
      expect(el.querySelector('[data-testid="proposing-note"]')).toBeNull();
    }
  });

  it('says it in Spanish: the three buttons and the model', async () => {
    const { text } = await create(detail(), {}, 'es');
    expect(text()).toContain('Proponer diseño y guion');
    expect(text()).toContain('Modelo del asistente');
    expect(text()).toContain('0 de 2000 caracteres');
  });
});
