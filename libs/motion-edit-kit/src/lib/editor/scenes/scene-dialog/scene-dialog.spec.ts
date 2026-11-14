import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ASSIST_OPTIONS, ASSIST_PROVIDERS, MemoryProviders } from '@lab/assist-kit';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';
import { AnimationFailure, type DraftInput } from '@lab/animation-core';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { stubStorage } from '../../../../testing/memory-storage';
import { SceneDialog, type SceneApproved } from './scene-dialog';

/** The dialog on the in-memory adapter (drafts written in 300 ms) for a block of a piece it has made. */
async function create(options: { lang?: 'es' | 'en'; reviewing?: boolean; edit?: boolean } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ writeMs: 300, pollMs: 10 });
  const asked: DraftInput[] = [];
  const ask = port.askDraft.bind(port);
  port.askDraft = (input) => (asked.push(input), ask(input));
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang } },
      { provide: ASSIST_OPTIONS, useValue: { lang } },
      { provide: ASSIST_PROVIDERS, useValue: new MemoryProviders(() => of(['qwen3:8b'])) },
      provideLabForms({ lang }),
      provideServerConnection({ lang }),
      { provide: ANIMATION, useValue: port },
    ],
  });
  const fixture: ComponentFixture<SceneDialog> = TestBed.createComponent(SceneDialog);
  const target = { scriptPiece: piece.script.pieces[0].id, label: piece.script.pieces[0].id };
  fixture.componentRef.setInput('piece', piece.id);
  fixture.componentRef.setInput('target', target);
  fixture.componentRef.setInput('reviewing', options.reviewing ?? true);
  let part = '';
  if (options.edit) {
    // a scene already approved: Edit scene reads and replaces its texts
    const d = await firstValueFrom(port.askDraft({ request: '', scene: { piece: piece.id, scriptPiece: target.scriptPiece } }));
    await vi.waitFor(async () => expect((await firstValueFrom(port.draft(d.id))).state).toBe('ready'), { timeout: 3000 });
    part = (await firstValueFrom(port.approveDraft(d.id))).name;
    fixture.componentRef.setInput('editPart', part);
  }
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const approved: SceneApproved[] = [];
  fixture.componentInstance.approved.subscribe((a) => approved.push(a));
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = (check: () => void) =>
    vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 4000 },
    );
  return { fixture, el, port, piece, target, q, settle, asked, approved, part };
}

describe('SceneDialog', () => {
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

  it('asks for a scene for the block with the idea and the review, shows the draft with its review and approves it into the block', async () => {
    const { q, settle, asked, approved, piece, target, el } = await create();
    expect(q('scene-dialog')!.getAttribute('aria-label')).toBe(`Scene for ${target.label}`);
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'a door that opens';
    (el.querySelector('textarea') as HTMLTextAreaElement).dispatchEvent(new Event('input'));
    await settle(() => expect((q('scene-ask') as HTMLButtonElement).disabled).toBe(false));
    q('scene-ask')!.click();
    await settle(() => expect(q('draft')).not.toBeNull());
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ request: '', scene: { piece: piece.id, scriptPiece: target.scriptPiece, brief: 'a door that opens' }, review: { min: 7, attempts: 2 } });
    await settle(() => expect(q('draft-state')!.textContent).toContain('Ready'));
    expect(q('draft-brief')!.textContent).toContain('a door that opens');
    expect(q('draft-review-score')!.textContent).toMatch(/\d+ of 10/);
    expect(q('draft-review-notes')).not.toBeNull();
    await settle(() => expect((q('draft-approve') as HTMLButtonElement).disabled).toBe(false));
    q('draft-approve')!.click();
    await settle(() => expect(approved).toHaveLength(1));
    expect(approved[0].scriptPiece).toBe(target.scriptPiece);
    expect(approved[0].part).toMatch(/\S/);
    await settle(() => expect(q('scene-done')!.textContent).toContain(approved[0].part));
  });

  it('asks for no review when the server has none: no review settings, and the request says so', async () => {
    const { q, settle, asked, el } = await create({ reviewing: false });
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    expect(el.textContent).not.toContain('Minimum score');
    q('scene-ask')!.click();
    await settle(() => expect(q('draft')).not.toBeNull());
    expect(asked[0].review).toBe(false);
    expect(asked[0].scene).toBeDefined();
    expect(asked[0].scene!.brief).toBeUndefined();
  });

  it('goes back to the idea with Ask again, which keeps what was written', async () => {
    const { q, settle, el } = await create();
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    const brief = el.querySelector('textarea') as HTMLTextAreaElement;
    brief.value = 'rain on glass';
    brief.dispatchEvent(new Event('input'));
    await settle(() => expect((q('scene-ask') as HTMLButtonElement).disabled).toBe(false));
    q('scene-ask')!.click();
    await settle(() => expect(q('draft')).not.toBeNull());
    q('scene-again')!.click();
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('rain on glass');
  });

  it("shows the server's reason when it refuses the scene, and stays on the idea", async () => {
    const { q, settle, port } = await create();
    port.askDraft = () => throwError(() => new AnimationFailure('unavailable', 'there is no assistant to write with'));
    await settle(() => expect(q('scene-ask')).not.toBeNull());
    q('scene-ask')!.click();
    await settle(() => expect(q('scene-refused')!.textContent).toContain('there is no assistant to write with'));
    expect(q('draft')).toBeNull();
    expect((q('scene-ask') as HTMLButtonElement).disabled).toBe(false);
  });

  it("edits the texts of a scene: reads them, saves them whole, and says the server's problems when it refuses them", async () => {
    const { q, settle, port, part, fixture } = await create({ edit: true });
    const edited: string[] = [];
    fixture.componentInstance.edited.subscribe((n) => edited.push(n));
    await settle(() => expect((q('scene-manifest') as HTMLTextAreaElement | null)?.value).toContain(part));
    expect((q('scene-fragment') as HTMLTextAreaElement).value).not.toBe('');
    const fragment = q('scene-fragment') as HTMLTextAreaElement;
    fragment.value = `${fragment.value}\n<!-- changed -->`;
    fragment.dispatchEvent(new Event('input'));
    q('scene-save')!.click();
    await settle(() => expect(q('scene-saved')!.textContent).toContain(part));
    expect(edited).toEqual([part]);
    expect((await firstValueFrom(port.partText(part))).fragment).toContain('<!-- changed -->');
    const manifest = q('scene-manifest') as HTMLTextAreaElement;
    manifest.value = '{ not json';
    manifest.dispatchEvent(new Event('input'));
    q('scene-save')!.click();
    await settle(() => expect(q('scene-problems')).not.toBeNull());
    expect(q('scene-saved')).toBeNull();
    expect(edited).toEqual([part]);
  });
});
