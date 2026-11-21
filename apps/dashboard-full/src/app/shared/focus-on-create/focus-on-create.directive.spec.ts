import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FocusOnCreateDirective } from './focus-on-create.directive';

@Component({ imports: [FocusOnCreateDirective], template: `<input data-testid="plain" />@if (show()) {<input data-testid="asked" moFocusOnCreate />}` })
class Host {
  readonly show = signal(false);
}

describe('FocusOnCreateDirective', () => {
  it('focuses the field when it is drawn, not before', async () => {
    const fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('[data-testid="asked"]'));
    fixture.componentInstance.show.set(true);
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-testid="asked"]'));
    fixture.nativeElement.remove();
  });
});
