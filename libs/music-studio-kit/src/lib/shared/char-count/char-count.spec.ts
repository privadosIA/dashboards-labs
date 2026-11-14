import { TestBed } from '@angular/core/testing';

import { CharCount } from './char-count';

describe('CharCount', () => {
  function draw(length: number, max: number): HTMLElement {
    const fixture = TestBed.createComponent(CharCount);
    fixture.componentRef.setInput('length', length);
    fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows how many characters of how many', () => {
    expect(draw(12, 80).textContent?.trim()).toBe('12/80');
  });

  it('turns to the limit style at the maximum', () => {
    expect(draw(79, 80).querySelector('.limit')).toBeNull();
    expect(draw(80, 80).querySelector('.limit')).toBeTruthy();
  });
});
