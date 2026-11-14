import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor, type Doc } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

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

const retitle = (doc: Doc, title: string): Doc => ({ ...doc, design: { ...doc.design, title } as Doc['design'] });

const KEY = 'motion-edit:draft:sample-piece';

/** Opens the sample piece; `draftOf` makes the draft kept in the browser from the document the server has. */
async function setup(draftOf?: (server: Doc) => Doc, baseOf?: (server: Doc) => Doc) {
  const storage = stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  const server: Doc = { design: piece.design.design, script: piece.script };
  if (draftOf) storage.setItem(KEY, JSON.stringify({ doc: draftOf(server), base: baseOf ? baseOf(server) : server, at: Date.UTC(2026, 10, 9, 10, 30) }));
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
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = (check: () => void, timeout = 3000) =>
    vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout },
    );
  const page = fixture.componentInstance as unknown as {
    store(): { apply(fn: (d: Doc) => Doc): void; doc(): Doc };
  };
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
  await settle(() => expect(el.querySelector('lab-motion-timeline')).not.toBeNull());
  return { storage, server, page, q, settle };
}

describe('EditorPage, draft kept in the browser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps what is being edited a few seconds after the last change', async () => {
    const { storage, page, settle } = await setup();
    expect(storage.getItem(KEY)).toBeNull();
    page.store().apply((d) => retitle(d, 'Mi borrador'));
    expect(storage.getItem(KEY)).toBeNull();
    await settle(() => expect(JSON.parse(storage.getItem(KEY)!).doc.design.title).toBe('Mi borrador'), 6000);
  }, 10000);

  it('offers a draft from an earlier visit, and restores it as one step to undo', async () => {
    const { page, q, settle } = await setup((s) => retitle(s, 'De antes'));
    await settle(() => expect(q('draft-found')).not.toBeNull());
    expect(q('draft-found')!.textContent).toContain('unsaved draft');
    expect(q('dirty')).toBeNull();
    q('draft-restore')!.click();
    await settle(() => expect(q('draft-found')).toBeNull());
    expect(page.store().doc().design).toMatchObject({ title: 'De antes' });
    expect(q('dirty')).not.toBeNull();
    q('undo')!.click();
    await settle(() => expect(q('dirty')).toBeNull());
  });

  it('says what the draft changes, and warns when the server moved on since', async () => {
    const first = await setup((s) => retitle(s, 'De antes'));
    await first.settle(() => expect(first.q('draft-found')).not.toBeNull());
    expect(first.q('draft-changes')!.textContent).toContain('It changes the design.');
    expect(first.q('draft-moved')).toBeNull();
    TestBed.resetTestingModule();
    const moved = await setup((s) => retitle(s, 'De antes'), (s) => retitle(s, 'Otro origen'));
    await moved.settle(() => expect(moved.q('draft-moved')).not.toBeNull());
  });

  it('forgets a draft that is dismissed, and one that already is what the server has', async () => {
    const first = await setup((s) => retitle(s, 'Otro'));
    await first.settle(() => expect(first.q('draft-found')).not.toBeNull());
    first.q('draft-dismiss')!.click();
    await first.settle(() => expect(first.q('draft-found')).toBeNull());
    expect(first.storage.getItem(KEY)).toBeNull();
    TestBed.resetTestingModule();
    const second = await setup((s) => s);
    expect(second.q('draft-found')).toBeNull();
    expect(second.storage.getItem(KEY)).toBeNull();
  });

  it('forgets the draft when the changes are saved', async () => {
    const { storage, page, q, settle } = await setup();
    page.store().apply((d) => retitle(d, 'Guardada'));
    await settle(() => expect(storage.getItem(KEY)).not.toBeNull(), 6000);
    await settle(() => expect(q('save')!.disabled).toBe(false));
    q('save')!.click();
    await settle(() => expect(q('saved')).not.toBeNull());
    await settle(() => expect(storage.getItem(KEY)).toBeNull());
  }, 15000);
});
