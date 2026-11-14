import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { EditorPage } from './editor.page';

class FakeAudio {
  currentTime = 0;
  paused = true;
  constructor(public src: string) {}
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

/** The sample piece, whose second piece draws `counter`, the part the in-memory server lets animate `to` and `speed`. */
async function setup() {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 40 });
  await firstValueFrom(port.loadSample());
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang: 'en' }),
      provideLabForms({ lang: 'en' }),
      provideMotionParts({ lang: 'en' }),
      provideMotionEditor({ lang: 'en' }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'sample-piece' })), queryParamMap: of(convertToParamMap({})) } },
      { provide: AUDIO_FACTORY, useValue: (src: string) => new FakeAudio(src) },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) => {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 3000 },
    );
  };
  await settle(() => expect(el.querySelector('lab-motion-timeline')).not.toBeNull());
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, el, port, q, settle };
}

describe('EditorPage, a new part', () => {
  beforeAll(() => {
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('makes a part in the window, approves it, and finds it in the library at once, with a notice, without reloading', async () => {
    const { el, q, settle, fixture } = await setup();
    expect(q('new-part-open')).not.toBeNull();
    q('new-part-open')!.click();
    await settle(() => expect(q('new-part-request')).not.toBeNull());
    const field = q('new-part-request') as HTMLTextAreaElement;
    field.value = 'a row of bars that jump on the beat';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    q('new-part-ask')!.click();
    await settle(() => expect(q('draft-pictures')).not.toBeNull());
    const name = (JSON.parse((q('draft-manifest') as HTMLTextAreaElement).value) as { name: string }).name;
    expect(el.querySelector(`lab-parts-palette [data-part="${name}"]`)).toBeNull();
    q('draft-approve')!.click();
    await settle(() => expect(el.querySelector(`lab-parts-palette [data-part="${name}"]`)).not.toBeNull());
    expect(q('notice')!.textContent).toContain(`The part "${name}" is in the library`);
    expect(el.querySelector(`lab-parts-palette [data-part="${name}"] .badge`)).not.toBeNull();
    expect((q('new-part') as HTMLDialogElement).hasAttribute('open')).toBe(false);
  });
});
