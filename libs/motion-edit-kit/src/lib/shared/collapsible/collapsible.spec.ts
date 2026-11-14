import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { stubStorage } from '../../../testing/memory-storage';
import { Collapsible } from './collapsible';

@Component({
  imports: [Collapsible],
  template: `<app-collapsible title="Library" key="library" look="panel" [(open)]="open"><p class="inside">content</p></app-collapsible>`,
})
class Host {
  readonly open = signal(true);
}

describe('Collapsible', () => {
  afterEach(() => vi.unstubAllGlobals());

  function draw() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, button: () => el.querySelector('button.toggle') as HTMLButtonElement };
  }

  it('shows its content and folds it with the heading, which says it is open or folded', () => {
    stubStorage();
    const { fixture, el, button } = draw();
    expect(el.querySelector('.inside')).not.toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    button().click();
    fixture.detectChanges();
    expect(el.querySelector('.inside')).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('comes back folded when it was left folded', () => {
    stubStorage({ 'motion-edit.open.library': '0' });
    const { el, button, fixture } = draw();
    expect(el.querySelector('.inside')).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
