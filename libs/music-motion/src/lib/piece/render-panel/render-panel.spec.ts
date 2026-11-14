import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TicketService } from '@lab/server-connection';
import { of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { AnimationFailure, type AnimationPort, type PieceDetail } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { serverDetail } from '../../animation/server.fixture';
import { toDetail } from '../../animation/server-mapping';
import { Notifier } from '../../shared/notifier';
import { stubStorage } from '../../../testing/memory-storage';
import { RenderPanel } from './render-panel';

const detail = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), ...extra });

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(piece: PieceDetail, render: () => unknown = () => of({ seconds: 40, frames: 600 }), lang: 'es' | 'en' = 'en') {
  stubStorage();
  const call = vi.fn(render);
  const allow = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },
      { provide: ANIMATION, useValue: { render: call } as unknown as AnimationPort },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: Notifier, useValue: { allow, finished: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RenderPanel);
  fixture.componentRef.setInput('piece', piece);
  const started = vi.fn();
  fixture.componentInstance.started.subscribe(started);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, call, allow, started, text: () => el.textContent ?? '' };
}

const draw = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="draw"]')!;

describe('RenderPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the forecast before drawing, worded as a forecast', async () => {
    const { el, text } = await create(detail({ estimate: { seconds: 150, frames: 1000 } }));
    expect(el.querySelector('[data-testid="forecast"]')!.textContent).toBe('Forecast of how long it takes: 3 min');
    expect(text()).toContain('a forecast, not a promise');
    expect(draw(el).textContent).toContain('Draw the piece');
  });

  it('warns that advanced at 60 fps is slow, and only then', async () => {
    const slow = await create(detail({ level: 'advanced', fps: 60 }));
    expect(slow.el.querySelector('[data-testid="slow"]')).not.toBeNull();
    TestBed.resetTestingModule();
    const fine = await create(detail({ level: 'advanced', fps: 30 }));
    expect(fine.el.querySelector('[data-testid="slow"]')).toBeNull();
  });

  it('starts the drawing, asks the browser for the permission to notify and tells the page', async () => {
    const { fixture, el, call, allow, started } = await create(detail());
    draw(el).click();
    await settle(fixture);
    expect(call).toHaveBeenCalledWith('api-mm-1');
    expect(allow).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('shows the progress while it is drawn and cannot be started again meanwhile', async () => {
    const { el, call } = await create(detail({ state: 'running', progress: 40 }));
    expect(el.querySelector('[data-testid="progress"]')!.getAttribute('aria-valuenow')).toBe('40');
    expect(el.querySelector('[data-testid="progress-text"]')!.textContent).toBe('40%');
    expect(draw(el).disabled).toBe(true);
    draw(el).click();
    expect(call).not.toHaveBeenCalled();
  });

  it('shows the video with its ticket and a way to download it when it is done', async () => {
    const { el } = await create(detail({ state: 'done', progress: 100, video: 'http://server/v.mp4', sizeBytes: 8_400_000 }));
    expect(el.querySelector('video')!.getAttribute('src')).toBe('http://server/v.mp4?ticket=T');
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="download"]')!;
    expect(link.getAttribute('href')).toBe('http://server/v.mp4?ticket=T');
    expect(link.hasAttribute('download')).toBe(true);
    expect(el.textContent).toContain('8.4 MB');
    expect(el.querySelector('[data-testid="forecast"]')).toBeNull();
    expect(draw(el).textContent).toContain('Draw again');
  });

  it('shows the error of a failed piece and lets it be drawn again', async () => {
    const { fixture, el, call } = await create(detail({ state: 'failed', error: 'Chrome closed while drawing' }));
    expect(el.querySelector('[data-testid="failed"]')!.textContent).toContain('It could not be drawn: Chrome closed while drawing');
    expect(draw(el).disabled).toBe(false);
    expect(draw(el).textContent).toContain('Draw again');
    draw(el).click();
    await settle(fixture);
    expect(call).toHaveBeenCalled();
  });

  it('shows the reason when the server is already drawing it, and stays usable', async () => {
    const { fixture, el, started } = await create(detail(), () => throwError(() => new AnimationFailure('busy', 'piece "api-mm-1" is being drawn: wait for it to end')));
    draw(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('The piece is being drawn: piece "api-mm-1" is being drawn');
    expect(started).not.toHaveBeenCalled();
    expect(draw(el).disabled).toBe(false);
  });

  it('shows the reason when the server has no browser to draw with, and the piece stays a draft', async () => {
    const { fixture, el } = await create(detail(), () => throwError(() => new AnimationFailure('unavailable', 'there is no Chrome or Chromium to draw with')));
    draw(el).click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('The server cannot draw now: there is no Chrome or Chromium to draw with');
    expect(draw(el).textContent).toContain('Draw the piece');
  });

  it('speaks Spanish when the language is Spanish', async () => {
    const { text } = await create(detail(), undefined, 'es');
    expect(text()).toContain('Dibujar la pieza');
    expect(text()).toContain('Previsión de lo que tarda');
  });
});
