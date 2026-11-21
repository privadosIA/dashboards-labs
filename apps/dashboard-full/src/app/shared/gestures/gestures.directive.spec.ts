import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GestureHandlers } from './gestures';
import { GesturesDirective } from './gestures.directive';

@Component({
  imports: [GesturesDirective],
  template: `<div id="t" [moGestures]="handlers" touchAction="none"></div>`,
})
class Host {
  swipe = vi.fn();
  longPress = vi.fn();
  handlers: GestureHandlers = { swipe: this.swipe, longPress: this.longPress };
}

function pointer(type: string, x: number, y: number, t: number): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as unknown as Record<string, unknown>;
  Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
  Object.defineProperty(e, 'timeStamp', { value: t });
  return e as unknown as PointerEvent;
}

describe('GesturesDirective', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('#t') as HTMLElement;
    el.setPointerCapture = () => {};
    return { fixture, el };
  }

  it('sets the touch-action the screen asks for', () => {
    const { el } = render();
    expect(el.style.touchAction).toBe('none');
  });

  it('turns pointer events into a swipe', () => {
    const { fixture, el } = render();
    el.dispatchEvent(pointer('pointerdown', 300, 200, 0));
    el.dispatchEvent(pointer('pointerup', 120, 205, 90));
    expect(fixture.componentInstance.swipe).toHaveBeenCalledWith('left');
  });

  it('keeps the browser menu from covering a long press', () => {
    const { el } = render();
    const menu = new Event('contextmenu', { cancelable: true });
    el.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('stops listening when it is destroyed', () => {
    const { fixture, el } = render();
    fixture.destroy();
    el.dispatchEvent(pointer('pointerdown', 300, 200, 0));
    el.dispatchEvent(pointer('pointerup', 120, 205, 90));
    expect(fixture.componentInstance.swipe).not.toHaveBeenCalled();
  });
});
