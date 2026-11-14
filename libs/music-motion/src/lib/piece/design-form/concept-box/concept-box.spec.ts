import { TestBed } from '@angular/core/testing';

import { textsFor } from '../../../core/texts';
import { ConceptBox } from './concept-box';

function mount(value = '') {
  const fixture = TestBed.createComponent(ConceptBox);
  fixture.componentRef.setInput('texts', textsFor('es').design);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const box = el.querySelector<HTMLTextAreaElement>('[data-testid=concept]')!;
  return { fixture, el, box, count: () => el.querySelector('[data-testid=concept-count]')!.textContent!.trim() };
}

describe('ConceptBox', () => {
  it('is a plain text box, with its name above, four rows and the limit of the concept', () => {
    const { el, box } = mount('A kite');
    expect(el.querySelector('label span')!.textContent).toBeTruthy();
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.rows).toBe(4);
    expect(box.getAttribute('maxlength')).toBe('200');
    expect(box.value).toBe('A kite');
  });

  it('says how much of its room is used, and tells the host what is written', () => {
    const { fixture, box, count } = mount('abc');
    const written: string[] = [];
    fixture.componentInstance.changed.subscribe((v) => written.push(v));
    expect(count()).toMatch(/^3 (de|of) 200 /);
    box.value = 'a longer idea';
    box.dispatchEvent(new Event('input'));
    expect(written).toEqual(['a longer idea']);
  });

  it('is off while the piece is being drawn', () => {
    const { fixture, box } = mount('x');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(box.disabled).toBe(true);
  });
});
