import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';
import { AnimationFailure, type PieceReview } from '@lab/animation-core';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { stubStorage } from '../../../../testing/memory-storage';
import { ReviewPanel } from './review-panel';

async function create(options: { lang?: 'es' | 'en'; review?: PieceReview } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ stepMs: 50, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, { provide: ANIMATION, useValue: port }] });
  const fixture: ComponentFixture<ReviewPanel> = TestBed.createComponent(ReviewPanel);
  fixture.componentRef.setInput('piece', piece.id);
  if (options.review) fixture.componentRef.setInput('review', options.review);
  const changes: PieceReview[] = [];
  const selected: string[] = [];
  fixture.componentInstance.changed.subscribe((r) => {
    changes.push(r);
    fixture.componentRef.setInput('review', r);
  });
  fixture.componentInstance.select.subscribe((id) => selected.push(id));
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
  return { fixture, el, port, piece, q, settle, changes, selected };
}

describe('ReviewPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says it has not been reviewed, runs the review and reports it while it advances and when it is done', async () => {
    const { q, settle, changes, piece } = await create();
    expect(q('review-none')!.textContent).toContain('Not reviewed yet');
    q('review-start')!.click();
    await settle(() => expect(q('review-done')).not.toBeNull());
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.at(-1)!.state).toBe('done');
    expect(changes.at(-1)!.scenes).toHaveLength(piece.script.pieces.length);
    expect(q('review-overall')!.textContent).toMatch(/As a whole: \d+ of 10/);
    expect((q('review-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('lists every block with its grade and notes, the overall notes and the repeated metaphors, and choosing one selects its block', async () => {
    const review: PieceReview = {
      state: 'done',
      scenes: [
        { scriptPiece: 'p1', score: 3, verdict: 'fail', notes: ['two accents'] },
        { scriptPiece: 'p2', score: 8, notes: [] },
      ],
      overall: { score: 6, notes: ['too many doors'], repeated: [['p3', 'p4']] },
    };
    const { q, el, settle, selected } = await create({ review });
    q('review-toggle')!.click();
    await settle(() => expect(q('review-body')).not.toBeNull());
    expect(q('review-overall-notes')!.textContent).toContain('too many doors');
    expect(q('review-repeated')!.textContent).toContain('p3, p4');
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-testid="review-scene"]'));
    expect(rows.map((r) => r.getAttribute('data-verdict'))).toEqual(['fail', 'pass']);
    expect(rows[0].textContent).toContain('two accents');
    expect(rows[1].textContent).toContain('No notes');
    rows[0].click();
    expect(selected).toEqual(['p1']);
  });

  it('shows the server\'s reason when it cannot review, and a failed review says why', async () => {
    const { q, settle, port, fixture } = await create();
    port.reviewPiece = () => throwError(() => new AnimationFailure('unavailable', 'there is no vision model'));
    q('review-start')!.click();
    await settle(() => expect(q('review-refused')!.textContent).toContain('there is no vision model'));
    fixture.componentRef.setInput('review', { state: 'failed', scenes: [], error: 'the model died' } satisfies PieceReview);
    await settle(() => expect(q('review-failed')!.textContent).toContain('the model died'));
  });

  it('follows a review that was still running when the piece opened, and reports what it brings', async () => {
    const { q, port, piece, settle, changes } = await create();
    await firstValueFrom(port.reviewPiece(piece.id));
    const follow = vi.spyOn(port, 'followReview');
    const { fixture } = await createRunning(port, piece.id);
    expect(follow).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="review-running"]')).not.toBeNull();
    expect(q('review-panel')).not.toBeNull();
    await settle(() => expect(changes).toBeDefined());
  });
});

/** A second panel over the same port, whose review is `running` as when a piece is opened in the middle of one. */
async function createRunning(port: InMemoryAnimation, piece: string) {
  const fixture = TestBed.createComponent(ReviewPanel);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('review', { state: 'running', scenes: [] } satisfies PieceReview);
  fixture.detectChanges();
  return { fixture, port };
}
