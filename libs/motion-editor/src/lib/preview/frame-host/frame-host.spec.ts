import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { MOTION_EDITOR_LANG } from '../../provide-motion-editor';
import type { ScenePage } from '../page-source';
import { FrameHost } from './frame-host';

const page = (id: string, start: number, end: number, extra: Partial<ScenePage> = {}): ScenePage => ({ id, start, end, width: 1280, height: 720, html: `<p>${id}</p>`, fidelity: 'approximate', gaps: [{ kind: 'browser' }], ...extra });
const PAGES = [page('a', 0, 10), page('b', 10, 20, { gaps: [{ kind: 'browser' }, { kind: 'missing-part', name: 'glass-card' }] }), page('c', 20, 30)];

function setup(lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: lang }] });
  const fixture: ComponentFixture<FrameHost> = TestBed.createComponent(FrameHost);
  fixture.componentRef.setInput('pages', PAGES);
  fixture.componentRef.setInput('time', 0);
  fixture.detectChanges();
  const frames = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('iframe'));
  const posts: { k: number; data: unknown }[] = [];
  frames.forEach((f, k) => {
    // The frame is not really loaded here: a message goes to a recorder, and `load` is fired by hand.
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: (data: unknown) => posts.push({ k, data }) }, configurable: true });
  });
  const load = (k: number) => f(k).dispatchEvent(new Event('load'));
  const f = (k: number) => frames[k];
  const at = (t: number) => {
    fixture.componentRef.setInput('time', t);
    fixture.detectChanges();
  };
  return { fixture, el: fixture.nativeElement as HTMLElement, frames, posts, load, at };
}

describe('FrameHost', () => {
  it('ignores the load of the blank page a frame starts with', () => {
    TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: 'en' }] });
    const fixture = TestBed.createComponent(FrameHost);
    fixture.componentRef.setInput('pages', []);
    fixture.componentRef.setInput('time', 0);
    fixture.detectChanges();
    const frames = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('iframe'));
    expect(() => frames.forEach((f) => f.dispatchEvent(new Event('load')))).not.toThrow();
  });

  it('has the frames sandboxed with scripts and nothing else', () => {
    const { frames } = setup();
    expect(frames).toHaveLength(2);
    for (const f of frames) expect(f.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('loads the first scene and shows it', () => {
    const { frames } = setup();
    expect(frames[0].srcdoc).toBe('<p>a</p>');
    expect(frames[0].classList.contains('on')).toBe(true);
    expect(frames[1].classList.contains('on')).toBe(false);
  });

  it('posts the time of the scene, not of the song, once its frame has loaded', () => {
    const { posts, load, at } = setup();
    at(4);
    expect(posts).toEqual([]);
    load(0);
    expect(posts.at(-1)).toEqual({ k: 0, data: { type: 'seek', t: 4 } });
    at(5.5);
    expect(posts.at(-1)).toEqual({ k: 0, data: { type: 'seek', t: 5.5 } });
  });

  it('does not post the same time twice', () => {
    const { posts, load, at } = setup();
    load(0);
    at(3);
    at(3);
    expect(posts.filter((p) => (p.data as { t: number }).t === 3)).toHaveLength(1);
  });

  it('loads the next scene in the other frame near the cut, and shows it on the first frame after it', () => {
    const { frames, posts, load, at } = setup();
    load(0);
    at(8.5);
    expect(frames[1].srcdoc).toBe('<p>b</p>');
    expect(frames[1].classList.contains('on')).toBe(false);
    load(1);
    expect(posts.at(-1)).toEqual({ k: 1, data: { type: 'seek', t: 0 } });
    at(10.2);
    expect(frames[1].classList.contains('on')).toBe(true);
    expect(frames[0].classList.contains('on')).toBe(false);
    expect(posts.at(-1)!.k).toBe(1);
    expect((posts.at(-1)!.data as { t: number }).t).toBeCloseTo(0.2, 6); // the time of the scene, not of the song
    expect(frames[1].srcdoc).toBe('<p>b</p>');
  });

  it('reuses the frame of the scene that passed for the one after', () => {
    const { frames, load, at } = setup();
    load(0);
    at(8.5);
    load(1);
    at(10.2);
    at(18.5);
    expect(frames[0].srcdoc).toBe('<p>c</p>');
  });

  it('shows the approximate badge with the gaps of the scene on screen', () => {
    const { el, at } = setup();
    expect(el.querySelector('.badge')!.textContent).toContain('Approximate');
    expect(el.querySelector('.badge')!.textContent).toContain('Page built in the browser');
    at(12);
    expect(el.querySelector('.badge')!.textContent).toContain('Part "glass-card" is missing');
  });

  it('says the badge in Spanish', () => {
    const { el } = setup('es');
    expect(el.querySelector('.badge')!.textContent).toContain('Aproximado');
  });

  it('has no badge for an exact page, and says there is nothing to draw with no pages', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pages', [page('a', 0, 10, { fidelity: 'exact', gaps: [] })]);
    fixture.detectChanges();
    expect(el.querySelector('.badge')).toBeNull();
    fixture.componentRef.setInput('pages', []);
    fixture.detectChanges();
    expect(el.querySelector('.empty')!.textContent).toContain('Nothing to draw');
  });

  it('reloads a frame whose page changed', () => {
    const { fixture, frames } = setup();
    fixture.componentRef.setInput('pages', [page('a', 0, 10, { html: '<p>a2</p>' }), ...PAGES.slice(1)]);
    fixture.detectChanges();
    expect(frames[0].srcdoc).toBe('<p>a2</p>');
  });
});
