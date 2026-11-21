import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FADE_UP, FadeUpDirective } from './fade-up.directive';

@Component({
  imports: [FadeUpDirective],
  template: `<ul appFadeUp data-testid="grid">
    <li>a</li>
    <li>b</li>
  </ul>`,
})
class Host {}

@Component({
  imports: [FadeUpDirective],
  template: `<div [appFadeUp]="{ gap: 0.2 }" appFadeUpTarget=".card">
    <span class="card">a</span><span>b</span><span class="card">c</span>
  </div>`,
})
class HostWithTarget {}

describe('FadeUpDirective', () => {
  function setup() {
    const spy = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({ providers: [{ provide: FADE_UP, useValue: spy }] });
    return spy;
  }

  it('makes the children enter once the container is drawn', async () => {
    const spy = setup();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    const [items, options] = spy.mock.calls[0] as unknown as [ArrayLike<Element>, unknown];
    expect(Array.from(items as ArrayLike<Element>).map((e) => e.textContent)).toEqual(['a', 'b']);
    expect(options).toEqual({});
  });

  it('animates only what the target selector names and passes the options on', async () => {
    const spy = setup();
    const fixture = TestBed.createComponent(HostWithTarget);
    await fixture.whenStable();
    const [items, options] = spy.mock.calls[0] as unknown as [ArrayLike<Element>, unknown];
    expect(Array.from(items as ArrayLike<Element>).map((e) => e.textContent)).toEqual(['a', 'c']);
    expect(options).toEqual({ gap: 0.2 });
  });
});
