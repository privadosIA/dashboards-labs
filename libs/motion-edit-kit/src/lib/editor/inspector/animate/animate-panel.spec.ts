import { TestBed } from '@angular/core/testing';
import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import type { Catalog, Keyframe, Script } from '@lab/animation-core';

import { stubStorage } from '../../../../testing/memory-storage';
import type { EditRequest } from '../edit';
import { AnimatePanel } from './animate-panel';

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });
const part = { name: 'counter', description: '', levels: ['simple'], costMs: 1, manual: false, params: [{ name: 'to', type: 'int', default: '100', min: 1, max: 999, animatable: true }, { name: 'label', type: 'string', default: 'x', maxLength: 8 }, { name: 'on', type: 'bool', default: 'false', animatable: true }, { name: 'mode', type: 'enum', default: 'up', options: ['up', 'down'], animatable: true }] };
const catalog = (features: string[]): Catalog => ({ parts: [part], characters: [], backgrounds: [], levels: ['simple'], styles: ['typographic'], frameRates: [24], actions: [], fonts: [], modes: ['dark'], features }) as unknown as Catalog;
const script = (animate?: Script['pieces'][number]['animate']): Script => ({ version: 1, pieces: [{ id: 'p1', start: 10, end: 18, part: 'counter', params: { to: 40, label: 'hi' }, ...(animate ? { animate } : {}), with: [{ part: 'counter', params: {}, ...(animate ? { animate: { to: [kf(0, 5)] } } : {}) }] }] });

function setup(options: { features?: string[]; script?: Script; extra?: number; selected?: { param: string; keyframe: number } | null; playhead?: number; lang?: 'es' | 'en' } = {}) {
  stubStorage({ 'motion-edit.lang': options.lang ?? 'en' });
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }] });
  const fixture = TestBed.createComponent(AnimatePanel);
  const base = options.script ?? script();
  fixture.componentRef.setInput('script', base);
  fixture.componentRef.setInput('index', 0);
  fixture.componentRef.setInput('part', part);
  fixture.componentRef.setInput('catalog', catalog(options.features ?? ['animate']));
  fixture.componentRef.setInput('playhead', options.playhead ?? 14);
  fixture.componentRef.setInput('selected', options.selected ?? null);
  if (options.extra !== undefined) fixture.componentRef.setInput('extra', options.extra);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const edits: EditRequest[] = [];
  const picks: { param: string; keyframe: number }[] = [];
  fixture.componentInstance.edit.subscribe((e) => edits.push(e));
  fixture.componentInstance.pick.subscribe((p) => picks.push(p));
  const apply = (n = edits.length - 1): Script => edits[n].fn({ design: {} as never, script: base }).script;
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, el, edits, picks, apply, q, base };
}

