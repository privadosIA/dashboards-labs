import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AUTO_ANIMATE, AutoAnimateDirective } from './auto-animate';

/** A fake `autoAnimate` that records how it was started and what it was told. */
function fakeAutoAnimate() {
  const controller = { enable: vi.fn(), disable: vi.fn(), isEnabled: vi.fn(() => true) };
  const start = vi.fn((_el: HTMLElement | SVGElement, _options?: unknown) => controller);
  return { start, controller };
}

@Component({
  imports: [AutoAnimateDirective],
  template: `<ul appAutoAnimate [appAutoAnimateDisabled]="off()" data-testid="list">
    @for (item of items(); track item) {
      <li>{{ item }}</li>
    }
  </ul>`,
})
class Host {
  readonly items = signal(['a', 'b']);
  readonly off = signal(false);
}

@Component({ imports: [AutoAnimateDirective], template: `<div [appAutoAnimate]="{ duration: 500 }"></div>` })
class HostWithOptions {}

function setup(fake = fakeAutoAnimate()) {
  TestBed.configureTestingModule({ providers: [{ provide: AUTO_ANIMATE, useValue: fake.start }] });
  const fixture = TestBed.createComponent(Host);
  return { fixture, ...fake };
}

describe('AutoAnimateDirective', () => {
  it('starts on its container once the page is drawn, with the defaults and without overriding reduced motion', async () => {
    const { fixture, start } = setup();
    expect(start).not.toHaveBeenCalled();
    await fixture.whenStable();
    expect(start).toHaveBeenCalledTimes(1);
    const [el, options] = start.mock.calls[0];
    expect((el as HTMLElement).tagName).toBe('UL');
    expect(options).toEqual({});
  });

  it('hands over the options it is given', async () => {
    const fake = fakeAutoAnimate();
    TestBed.configureTestingModule({ providers: [{ provide: AUTO_ANIMATE, useValue: fake.start }] });
    const fixture = TestBed.createComponent(HostWithOptions);
    await fixture.whenStable();
    expect(fake.start.mock.calls[0][1]).toEqual({ duration: 500 });
  });

  it('turns the animations off and on with its input', async () => {
    const { fixture, controller } = setup();
    await fixture.whenStable();
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    expect(controller.disable).toHaveBeenCalled();
    controller.enable.mockClear();
    fixture.componentInstance.off.set(false);
    await fixture.whenStable();
    expect(controller.enable).toHaveBeenCalled();
  });

  it('starts disabled when the input is already on', async () => {
    const fake = fakeAutoAnimate();
    TestBed.configureTestingModule({ providers: [{ provide: AUTO_ANIMATE, useValue: fake.start }] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.off.set(true);
    await fixture.whenStable();
    expect(fake.controller.disable).toHaveBeenCalled();
  });

  it('stops animating when its container is destroyed', async () => {
    const { fixture, controller } = setup();
    await fixture.whenStable();
    controller.disable.mockClear();
    fixture.destroy();
    expect(controller.disable).toHaveBeenCalledTimes(1);
  });
});

@Component({
  imports: [AutoAnimateDirective],
  template: `<div appAutoAnimate appAutoAnimateTarget="tbody" [appAutoAnimateDisabled]="off()" data-testid="host">
    @if (show()) {
      @for (n of tables(); track n) {
        <table data-testid="table"><tbody data-testid="body"></tbody></table>
      }
    }
    <p data-testid="other">{{ note() }}</p>
  </div>`,
})
class TargetHost {
  readonly show = signal(false);
  readonly tables = signal([1]);
  readonly off = signal(false);
  readonly note = signal('a');
}

describe('AutoAnimateDirective with a target', () => {
  /** Lets the page draw and the MutationObserver see what the change did. */
  const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
  };

  function setup() {
    const fake = fakeAutoAnimate();
    TestBed.configureTestingModule({ providers: [{ provide: AUTO_ANIMATE, useValue: fake.start }] });
    return { fixture: TestBed.createComponent(TargetHost), ...fake };
  }

  it('does not start while the target is not there, and starts on it as soon as it appears', async () => {
    const { fixture, start } = setup();
    await settle(fixture);
    expect(start).not.toHaveBeenCalled();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    expect(start).toHaveBeenCalledTimes(1);
    const [el] = start.mock.calls[0];
    expect((el as HTMLElement).tagName).toBe('TBODY');
  });

  it('starts once on a target that is already there', async () => {
    const { fixture, start } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('ignores other changes of the container, so it does not start again', async () => {
    const { fixture, start } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    fixture.componentInstance.note.set('b');
    await settle(fixture);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts on the new target when it is replaced, and stops what it had on the old one', async () => {
    const { fixture, start, controller } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    controller.disable.mockClear();
    fixture.componentInstance.tables.set([2]);
    await settle(fixture);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][0]).not.toBe(start.mock.calls[0][0]);
    expect(controller.disable).toHaveBeenCalled();
  });

  it('stops when the target goes away', async () => {
    const { fixture, controller } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    controller.disable.mockClear();
    fixture.componentInstance.show.set(false);
    await settle(fixture);
    expect(controller.disable).toHaveBeenCalled();
  });

  it('turns off and on with its input', async () => {
    const { fixture, controller } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    fixture.componentInstance.off.set(true);
    await settle(fixture);
    expect(controller.disable).toHaveBeenCalled();
    controller.enable.mockClear();
    fixture.componentInstance.off.set(false);
    await settle(fixture);
    expect(controller.enable).toHaveBeenCalled();
  });

  it('stops watching and animating when its container is destroyed', async () => {
    const { fixture, start, controller } = setup();
    fixture.componentInstance.show.set(true);
    await settle(fixture);
    controller.disable.mockClear();
    fixture.destroy();
    expect(controller.disable).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

