import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { ASSIST_OPTIONS, ASSIST_PROVIDERS, MemoryProviders } from '@lab/assist-kit';
import type { SceneApproval, SceneInput } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { stubStorage } from '../../../../testing/memory-storage';
import { ScenesStrip, type PrepareApproval } from './scenes-strip';

/** The strip over a piece of the in-memory adapter, whose scenes are written in 40 ms each. */
async function create(options: { lang?: 'es' | 'en'; dirty?: boolean; prepare?: PrepareApproval } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ writeMs: 40, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  const started: SceneInput[] = [];
  const write = port.writeScenes.bind(port);
  port.writeScenes = (id, input) => (started.push(input ?? {}), write(id, input));
  let approvals = 0;
  const approve = port.approveScenes.bind(port);
  port.approveScenes = (id) => (approvals++, approve(id));
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
  const fixture: ComponentFixture<ScenesStrip> = TestBed.createComponent(ScenesStrip);
  fixture.componentRef.setInput('piece', piece.id);
  fixture.componentRef.setInput('dirty', options.dirty ?? false);
  if (options.prepare) fixture.componentRef.setInput('prepare', options.prepare);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const approved: SceneApproval[] = [];
  const opened: string[] = [];
  fixture.componentInstance.approved.subscribe((a) => approved.push(a));
  fixture.componentInstance.open.subscribe((d) => opened.push(d.scriptPiece));
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = (check: () => void) =>
    vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 5000 },
    );
  /** Starts the batch with the form as it opens and waits for it to be done. */
  const writeAll = async () => {
    q('strip-write')!.click();
    await settle(() => expect(q('strip-start')).not.toBeNull());
    await settle(() => expect((q('strip-start') as HTMLButtonElement).disabled).toBe(false));
    q('strip-start')!.click();
    await settle(() => expect(q('strip-state')!.textContent).toContain('Done'));
  };
  return { fixture, el, port, piece, q, settle, started, approved, opened, writeAll, approvals: () => approvals };
}

describe('ScenesStrip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes a scene for every block: progress, one card per block with its score, and Open names the block', async () => {
    const { q, el, writeAll, started, piece, opened, settle } = await create();
    expect(q('strip-progress')).toBeNull();
    await writeAll();
    expect(started).toEqual([{ briefMode: 'metaphor', review: { min: 7, attempts: 2 } }]);
    const total = piece.script.pieces.length;
    expect(q('strip-progress')!.textContent).toContain(`${total} of ${total} scenes`);
    expect(el.querySelectorAll('[data-testid="scene-card"]')).toHaveLength(total);
    await settle(() => expect(q('scene-card-score')).not.toBeNull());
    (el.querySelector('[data-testid="scene-card-open"]') as HTMLElement).click();
    expect(opened).toEqual([piece.script.pieces[0].id]);
  });

  it('can be stopped while it writes, and says that it stops after the scene being written', async () => {
    const { q, settle } = await create();
    q('strip-write')!.click();
    await settle(() => expect((q('strip-start') as HTMLButtonElement | null)?.disabled).toBe(false));
    q('strip-start')!.click();
    await settle(() => expect(q('strip-stop')).not.toBeNull());
    q('strip-stop')!.click();
    await settle(() => expect(q('strip-state')!.textContent).toMatch(/Stopped|Done/));
  });

  it('approves all that are ready on the server when the editor is clean, and tells the page', async () => {
    const { q, writeAll, approved, settle, approvals, piece } = await create();
    await writeAll();
    await settle(() => expect(q('strip-approve')).not.toBeNull());
    q('strip-approve')!.click();
    await settle(() => expect(approved).toHaveLength(1));
    expect(approved[0].approved.length).toBe(piece.script.pieces.length);
    expect(approvals()).toBe(1);
    await settle(() => expect(q('strip-approved')!.textContent).toContain('scenes put in the script'));
  });

  it('refuses to approve while the editor has unsaved changes: asks to save or discard, and nothing is approved until it is clean', async () => {
    const calls: string[] = [];
    const { q, writeAll, approved, settle, approvals, fixture } = await create({
      dirty: true,
      prepare: async (mode) => {
        calls.push(mode);
        return false;
      },
    });
    await writeAll();
    await settle(() => expect(q('strip-approve')).not.toBeNull());
    q('strip-approve')!.click();
    await settle(() => expect(q('strip-dirty')).not.toBeNull());
    expect(approvals()).toBe(0);
    q('strip-dirty-save')!.click();
    await settle(() => expect(q('strip-refused')!.textContent).toContain('nothing was approved'));
    expect(calls).toEqual(['save']);
    expect(approvals()).toBe(0);
    expect(approved).toEqual([]);
    // Not now closes the question
    q('strip-dirty-cancel')!.click();
    fixture.detectChanges();
    expect(q('strip-dirty')).toBeNull();
  });

  it('approves once the page has saved or discarded', async () => {
    const calls: string[] = [];
    const { q, writeAll, approved, settle, approvals } = await create({
      dirty: true,
      prepare: async (mode) => {
        calls.push(mode);
        return true;
      },
    });
    await writeAll();
    await settle(() => expect(q('strip-approve')).not.toBeNull());
    q('strip-approve')!.click();
    await settle(() => expect(q('strip-dirty-discard')).not.toBeNull());
    q('strip-dirty-discard')!.click();
    await settle(() => expect(approved).toHaveLength(1));
    expect(calls).toEqual(['discard']);
    expect(approvals()).toBe(1);
    expect(q('strip-dirty')).toBeNull();
  });
});