describe('AnimatePanel', () => {
  it('offers Animate on the parameters the catalog marks animatable and says why the others are not', () => {
    const { el, q } = setup();
    expect(Array.from(el.querySelectorAll('.row')).map((r) => r.getAttribute('data-param'))).toEqual(['to', 'on', 'mode']);
    expect(q('animate-why')?.textContent).toContain('Only the parameters the part reads while it draws can be animated');
  });

  it('offers nothing when the server does not say it takes keyframes, and nothing to say about it', () => {
    const { q } = setup({ features: [] });
    expect(q('animate')).toBeNull();
  });

  it('starts animating a parameter with its value now at the start and at the end of the piece, and selects the first', () => {
    const { el, edits, picks, apply } = setup();
    (el.querySelector('.row[data-param="to"] [data-testid="animate-go"]') as HTMLElement).click();
    expect(edits).toHaveLength(1);
    expect(apply().pieces[0].animate).toEqual({ to: [kf(0, 40, 'linear'), kf(8, 40, 'linear')] });
    expect(picks).toEqual([{ param: 'to', keyframe: 0 }]);
  });

  it('starts a switch from false and an option from its default when the script leaves them out', () => {
    const { el, apply } = setup();
    (el.querySelector('.row[data-param="on"] [data-testid="animate-go"]') as HTMLElement).click();
    expect(apply().pieces[0].animate!['on'].map((k) => k.value)).toEqual([false, false]);
    (el.querySelector('.row[data-param="mode"] [data-testid="animate-go"]') as HTMLElement).click();
    expect(apply().pieces[0].animate!['mode'].map((k) => k.value)).toEqual(['up', 'up']);
  });

  it('works on the extra part\'s parameters', () => {
    const { el, apply } = setup({ extra: 0 });
    (el.querySelector('.row[data-param="to"] [data-testid="animate-go"]') as HTMLElement).click();
    expect(apply().pieces[0].with![0].animate).toEqual({ to: [kf(0, 100, 'linear'), kf(8, 100, 'linear')] });
    expect(apply().pieces[0].animate).toBeUndefined();
  });

  describe('an animated parameter', () => {
    const animated = () => script({ to: [kf(0, 0, 'linear'), kf(8, 100, 'linear')] });

    it('shows the value the part gets at the playhead, in the piece\'s own time', () => {
      const { q } = setup({ script: animated(), playhead: 14 });
      expect(q('animate-now')!.textContent).toContain('At the playhead: 50');
    });

    it('rounds a whole-number parameter and says a switch in words', () => {
      const a = setup({ script: script({ to: [kf(0, 0), kf(3, 10)] }), playhead: 11 });
      expect(a.q('animate-now')!.textContent).toContain('At the playhead: 3');
      TestBed.resetTestingModule();
      const b = setup({ script: script({ on: [kf(0, true)] }) });
      expect(b.q('animate-now')!.textContent).toContain('yes');
    });

    it('lists the keyframes and picks one on a click', () => {
      const { el, picks } = setup({ script: animated() });
      const frames = Array.from(el.querySelectorAll('[data-testid="animate-frame"]'));
      expect(frames.map((f) => f.textContent?.trim())).toEqual(['◆ Keyframe 1: 0 at 0.00 s', '◆ Keyframe 2: 100 at 8.00 s']);
      (frames[1] as HTMLElement).click();
      expect(picks).toEqual([{ param: 'to', keyframe: 1 }]);
    });

    it('edits the selected keyframe: its value, its time and the way it goes to the next', () => {
      const { q, edits, apply, fixture } = setup({ script: animated(), selected: { param: 'to', keyframe: 1 } });
      const value = q('animate-value') as HTMLInputElement;
      value.value = '250';
      value.dispatchEvent(new Event('change'));
      expect(apply().pieces[0].animate!['to'][1]).toEqual(kf(8, 250, 'linear'));
      const time = q('animate-time') as HTMLInputElement;
      time.value = '5';
      time.dispatchEvent(new Event('change'));
      expect(apply().pieces[0].animate!['to'][1].t).toBe(5);
      const ease = q('animate-ease') as HTMLSelectElement;
      ease.value = 'in-out';
      ease.dispatchEvent(new Event('change'));
      expect(apply().pieces[0].animate!['to'][1].ease).toBe('in-out');
      expect(edits.map((e) => e.label)).toEqual(['keyframe-value-0-main-to-1', 'keyframe-time-0-main-to-1', undefined]);
      fixture.detectChanges();
    });

    it('ignores a value that is not a number for a number', () => {
      const { q, edits } = setup({ script: animated(), selected: { param: 'to', keyframe: 0 } });
      const value = q('animate-value') as HTMLInputElement;
      value.value = '';
      value.dispatchEvent(new Event('change'));
      expect(edits).toEqual([]);
    });

    it('draws the control for the type of the parameter', () => {
      const bool = setup({ script: script({ on: [kf(0, true), kf(4, false)] }), selected: { param: 'on', keyframe: 0 } });
      expect((bool.q('animate-value') as HTMLInputElement).type).toBe('checkbox');
      TestBed.resetTestingModule();
      const option = setup({ script: script({ mode: [kf(0, 'up'), kf(4, 'down')] }), selected: { param: 'mode', keyframe: 1 } });
      expect((option.q('animate-value') as HTMLSelectElement).tagName).toBe('SELECT');
      expect((option.q('animate-value') as HTMLSelectElement).value).toBe('down');
    });

    it('adds a keyframe at the playhead with the value it has there, removes one, stops animating, and removes them all', () => {
      const { el, q, apply, picks, fixture } = setup({ script: animated(), playhead: 14, selected: { param: 'to', keyframe: 0 } });
      (q('animate-add') as HTMLElement).click();
      expect(apply().pieces[0].animate!['to'].map((k) => [k.t, k.value])).toEqual([[0, 0], [4, 50], [8, 100]]);
      expect(picks.at(-1)).toEqual({ param: 'to', keyframe: 1 });
      // the keyframe just added is the one chosen: Remove takes that one away
      (q('animate-remove') as HTMLElement).click();
      expect(apply().pieces[0].animate!['to'].map((k) => k.t)).toEqual([0]);
      // and choosing the first one makes Remove take that one
      (el.querySelectorAll('[data-testid="animate-frame"]')[0] as HTMLElement).click();
      fixture.detectChanges();
      (q('animate-remove') as HTMLElement).click();
      expect(apply().pieces[0].animate!['to'].map((k) => k.t)).toEqual([8]);
      (q('animate-stop') as HTMLElement).click();
      expect(apply().pieces[0].animate).toBeUndefined();
      (q('animate-remove-all') as HTMLElement).click();
      expect(apply().pieces[0].animate).toBeUndefined();
      expect(apply().pieces[0].with![0].animate).toBeUndefined();
      expect(el).toBeTruthy();
    });

    it('is locked while the piece is', () => {
      const { fixture, q } = setup({ script: animated(), selected: { param: 'to', keyframe: 0 } });
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      expect((q('animate-stop') as HTMLButtonElement).disabled).toBe(true);
      expect((q('animate-value') as HTMLInputElement).disabled).toBe(true);
    });
  });

  it('says the server does not accept animated parameters, and offers to remove them, when it does not say it takes them', () => {
    const { q, apply } = setup({ features: [], script: script({ to: [kf(0, 1)] }) });
    expect(q('animate-unsupported')!.textContent).toContain('The server does not accept animated parameters');
    expect(q('animate-go')).toBeNull();
    (q('animate-remove-all') as HTMLElement).click();
    expect(apply().pieces[0].animate).toBeUndefined();
  });

  it('is in Spanish too', () => {
    const { q } = setup({ lang: 'es', script: script({ to: [kf(0, 1), kf(8, 9)] }) });
    expect(q('animate')!.querySelector('h3')!.textContent).toBe('Animación');
    expect(q('animate-stop')!.textContent).toBe('Dejar de animar');
  });
});
