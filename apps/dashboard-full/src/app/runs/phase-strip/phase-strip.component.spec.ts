import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PipelineEvent } from '../../core/api.models';
import { PhaseStripComponent } from './phase-strip.component';

const ev = (partial: Partial<PipelineEvent>): PipelineEvent =>
  ({ timestamp: 't', ...partial }) as PipelineEvent;

// cafe and pesca animate in parallel on two GPUs; pesca fails; cafe is stopped.
const PARALLEL_FAILURE: PipelineEvent[] = [
  ev({ type: 'pipeline_start' }),
  ev({ type: 'phase_end', scene_id: 'cafe', phase: 'tts', duration_ms: 900 }),
  ev({ type: 'phase_end', scene_id: 'pesca', phase: 'tts', duration_ms: 900 }),
  ev({ type: 'phase_end', scene_id: 'cafe', phase: 'render', duration_ms: 17000 }),
  ev({ type: 'phase_end', scene_id: 'pesca', phase: 'render', duration_ms: 20000 }),
  ev({ type: 'phase_start', scene_id: 'cafe', phase: 'animate' }),
  ev({ type: 'phase_start', scene_id: 'pesca', phase: 'animate' }),
  ev({ type: 'phase_start', scene_id: 'cafe', phase: 'clip' }),
  ev({ type: 'error', scene_id: 'pesca', message: 'animate failed: sd: out of memory' }),
  ev({ type: 'error', scene_id: 'cafe', message: 'stopped: animate failed: sd: out of memory' }),
];

describe('PhaseStripComponent', () => {
  let fixture: ComponentFixture<PhaseStripComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  function render(events: PipelineEvent[]): void {
    fixture = TestBed.createComponent(PhaseStripComponent);
    fixture.componentRef.setInput('events', events);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PhaseStripComponent] }).compileComponents();
  });

  it('shows the animate column between render and clip when the run animates', () => {
    render(PARALLEL_FAILURE);
    const heads = Array.from(el().querySelectorAll('.strip__phase')).map((h) => h.textContent?.trim());
    expect(heads).toEqual(['tts', 'probe', 'render', 'animate', 'clip']);
  });

  it('has no animate column in a run without animation', () => {
    render([
      ev({ type: 'phase_end', scene_id: 'a', phase: 'render', duration_ms: 1 }),
      ev({ type: 'phase_start', scene_id: 'a', phase: 'clip' }),
    ]);
    const heads = Array.from(el().querySelectorAll('.strip__phase')).map((h) => h.textContent?.trim());
    expect(heads).toEqual(['tts', 'probe', 'render', 'clip']);
  });

  it('draws the failing scene as failed and the stopped one as stopped, with text and not only colour', () => {
    render(PARALLEL_FAILURE);
    const row = (scene: string) =>
      Array.from(el().querySelectorAll('.strip__row')).find(
        (r) => r.querySelector('.strip__scene')?.textContent?.trim() === scene,
      )!;
    const pesca = row('pesca').querySelector('.seg--failed');
    const cafe = row('cafe').querySelector('.seg--stopped');
    expect(pesca?.textContent).toContain('falló');
    expect(pesca?.getAttribute('title')).toBe('animate: falló');
    expect(cafe?.textContent).toContain('detenida');
    expect(cafe?.getAttribute('title')).toBe('clip: detenida');
    // the stopped scene must not be drawn as the cause
    expect(row('cafe').querySelector('.seg--failed')).toBeNull();
  });

  it('shows the first error as the reason of the run', () => {
    render(PARALLEL_FAILURE);
    const err = el().querySelector('.strip__error')?.textContent ?? '';
    expect(err).toContain('animate failed: sd: out of memory');
    expect(err).not.toContain('stopped:');
  });

  it('shows a running animation as running with its own cell', () => {
    render([
      ev({ type: 'phase_end', scene_id: 'cafe', phase: 'render', duration_ms: 17000 }),
      ev({ type: 'phase_start', scene_id: 'cafe', phase: 'animate' }),
    ]);
    const running = el().querySelector('.seg--running');
    expect(running?.getAttribute('title')).toBe('animate: en curso');
  });
});
