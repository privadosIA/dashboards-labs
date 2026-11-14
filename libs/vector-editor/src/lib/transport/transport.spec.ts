import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { sampleDocument } from '../../testing/sample-document';
import { provideVectorEditor } from '../provide-vector-editor';
import { VectorStore } from '../store/vector-store';
import { VectorTransport } from './transport';

function setup(lang: 'es' | 'en' = 'en') {
  const store = new VectorStore(sampleDocument());
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang })] });
  const fixture: ComponentFixture<VectorTransport> = TestBed.createComponent(VectorTransport);
  fixture.componentRef.setInput('store', store);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
  const click = (id: string): void => {
    q(id).click();
    fixture.detectChanges();
  };
  return { store, fixture, el, q, click };
}

describe('lab-vector-transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('labels its buttons in the dashboard’s language, and the play button says what it will do', () => {
    const { q, click } = setup('es');
    expect(q('play').getAttribute('aria-label')).toBe('Reproducir');
    expect(q('to-start').getAttribute('aria-label')).toBe('Al principio');
    click('play');
    expect(q('play').getAttribute('aria-label')).toBe('Pausar');
    expect(q('play').getAttribute('aria-pressed')).toBe('true');
  });

  it('plays and pauses through the store', () => {
    const { store, click } = setup();
    click('play');
    expect(store.playing()).toBe(true);
    click('play');
    expect(store.playing()).toBe(false);
  });

  it('goes to the start and the end and steps a frame', () => {
    const { store, click } = setup();
    click('to-end');
    expect(store.playhead()).toBe(4);
    click('step-back');
    expect(store.playhead()).toBeCloseTo(4 - 1 / 30, 6);
    click('to-start');
    expect(store.playhead()).toBe(0);
    click('step-forward');
    expect(store.playhead()).toBeCloseTo(1 / 30, 6);
  });

  it('switches the loop and the frame rate', () => {
    const { store, q, click, fixture } = setup();
    expect(q('loop').getAttribute('aria-pressed')).toBe('true');
    click('loop');
    expect(store.loop()).toBe(false);
    expect(q('loop').getAttribute('aria-pressed')).toBe('false');
    const fps = q<HTMLSelectElement>('fps');
    fps.value = '60';
    fps.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(store.doc().fps).toBe(60);
    expect(q('time').textContent).toContain('0.00 / 4.00 s');
  });

  it('moves the playhead by the time between frames, looping at the end', () => {
    const { store, fixture } = setup();
    store.play();
    const t = fixture.componentInstance;
    t.tick(1000);
    t.tick(1500);
    expect(store.playhead()).toBeCloseTo(0.5, 6);
    store.seek(3.9);
    t.tick(2000);
    expect(store.playhead()).toBeCloseTo(0.4, 6);
    expect(store.playing()).toBe(true);
  });

  it('pauses at the end when it does not loop', () => {
    const { store, fixture } = setup();
    store.loop.set(false);
    store.play();
    store.seek(3.9);
    const t = fixture.componentInstance;
    t.tick(1000);
    t.tick(2000);
    expect(store.playhead()).toBe(4);
    expect(store.playing()).toBe(false);
  });

  it('runs on the browser’s animation frames while it plays, and stops when it pauses', () => {
    // Angular asks for animation frames too: every callback is run, and what counts is where the playhead went.
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const { store, fixture } = setup();
    const frame = (now: number): void => callbacks.splice(0).forEach((cb) => cb(now));
    store.play();
    fixture.detectChanges();
    frame(1000);
    frame(1250);
    expect(store.playhead()).toBeCloseTo(0.25, 6);
    store.pause();
    fixture.detectChanges();
    frame(1500);
    frame(1750);
    expect(store.playhead()).toBeCloseTo(0.25, 6);
  });

  it('plays and pauses with Space when no field has the focus, and leaves Space to a field or a button', () => {
    const { store, fixture } = setup();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(store.playing()).toBe(true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(store.playing()).toBe(true);
    input.remove();
    const button = fixture.nativeElement.querySelector('[data-testid="loop"]') as HTMLElement;
    document.body.appendChild(fixture.nativeElement);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(store.playing()).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(store.playing()).toBe(false);
    fixture.nativeElement.remove();
  });
});
