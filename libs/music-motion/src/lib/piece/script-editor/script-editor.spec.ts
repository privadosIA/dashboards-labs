import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionParts } from '@lab/motion-parts';
import { of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { AnimationFailure, type AnimationPort, type PieceDetail, type Script } from '@lab/animation-core';
import { CATALOG } from '../../animation/fixtures';
import { ANIMATION } from '../../animation/tokens';
import { serverDetail } from '../../animation/server.fixture';
import { toDetail } from '../../animation/server-mapping';
import { stubStorage } from '../../../testing/memory-storage';
import { ScriptEditor } from './script-editor';
import { TIME_DEBOUNCE_MS } from './script-row';

const script = (): Script => ({
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 10, section: 'verse', part: 'toggle', params: { label: 'allow', on: true }, lines: [{ line: 0, text: 'the quiet town', keyword: 'quiet' }] },
    { id: 'p2', start: 10, end: 20, section: 'chorus', part: 'counter', params: { to: 100, speed: 1.5 } },
  ],
});
const detail = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), script: script(), ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function create(piece: PieceDetail, saveScript: (id: string, s: Script) => unknown = () => of(piece), lang: 'es' | 'en' = 'en') {
  stubStorage();
  const save = vi.fn(saveScript);
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideLabForms({ lang }), provideMotionParts({ lang }), { provide: ANIMATION, useValue: { saveScript: save } as unknown as AnimationPort }] });
  const fixture = TestBed.createComponent(ScriptEditor);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('catalog', CATALOG);
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, save, saved, text: () => el.textContent ?? '' };
}

