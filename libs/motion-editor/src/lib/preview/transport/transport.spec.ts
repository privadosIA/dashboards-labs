import { TestBed } from '@angular/core/testing';

import { MOTION_EDITOR_LANG } from '../../provide-motion-editor';
import { beatAt, timeText } from '../beat-at';
import { PreviewClock } from '../clock';
import { SONG_MAP } from '../test-data';
import { Transport } from './transport';

const key = (key: string, extra: Partial<KeyboardEvent> = {}) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...extra }) as KeyboardEvent;

function setup(audio = false, lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: lang }] });
  const clock = new PreviewClock({ scheduler: { request: () => 1, cancel: () => undefined, now: () => 0 } });
  clock.configure(20, 30, audio ? ({ currentTime: 0, paused: true, src: '', play: () => Promise.resolve(), pause: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined } as never) : null);
  const fixture = TestBed.createComponent(Transport);
  fixture.componentRef.setInput('clock', clock);
  fixture.componentRef.setInput('songMap', SONG_MAP);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (label: string) => {
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent!.trim() === label)!;
    button.click();
    fixture.detectChanges();
  };
  return { fixture, clock, el, click, press: (e: KeyboardEvent) => { el.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, shiftKey: e.shiftKey, bubbles: true, cancelable: true })); fixture.detectChanges(); } };
}

describe('beatAt and timeText', () => {
  it('give the beat and the section under a time, and the time as m:ss.mmm', () => {
    expect(beatAt(SONG_MAP, 0.2)).toEqual({ number: -1, section: 'Verse' });
    expect(beatAt(SONG_MAP, 1.7)).toEqual({ number: 2, section: 'Verse' });
    expect(beatAt(SONG_MAP, 20)).toEqual({ number: 5, section: 'Chorus' });
    expect(beatAt({ ...SONG_MAP, beatBase: 4 }, 1.7).number).toBe(6);
    expect(timeText(65.4321)).toBe('1:05.432');
    expect(timeText(-1)).toBe('0:00.000');
  });
});

describe('Transport', () => {
  it('plays and pauses with its button, which changes its label', () => {
    const { clock, click, el } = setup();
    click('Play');
    expect(clock.playing()).toBe(true);
    expect(el.querySelector('button[aria-label="Pause"]')).not.toBeNull();
    click('Pause');
    expect(clock.playing()).toBe(false);
  });

  it('steps one frame, and goes to the start and the end', () => {
    const { clock, click } = setup();
    clock.seek(10);
    click('One frame forward');
    expect(clock.time()).toBeCloseTo(10.0333, 3);
    click('One frame back');
    expect(clock.time()).toBeCloseTo(10, 6);
    click('To the end');
    expect(clock.time()).toBe(20);
    click('To the start');
    expect(clock.time()).toBe(0);
  });

  it('shows the time, the beat and the section, and the quantise switch', () => {
    const { clock, fixture, el, click } = setup();
    clock.seek(1.7);
    fixture.detectChanges();
    const text = el.textContent!;
    expect(text).toContain('0:01.700 / 0:20.000');
    expect(text).toContain('Verse');
    expect(el.querySelector('.readout div:nth-child(2) dd')!.textContent).toBe('2');
    click('Snap to frames');
    expect(clock.snapToFrames()).toBe(true);
  });

  it('has a seek bar that follows the clock and moves it when dragged', () => {
    const { clock, el, fixture } = setup();
    const bar = el.querySelector('.seek') as HTMLInputElement;
    expect(bar.max).toBe('20');
    expect(bar.getAttribute('aria-label')).toBe('Position in the song');
    clock.seek(7.5);
    fixture.detectChanges();
    expect(bar.value).toBe('7.5');
    bar.value = '12.25';
    bar.dispatchEvent(new Event('input'));
    expect(clock.time()).toBe(12.25);
  });

  it('says there is no audio only when there is none, in the language of the dashboard', () => {
    expect(setup(false).el.querySelector('.hint')!.textContent).toContain('no audio');
    TestBed.resetTestingModule();
    expect(setup(true).el.querySelector('.hint')).toBeNull();
    TestBed.resetTestingModule();
    expect(setup(false, 'es').el.querySelector('.hint')!.textContent).toContain('no tiene audio');
  });

  it('answers the keys: Space, Home, End, the arrows and Shift+arrows', () => {
    const { clock, press } = setup();
    clock.seek(5);
    press(key('ArrowRight'));
    expect(clock.time()).toBeCloseTo(5.0333, 3);
    press(key('ArrowRight', { shiftKey: true }));
    expect(clock.time()).toBeCloseTo(6.0333, 3);
    press(key('ArrowLeft', { shiftKey: true }));
    expect(clock.time()).toBeCloseTo(5.0333, 3);
    press(key('End'));
    expect(clock.time()).toBe(20);
    press(key('Home'));
    expect(clock.time()).toBe(0);
    press(key(' '));
    expect(clock.playing()).toBe(true);
    press(key(' '));
    expect(clock.playing()).toBe(false);
  });
});
