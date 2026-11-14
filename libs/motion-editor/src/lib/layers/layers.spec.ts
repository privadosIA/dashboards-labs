import { TestBed } from '@angular/core/testing';

import type { Script } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import type { Selection } from '../timeline/selection';
import { MotionLayers } from './layers';
import { hiddenParts } from './visibility';

const SCRIPT: Script = {
  version: 1,
  pieces: [
    { id: 'p2', start: 10, end: 20, part: 'pulse-ring' },
    { id: 'p1', start: 0, end: 10, part: 'toggle', with: [{ part: 'counter' }, { part: 'stamp' }] },
  ],
};

function setup(selection: Selection | null = null, lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: lang }] });
  const fixture = TestBed.createComponent(MotionLayers);
  fixture.componentRef.setInput('script', SCRIPT);
  fixture.componentRef.setInput('selection', selection);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const picks: (Selection | null)[] = [];
  const hides: ReadonlySet<string>[] = [];
  fixture.componentInstance.select.subscribe((s) => picks.push(s));
  fixture.componentInstance.visibility.subscribe((v) => hides.push(v));
  const click = (node: Element | null) => {
    (node as HTMLElement).click();
    fixture.detectChanges();
  };
  return { fixture, el, picks, hides, click };
}

describe('hiddenParts', () => {
  it('hides every other part of the script when one is soloed, and what was hidden by hand', () => {
    expect([...hiddenParts(SCRIPT, 'toggle', new Set())].sort()).toEqual(['counter', 'pulse-ring', 'stamp']);
    expect([...hiddenParts(SCRIPT, null, new Set(['stamp']))]).toEqual(['stamp']);
    expect(hiddenParts(SCRIPT, 'toggle', new Set(['toggle'])).has('toggle')).toBe(false);
    expect(hiddenParts(SCRIPT, null, new Set()).size).toBe(0);
  });
});

describe('MotionLayers', () => {
  it('lists the pieces in time order, with the extras folded', () => {
    const { el } = setup();
    const names = Array.from(el.querySelectorAll('.piece > .row .part')).map((n) => n.textContent);
    expect(names).toEqual(['toggle', 'pulse-ring']);
    expect(el.querySelectorAll('.extras')).toHaveLength(0);
    expect(el.querySelectorAll('.fold:not(.spacer)')).toHaveLength(1);
  });

  it('opens the extras of a piece', () => {
    const { el, click } = setup();
    click(el.querySelector('.fold:not(.spacer)'));
    expect(Array.from(el.querySelectorAll('.extras .part')).map((n) => n.textContent)).toEqual(['counter', 'stamp']);
    expect(el.querySelector('.fold')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('selects a piece or an extra', () => {
    const { el, picks, click } = setup();
    click(el.querySelectorAll('.piece > .row .name')[1]);
    expect(picks.at(-1)).toEqual({ piece: 'p2' });
    click(el.querySelector('.fold:not(.spacer)'));
    click(el.querySelectorAll('.extras .name')[1]);
    expect(picks.at(-1)).toEqual({ piece: 'p1', extra: 1 });
  });

  it('shows the selection', () => {
    const { el } = setup({ piece: 'p1' });
    expect(el.querySelectorAll('.row.selected')).toHaveLength(1);
    expect(el.querySelector('.row.selected .part')!.textContent).toBe('toggle');
  });

  it('solos a part: every other one is left out of the preview, and the switch says so', () => {
    const { el, hides, click } = setup();
    click(el.querySelectorAll('.piece > .row .switch')[0]); // S of toggle
    expect([...hides.at(-1)!].sort()).toEqual(['counter', 'pulse-ring', 'stamp']);
    expect(el.querySelectorAll('.piece > .row .switch')[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('.piece > .row.off')).toHaveLength(1); // pulse-ring is off
    click(el.querySelectorAll('.piece > .row .switch')[0]);
    expect(hides.at(-1)!.size).toBe(0);
  });

  it('hides a part by itself', () => {
    const { el, hides, click } = setup();
    click(el.querySelectorAll('.piece > .row .switch')[4]); // H of pulse-ring (each piece row has S, H and remove)
    expect([...hides.at(-1)!]).toEqual(['pulse-ring']);
    click(el.querySelectorAll('.piece > .row .switch')[4]);
    expect(hides.at(-1)!.size).toBe(0);
  });

  it('asks to remove a piece from its row, and to add one (split at the playhead)', () => {
    const { el, fixture, click } = setup();
    const removed: string[] = [];
    let added = 0;
    fixture.componentInstance.removePiece.subscribe((id) => removed.push(id));
    fixture.componentInstance.addPiece.subscribe(() => added++);
    click(el.querySelectorAll('[data-testid="layer-remove"]')[1]);
    expect(removed).toEqual(['p2']);
    click(el.querySelector('[data-testid="layer-add"]'));
    expect(added).toBe(1);
  });

  it('cannot remove or add while locked', () => {
    const { el, fixture } = setup();
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    expect((el.querySelector('[data-testid="layer-remove"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="layer-add"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the piece under the playhead and moves the mark as it goes, without selecting', () => {
    const { el, fixture, picks } = setup();
    const current = () => Array.from(el.querySelectorAll('.row.current .part')).map((n) => n.textContent);
    expect(current()).toEqual(['toggle']); // p1 holds 0..10
    fixture.componentRef.setInput('playhead', 12);
    fixture.detectChanges();
    expect(current()).toEqual(['pulse-ring']);
    expect(el.querySelector('.row.current')!.getAttribute('aria-current')).toBe('true');
    fixture.componentRef.setInput('playhead', 99);
    fixture.detectChanges();
    expect(current()).toEqual(['pulse-ring']); // past the end: the last one
    expect(picks).toEqual([]);
  });

  it('brings the row of the current piece into view by scrolling the list, never the page', () => {
    const { el, fixture } = setup();
    const list = el.querySelector<HTMLElement>('ul.layers')!;
    const rows = el.querySelectorAll<HTMLElement>('[data-piece]');
    const page = vi.fn();
    for (const row of rows) row.scrollIntoView = page;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    list.getBoundingClientRect = () => rect(100, 200);
    rows[1].getBoundingClientRect = () => rect(230, 260); // below the visible part of the list
    list.scrollTop = 0;
    fixture.componentRef.setInput('playhead', 12);
    fixture.detectChanges();
    expect(list.scrollTop).toBe(60);
    expect(page).not.toHaveBeenCalled();
  });

  it('says its words in Spanish', () => {
    const { el } = setup(null, 'es');
    expect(el.querySelector('ul')!.getAttribute('aria-label')).toBe('Capas');
  });
});
