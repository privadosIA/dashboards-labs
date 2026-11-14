import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PhoneService } from '../../core/phone.service';
import { PullToRefreshDirective, PULL_THRESHOLD } from './pull-to-refresh.directive';

@Component({
  imports: [PullToRefreshDirective],
  template: `<div id="scroller" style="overflow-y: auto"><div id="t" moPullToRefresh #p="moPullToRefresh" (refresh)="refreshed = refreshed + 1"></div></div>`,
})
class Host {
  refreshed = 0;
}

function touch(type: string, y: number, cancelable = true): Event {
  const e = new Event(type, { bubbles: true, cancelable });
  Object.assign(e, { touches: type === 'touchend' ? [] : [{ clientY: y }] });
  return e;
}

describe('PullToRefreshDirective', () => {
  const phone = signal(true);

  function render() {
    TestBed.configureTestingModule({ providers: [{ provide: PhoneService, useValue: { phone } }] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const t = fixture.nativeElement.querySelector('#t') as HTMLElement;
    const scroller = fixture.nativeElement.querySelector('#scroller') as HTMLElement;
    const dir = fixture.debugElement.children[0].children[0].injector.get(PullToRefreshDirective);
    return { fixture, t, scroller, dir };
  }

  afterEach(() => phone.set(true));

  it('refreshes when pulled down from the top past the threshold and released', () => {
    const { fixture, t, dir } = render();
    t.dispatchEvent(touch('touchstart', 100));
    const move = touch('touchmove', 100 + PULL_THRESHOLD + 20);
    t.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    expect(dir.distance()).toBeGreaterThan(0);
    expect(dir.ready()).toBe(true);
    t.dispatchEvent(touch('touchend', 0));
    expect(fixture.componentInstance.refreshed).toBe(1);
    expect(dir.distance()).toBe(0);
    fixture.nativeElement.remove();
  });

  it('does nothing when released before the threshold', () => {
    const { fixture, t, dir } = render();
    t.dispatchEvent(touch('touchstart', 100));
    t.dispatchEvent(touch('touchmove', 140));
    expect(dir.ready()).toBe(false);
    t.dispatchEvent(touch('touchend', 0));
    expect(fixture.componentInstance.refreshed).toBe(0);
    fixture.nativeElement.remove();
  });

  it('leaves the scroll alone when the page is not at the top', () => {
    const { fixture, t, scroller } = render();
    scroller.scrollTop = 50;
    t.dispatchEvent(touch('touchstart', 100));
    const move = touch('touchmove', 300);
    t.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    t.dispatchEvent(touch('touchend', 0));
    expect(fixture.componentInstance.refreshed).toBe(0);
    fixture.nativeElement.remove();
  });

  it('an upward drag is a scroll, not a pull', () => {
    const { fixture, t } = render();
    t.dispatchEvent(touch('touchstart', 300));
    const move = touch('touchmove', 200);
    t.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    t.dispatchEvent(touch('touchend', 0));
    expect(fixture.componentInstance.refreshed).toBe(0);
    fixture.nativeElement.remove();
  });

  it('is for phones only', () => {
    phone.set(false);
    const { fixture, t } = render();
    t.dispatchEvent(touch('touchstart', 100));
    t.dispatchEvent(touch('touchmove', 300));
    t.dispatchEvent(touch('touchend', 0));
    expect(fixture.componentInstance.refreshed).toBe(0);
    fixture.nativeElement.remove();
  });
});
