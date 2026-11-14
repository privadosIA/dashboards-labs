import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { PartPreview } from './part-preview';

@Component({ imports: [PartPreview], template: '<app-part-preview [manifest]="manifest()" [fragment]="fragment()" />' })
class Host {
  manifest = signal('{"name":"bars","params":[{"name":"n","type":"int","default":3}]}');
  fragment = signal('<div>{{n}}</div><script>window.__partSeek=function(){};</script>');
}

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};
const get = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

async function create(lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }] });
  const fixture = TestBed.createComponent(Host);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('PartPreview', () => {
  it('shows only the button until it is pressed', async () => {
    const { el } = await create();
    expect(get(el, 'preview-button')!.textContent).toContain('Preview');
    expect(get(el, 'preview-frame')).toBeNull();
  });

  it('plays the text that is there when the button is pressed, in a frame that is sandboxed with scripts and nothing else, and says it is an approximation', async () => {
    const { fixture, el } = await create();
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    const frame = get(el, 'preview-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.srcdoc).toContain('<div>3</div>');
    expect(get(el, 'preview-note')!.textContent).toContain('approximation');
  });

  it('plays a changed text only when pressed again: the frame keeps what it played', async () => {
    const { fixture, el, host } = await create();
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    host.fragment.set('<p>changed</p>');
    await settle(fixture);
    expect((get(el, 'preview-frame') as HTMLIFrameElement).srcdoc).toContain('<div>3</div>');
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect((get(el, 'preview-frame') as HTMLIFrameElement).srcdoc).toContain('<p>changed</p>');
  });

  it('says what is wrong with a text that cannot be played and shows no frame', async () => {
    const { fixture, el, host } = await create();
    host.manifest.set('not json');
    await settle(fixture);
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'preview-problem')!.textContent).toContain('manifest.json: it is not valid JSON');
    expect(get(el, 'preview-frame')).toBeNull();
  });

  it('shows what the part\'s own script reports, and takes it away when the part is played again', async () => {
    const { fixture, el } = await create();
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    const frame = get(el, 'preview-frame') as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'part-error', message: 'x is not defined' }, source: frame.contentWindow }));
    await settle(fixture);
    expect(get(el, 'preview-problem')!.textContent).toContain('x is not defined');
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get(el, 'preview-problem')).toBeNull();
  });

  it('ignores a message that does not come from its own frame', async () => {
    const { fixture, el } = await create();
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'part-error', message: 'someone else' }, source: window }));
    await settle(fixture);
    expect(get(el, 'preview-problem')).toBeNull();
  });

  it('pauses and resumes: the frame is told and the button says what it does next', async () => {
    const { fixture, el } = await create();
    (get(el, 'preview-button') as HTMLButtonElement).click();
    await settle(fixture);
    const frame = get(el, 'preview-frame') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    expect(get(el, 'preview-toggle')!.textContent).toContain('Pause');
    (get(el, 'preview-toggle') as HTMLButtonElement).click();
    await settle(fixture);
    expect(post).toHaveBeenLastCalledWith({ type: 'pause' }, '*');
    expect(get(el, 'preview-toggle')!.textContent).toContain('Resume');
    (get(el, 'preview-toggle') as HTMLButtonElement).click();
    expect(post).toHaveBeenLastCalledWith({ type: 'play' }, '*');
  });

  it('is in Spanish when the host is', async () => {
    const { el } = await create('es');
    expect(get(el, 'preview-button')!.textContent).toContain('Previsualizar');
  });
});
