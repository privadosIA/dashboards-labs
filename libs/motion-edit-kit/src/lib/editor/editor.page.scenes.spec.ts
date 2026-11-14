import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { ASSIST_OPTIONS, ASSIST_PROVIDERS, MemoryProviders } from '@lab/assist-kit';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { MOTION_EDIT_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { MONACO } from './code/code-pane/code-pane';
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

async function setup(features?: readonly string[]) {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 40, ...(features ? { features } : {}) });
  await firstValueFrom(port.loadSample());
  TestBed.configureTestingModule({
    providers: [
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } },
      { provide: ASSIST_OPTIONS, useValue: { lang: 'en' } },
      { provide: ASSIST_PROVIDERS, useValue: new MemoryProviders(() => of(['qwen3:8b'])) },
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
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = (check: () => void) =>
    vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 4000 },
    );
  const select = (piece: string) => (fixture.componentInstance as unknown as { selection: { set(s: { piece: string }): void } }).selection.set({ piece });
  return { fixture, el, port, q, settle, select };
}

describe('EditorPage, scenes', () => {
  beforeAll(() => {
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes a scene for the chosen block and, on Approve, puts it as the block\'s part: the editor is dirty and the script on the server is not touched', async () => {
    const { q, settle, select, port, fixture } = await setup();
    await settle(() => expect(q('strip-write')).not.toBeNull());
    const before = await firstValueFrom(port.piece('sample-piece'));
    select('p1');
    await settle(() => expect(q('scene-write')).not.toBeNull());
    expect(q('dirty')).toBeNull();
    q('scene-write')!.click();
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    q('scene-ask')!.click();
    await settle(() => expect((q('draft-approve') as HTMLButtonElement | null)?.disabled).toBe(false));
    q('draft-approve')!.click();
    await settle(() => expect(q('dirty')).not.toBeNull());
    await settle(() => expect(q('scene-badge')).not.toBeNull());
    const doc = (fixture.componentInstance as unknown as { doc: () => { script: { pieces: { id: string; part: string }[] } } }).doc();
    const part = doc.script.pieces.find((p) => p.id === 'p1')!.part;
    expect(part).not.toBe(before.script.pieces.find((p) => p.id === 'p1')!.part);
    expect(q('scene-badge')!.textContent).toContain('scene');
    // the server still has the old part until Save
    expect((await firstValueFrom(port.piece('sample-piece'))).script.pieces.find((p) => p.id === 'p1')!.part).toBe(before.script.pieces.find((p) => p.id === 'p1')!.part);
  });

  it('shows no scene control at all when the catalog lacks the feature', async () => {
    const { q, settle, select, el } = await setup(['animate', 'layers']);
    await settle(() => expect(el.querySelector('app-inspector')).not.toBeNull());
    select('p1');
    await settle(() => expect(q('piece')).not.toBeNull());
    expect(q('scene-write')).toBeNull();
    expect(q('strip-write')).toBeNull();
    expect(el.querySelector('app-scenes-strip')).toBeNull();
  });

  it('reviews the piece: marks on the blocks, the notes in the inspector of the block, and a note chosen in the panel selects its block', async () => {
    const { q, el, settle, fixture } = await setup();
    await settle(() => expect(q('review-start')).not.toBeNull());
    q('review-start')!.click();
    await settle(() => expect(q('review-done')).not.toBeNull());
    await settle(() => expect(el.querySelectorAll('[data-testid="grade-mark"]').length).toBeGreaterThan(0));
    const marks = Array.from(el.querySelectorAll('[data-testid="grade-mark"]'));
    expect(marks.every((m) => ['pass', 'weak', 'fail'].includes(m.getAttribute('data-verdict')!))).toBe(true);
    // the panel opens by itself when the review starts
    await settle(() => expect(q('review-body')).not.toBeNull());
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="review-scene"]'));
    rows.at(-1)!.click();
    await settle(() => expect(q('piece-review')).not.toBeNull());
    const selection = (fixture.componentInstance as unknown as { selection: () => { piece: string } | null }).selection();
    expect(q('piece')!.textContent).toContain(selection!.piece);
    expect(q('piece-review')!.textContent).toMatch(/\d+ \/ 10/);
  });

  it('draws no review control when the catalog lacks the review feature', async () => {
    const { q, settle, el } = await setup(['animate', 'layers', 'scene']);
    await settle(() => expect(el.querySelector('app-inspector')).not.toBeNull());
    expect(q('review-start')).toBeNull();
    expect(el.querySelector('app-review-panel')).toBeNull();
  });
});