const row = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="row-${id}"]`)!;
const field = (el: HTMLElement, id: string, name: string) => row(el, id).querySelector<HTMLInputElement>(`input[id*="_input_${name}_"]`)!;
const button = (el: HTMLElement, testid: string) => el.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

async function type(fixture: ComponentFixture<unknown>, input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await wait(TIME_DEBOUNCE_MS + 100);
  await settle(fixture);
}

/** Opens the select in `host` and picks the option with that text. */
async function choose(fixture: ComponentFixture<unknown>, host: HTMLElement, option: string): Promise<void> {
  host.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
  await settle(fixture);
  const found = [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => o.textContent?.trim() === option);
  if (!found) throw new Error(`no option "${option}": ${[...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim()).join(', ')}`);
  found.click();
  await settle(fixture);
}
const sent = (save: ReturnType<typeof vi.fn>): Script => save.mock.calls.at(-1)![1] as Script;
const withExtra = (): PieceDetail => {
  const s = script();
  return detail({ script: { ...s, pieces: [s.pieces[0], { ...s.pieces[1], with: [{ part: 'wire-sphere', params: { detail: 12 } }], design: { accent: '#ff5a3c', verse_style: 'glow' }, future: { a: 1 } } as never] } });
};

describe('ScriptEditor', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('the extra parts of a piece', () => {
    it('shows the extras a piece has with their own parameters', async () => {
      const { el } = await create(withExtra());
      const extra = row(el, 'p2').querySelector('[data-testid="extra-0"]')!;
      expect(extra).not.toBeNull();
      expect(extra.querySelector('[data-testid="params-wire-sphere"]')).not.toBeNull();
      expect(row(el, 'p1').querySelector('[data-testid="extra-0"]')).toBeNull();
    });

    it('adds an extra with the part\'s defaults and sends it with the script', async () => {
      const { fixture, el, save } = await create(detail());
      await choose(fixture, row(el, 'p1').querySelector<HTMLElement>('[data-testid="add-extra"]')!, 'parallax-cards (needs a higher level)');
      expect(row(el, 'p1').querySelector('[data-testid="extra-0"]')).not.toBeNull();
      button(el, 'save-script').click();
      await settle(fixture);
      expect(sent(save).pieces[0].with).toEqual([{ part: 'parallax-cards', params: { count: 3, align: 'left' } }]);
      expect(sent(save).pieces[1].with).toBeUndefined();
    });

    it('does not offer the main part nor an extra the piece already draws, in the list that adds one', async () => {
      const { fixture, el } = await create(withExtra());
      const host = row(el, 'p2').querySelector<HTMLElement>('[data-testid="add-extra"]')!;
      host.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle(fixture);
      const names = [...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim());
      expect(names).toContain('toggle');
      expect(names).not.toContain('counter');
      expect(names).not.toContain('wire-sphere');
    });

    it('takes an extra away and sends the piece without the field', async () => {
      const { fixture, el, save } = await create(withExtra());
      button(el, 'remove-extra-0').click();
      await settle(fixture);
      button(el, 'save-script').click();
      await settle(fixture);
      expect('with' in sent(save).pieces[1]).toBe(false);
    });

    it('has no way to add a fourth extra', async () => {
      const base = withExtra();
      const four = detail({ script: { ...base.script, pieces: [base.script.pieces[0], { ...base.script.pieces[1], with: [{ part: 'wire-sphere' }, { part: 'toggle' }, { part: 'blank' }] }] } });
      const { el } = await create(four);
      expect(row(el, 'p2').querySelector('[data-testid="add-extra"]')).toBeNull();
    });

    it('is locked while the piece is being drawn', async () => {
      const { el } = await create({ ...withExtra(), state: 'running', progress: 10 });
      expect(button(el, 'remove-extra-0').disabled).toBe(true);
    });
  });

  describe('the design of a piece', () => {
    it('offers to give a piece a design of its own, and shows it for one that has it', async () => {
      const { el } = await create(withExtra());
      expect(row(el, 'p1').querySelector('[data-testid="design-give"]')).not.toBeNull();
      expect(row(el, 'p2').querySelector('[data-testid="design-give"]')).toBeNull();
      expect(row(el, 'p2').querySelector<HTMLInputElement>('input[id*="_input_accent_"]')!.value).toBe('#ff5a3c');
      expect(row(el, 'p2').textContent).toContain('Soft glow');
    });

    it('sends only what the person set, in the piece that has it', async () => {
      const { fixture, el, save } = await create(detail());
      button(el, 'design-give').click();
      await settle(fixture);
      await type(fixture, row(el, 'p1').querySelector<HTMLInputElement>('input[id*="_input_accent_"]')!, '#00ff00');
      button(el, 'save-script').click();
      await settle(fixture);
      expect(sent(save).pieces[0].design).toEqual({ accent: '#00ff00' });
      expect(sent(save).pieces[1].design).toBeUndefined();
    });

    it('goes back to the song\'s design: the piece is sent without one', async () => {
      const { fixture, el, save } = await create(withExtra());
      row(el, 'p2').querySelector<HTMLButtonElement>('[data-testid="design-back"]')!.click();
      await settle(fixture);
      button(el, 'save-script').click();
      await settle(fixture);
      expect('design' in sent(save).pieces[1]).toBe(false);
    });

    it('shows the server\'s reason about a design field in the row of that piece', async () => {
      const reason = 'piece p2: design accent #101018 has less than 3:1 contrast with the background of mode dark (#101018)';
      const { fixture, el } = await create(withExtra(), () => throwError(() => new AnimationFailure('refused', reason)));
      await type(fixture, field(el, 'p1', 'end'), '9');
      button(el, 'save-script').click();
      await settle(fixture);
      expect(row(el, 'p2').querySelector('[data-testid="row-problem"]')!.textContent).toContain('accent #101018');
      expect(row(el, 'p1').querySelector('[data-testid="row-problem"]')).toBeNull();
    });
  });

  it('keeps what it has no screen for: the extras, the design and an unknown field come back as the server gave them', async () => {
    const piece = withExtra();
    const { fixture, el, save } = await create(piece);
    await type(fixture, field(el, 'p1', 'end'), '9');
    button(el, 'save-script').click();
    await settle(fixture);
    const [a, b] = sent(save).pieces;
    expect([a.end, b.start]).toEqual([9, 9]);
    expect(b).toMatchObject({ with: [{ part: 'wire-sphere', params: { detail: 12 } }], design: { accent: '#ff5a3c', verse_style: 'glow' }, future: { a: 1 } });
  });

  it('shows a form for each piece of the script and says when they cover the song', async () => {
    const { el, text } = await create(detail());
    expect(el.querySelectorAll('app-script-row')).toHaveLength(2);
    expect(field(el, 'p1', 'start').value).toBe('0');
    expect(field(el, 'p1', 'end').value).toBe('10');
    expect(field(el, 'p2', 'start').value).toBe('10');
    expect(text()).toContain('Piece 1');
    expect(text()).toContain('Keyword: the quiet town');
    expect(el.querySelector('[data-testid="covers"]')).not.toBeNull();
  });

  it('does not let the song\'s own start and end be edited', async () => {
    const { el } = await create(detail());
    expect(field(el, 'p1', 'start').disabled).toBe(true);
    expect(field(el, 'p2', 'end').disabled).toBe(true);
    expect(field(el, 'p1', 'end').disabled).toBe(false);
    expect(field(el, 'p2', 'start').disabled).toBe(false);
  });

  it('moves the next piece\'s start when a piece ends later, so there is still no gap', async () => {
    const { fixture, el } = await create(detail());
    await type(fixture, field(el, 'p1', 'end'), '14');
    expect(field(el, 'p1', 'end').value).toBe('14');
    expect(field(el, 'p2', 'start').value).toBe('14');
    expect(el.querySelector('[data-testid="covers"]')).not.toBeNull();
    expect(button(el, 'save-script').disabled).toBe(false);
  });

  it('moves the previous piece\'s end when a piece starts earlier', async () => {
    const { fixture, el } = await create(detail());
    await type(fixture, field(el, 'p2', 'start'), '6');
    expect(field(el, 'p1', 'end').value).toBe('6');
  });

  it('sends the whole script when saved, and hands over what the server saved', async () => {
    const piece = detail();
    const answer = detail({ scriptSource: 'user' });
    const { fixture, el, save, saved } = await create(piece, () => of(answer));
    await type(fixture, field(el, 'p1', 'end'), '14');
    button(el, 'save-script').click();
    await settle(fixture);
    expect(save.mock.calls[0][0]).toBe('api-mm-1');
    const sent = save.mock.calls[0][1] as Script;
    expect(sent.pieces.map((p) => [p.id, p.start, p.end])).toEqual([['p1', 0, 14], ['p2', 14, 20]]);
    expect(sent.pieces[0].lines![0].keyword).toBe('quiet');
    expect(saved).toHaveBeenCalledWith(answer);
    expect(el.querySelector('[data-testid="saved"]')).not.toBeNull();
  });

  it('shows the parameters of each piece\'s part and sends a change of one with the script', async () => {
    const { fixture, el, save } = await create(detail());
    const label = row(el, 'p1').querySelector<HTMLInputElement>('input[id*="_input_label_"]')!;
    expect(label.value).toBe('allow');
    expect(row(el, 'p2').querySelector<HTMLInputElement>('input[id*="_input_to_"]')!.value).toBe('100');
    label.value = 'hola';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(button(el, 'save-script').disabled).toBe(false);
    button(el, 'save-script').click();
    await settle(fixture);
    const sent = save.mock.calls[0][1] as Script;
    expect(sent.pieces[0].params).toEqual({ label: 'hola', on: true });
    expect(sent.pieces[1].params).toEqual({ to: 100, speed: 1.5 });
  });

  it('has a stage for each piece of an illustrated piece, and none for a typographic one', async () => {
    const illustrated = await create(detail({ style: 'illustrated', fps: 24 }));
    expect(illustrated.el.querySelectorAll('app-stage-editor')).toHaveLength(2);
    TestBed.resetTestingModule();
    const typographic = await create(detail());
    expect(typographic.el.querySelector('app-stage-editor')).toBeNull();
  });

  it('sends the stage a person added with the script', async () => {
    const { fixture, el, save } = await create(detail({ style: 'illustrated', fps: 24 }));
    row(el, 'p1').querySelector<HTMLButtonElement>('[data-testid="add-character"]')!.click();
    await settle(fixture);
    button(el, 'save-script').click();
    await settle(fixture);
    const sent = save.mock.calls[0][1] as Script;
    expect(sent.pieces[0].stage).toEqual({ characters: [{ character: 'bot', pose: 'idle', expression: 'neutral', x: 50, y: 85, size: 40 }] });
    expect(sent.pieces[1].stage).toBeUndefined();
  });

  it('has nothing to save until something changes, and discarding brings the script back', async () => {
    const { fixture, el } = await create(detail());
    expect(button(el, 'save-script').disabled).toBe(true);
    await type(fixture, field(el, 'p1', 'end'), '14');
    button(el, 'discard').click();
    await settle(fixture);
    expect(field(el, 'p1', 'end').value).toBe('10');
    expect(button(el, 'save-script').disabled).toBe(true);
  });

  it('shows the server\'s reason at the piece it names and keeps what the person typed', async () => {
    const reason = 'piece p2: part "counter" is not at this level';
    const { fixture, el, saved } = await create(detail(), () => throwError(() => new AnimationFailure('refused', reason)));
    await type(fixture, field(el, 'p1', 'end'), '14');
    button(el, 'save-script').click();
    await settle(fixture);
    expect(row(el, 'p2').querySelector('[data-testid="row-problem"]')!.textContent).toContain(reason);
    expect(row(el, 'p1').querySelector('[data-testid="row-problem"]')).toBeNull();
    expect(el.querySelector('[data-testid="problem"]')).toBeNull();
    expect(field(el, 'p1', 'end').value).toBe('14');
    expect(saved).not.toHaveBeenCalled();
    expect(button(el, 'save-script').disabled).toBe(false);
  });

  it('shows a reason that names no piece below the list', async () => {
    const { fixture, el } = await create(detail(), () => throwError(() => new AnimationFailure('refused', 'the pieces end at 40 seconds and the song at 48')));
    await type(fixture, field(el, 'p1', 'end'), '14');
    button(el, 'save-script').click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="problem"]')!.textContent).toContain('the pieces end at 40 seconds');
    expect(el.querySelector('[data-testid="row-problem"]')).toBeNull();
  });

  it('is locked while the piece is being drawn', async () => {
    const { el, save } = await create(detail({ state: 'running', progress: 10 }));
    expect(field(el, 'p1', 'end').disabled).toBe(true);
    expect(button(el, 'save-script').disabled).toBe(true);
    button(el, 'save-script').click();
    expect(save).not.toHaveBeenCalled();
  });

  it('starts again from the script of a piece that was replaced, for instance by a proposal', async () => {
    const { fixture, el } = await create(detail());
    await type(fixture, field(el, 'p1', 'end'), '14');
    const [a, b] = script().pieces;
    const other: Script = { version: 1, pieces: [{ ...a, end: 8 }, { ...b, start: 8 }] };
    fixture.componentRef.setInput('piece', detail({ script: other }));
    await settle(fixture);
    expect(field(el, 'p1', 'end').value).toBe('8');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(detail(), undefined, 'es');
    expect(text()).toContain('Guion');
    expect(text()).toContain('Guardar guion');
    expect(text()).toContain('Pieza 1');
    expect(text()).toContain('Partes extra');
    expect(text()).toContain('Darle un diseño propio');
    // the parameters of a part are drawn by the shared library, in the language the dashboard gave it
    expect(text()).toContain('Niveles');
  });
});
