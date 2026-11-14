import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Finding, ReviewDetail, ReviewSummary } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { EnvironmentStore } from '../../core/environment.store';
import { ReviewPageComponent } from './review-page.component';

const FINDING: Finding = {
  id: 'f1',
  review_id: 'r1',
  scene: 's06_stand_up',
  kind: 'deformation',
  source: 'auto',
  from_seconds: 1.4,
  severity: 8,
  description: 'La cara se deforma',
  has_frame: true,
  fix: { kind: 'trim', params: { seconds: 1.4 } },
  status: 'pending',
  created_at: '2026-10-12T10:00:00Z',
};

const DETAIL: ReviewDetail = {
  review: { id: 'r1', project: 'demo', state: 'ready', total: 1, done: 1, created_at: '2026-10-12T10:00:00Z' },
  findings: [FINDING],
};

const SUMMARY: ReviewSummary = { ...DETAIL.review, findings: 1, pending: 1 };

describe('ReviewPageComponent', () => {
  const api = {
    getVisionModels: vi.fn(() => of({ models: ['qwen3.8:27b'] })),
    getConfig: vi.fn(() => of({ parsed: { scenes: [{ id: 's06_stand_up' }] } })),
    listReviews: vi.fn(() => of([SUMMARY])),
    getReview: vi.fn(() => of(DETAIL)),
    startReview: vi.fn(() => of(DETAIL.review)),
    patchFinding: vi.fn((_r: string, _f: string, body: object) => of({ ...FINDING, ...body })),
    runReviewTasks: vi.fn(() => of({ started: [{ finding_id: 'f1', run_id: 'run-9' }], skipped: [] })),
    createFinding: vi.fn(() => of(FINDING)),
    deleteReview: vi.fn(() => of(undefined)),
    deleteReviews: vi.fn(() => of({ deleted: 1, skipped_active: [] })),
    findingFrameUrl: vi.fn(() => '/frame.png'),
  };

  async function setup(confirm = true, availability: typeof ALL_AVAILABLE | null = ALL_AVAILABLE) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: EnvironmentStore, useValue: { ensureLoaded: async () => undefined, gpus: () => [] } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirm) }) } },
      ],
    });
    if (availability) TestBed.inject(AvailabilityStore).data.set(availability);
    const fixture = TestBed.createComponent(ReviewPageComponent);
    fixture.componentRef.setInput('id', 'demo');
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    }
    return fixture;
  }

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockClear());
  });

  it('opens the latest review and lists its findings with the fix', async () => {
    const f = await setup();
    const el: HTMLElement = f.nativeElement;
    expect(api.getReview).toHaveBeenCalledWith('r1');
    expect(el.querySelector('[data-testid="finding-f1"]')?.textContent).toContain('La cara se deforma');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/frame.png');
  });

  const MOTION_DETAIL: ReviewDetail = { ...DETAIL, findings: [{ ...FINDING, fix: { kind: 'motion_prompt', params: { motion_prompt: 'she walks' } } }] };

  it('offers "let the assistant propose it" for a motion-prompt fix when the assistant can run', async () => {
    api.getReview.mockReturnValueOnce(of(MOTION_DETAIL));
    const f = await setup();
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid="suggest-f1"]')).not.toBeNull();
  });

  it('hides that button, with no notice, when the assistant has no model or does not answer', async () => {
    for (const data of [missing('assistant', 'no_models'), missing('assistant', 'unreachable')]) {
      TestBed.resetTestingModule();
      api.getReview.mockReturnValueOnce(of(MOTION_DETAIL));
      const f = await setup(true, data);
      const el: HTMLElement = f.nativeElement;
      expect(el.querySelector('[data-testid="suggest-f1"]')).toBeNull();
      expect(el.querySelector('[data-testid="model-notice"]')).toBeNull();
      expect(el.querySelector('[data-testid="analyze"]')).not.toBeNull(); // Analyze stays: it measures without a model
    }
  });

  it('applies one finding as a task', async () => {
    const f = await setup();
    (f.nativeElement.querySelector('[data-testid="run-f1"]') as HTMLButtonElement).click();
    await f.whenStable();
    expect(api.runReviewTasks).toHaveBeenCalledWith('r1', ['f1'], '');
  });

  it('changing the kind of fix patches the finding with a starting value', async () => {
    const f = await setup();
    const cmp = f.componentInstance as unknown as { setFixKind(x: Finding, k: string): Promise<void> };
    await cmp.setFixKind(FINDING, 'reseed');
    const body = api.patchFinding.mock.calls[0][2] as { fix: { kind: string; params: { seed: number } } };
    expect(body.fix.kind).toBe('reseed');
    expect(Number.isInteger(body.fix.params.seed)).toBe(true);
  });

  it('adds an observation of the user', async () => {
    const f = await setup();
    const cmp = f.componentInstance as unknown as {
      obsScene: { set(v: string): void };
      obsText: { set(v: string): void };
      addObservation(): Promise<void>;
    };
    cmp.obsScene.set('s06_stand_up');
    cmp.obsText.set('  Se le funde la mano  ');
    await cmp.addObservation();
    const [rid, body] = api.createFinding.mock.calls[0] as unknown as [string, { scene: string; description: string }];
    expect(rid).toBe('r1');
    expect(body.scene).toBe('s06_stand_up');
    expect(body.description).toBe('Se le funde la mano');
  });

  it('deletes a review only after confirming', async () => {
    const f = await setup(false);
    (f.nativeElement.querySelector('[data-testid="delete-r1"]') as HTMLButtonElement).click();
    await f.whenStable();
    expect(api.deleteReview).not.toHaveBeenCalled();
  });

  it('deletes a review once confirmed', async () => {
    const f = await setup(true);
    (f.nativeElement.querySelector('[data-testid="delete-r1"]') as HTMLButtonElement).click();
    await f.whenStable();
    expect(api.deleteReview).toHaveBeenCalledWith('r1');
  });
});
