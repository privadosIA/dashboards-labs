import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InfoTip } from './info-tip';

@Component({ imports: [InfoTip], template: '<app-info-tip text="The clip plays once." />' })
class Host {}

describe('InfoTip', () => {
  it('is a button named by its text, so that the bubble is also read and reached by keyboard', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=info-tip]')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('The clip plays once.');
    expect(button.textContent?.trim()).toBe('');
  });
});
