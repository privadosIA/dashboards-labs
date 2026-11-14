import type { AnimationPort, Piece } from '@lab/animation-core';
import { firstValueFrom, lastValueFrom, of, toArray } from 'rxjs';

import { drawPiece, estimateOf, followRender, readEstimate } from './render';

const piece = (extra: Partial<Piece>): Piece => ({ id: 'p1', title: 'T', state: 'draft', progress: 0, source: { project: 'a', trackId: 'b', variant: 0 }, style: 'typographic', level: 'simple', fps: 30, width: 1280, height: 720, createdAt: 1, estimate: { seconds: 120, frames: 2700 }, sizeBytes: 0, ...extra });

describe('the render step', () => {
  it('reads the estimate with the frame rate and the size', async () => {
    expect(estimateOf(piece({}))).toEqual({ seconds: 120, frames: 2700, fps: 30, width: 1280, height: 720 });
    expect(await firstValueFrom(readEstimate({ piece: () => of(piece({})) } as unknown as AnimationPort, 'p1'))).toMatchObject({ frames: 2700 });
  });

  it('asks for the render and follows it: progress, then the video', async () => {
    const render = vi.fn(() => of({ seconds: 1, frames: 1 }));
    const port = { render, follow: () => of(piece({ state: 'queued' }), piece({ state: 'running', progress: 40 }), piece({ state: 'done', progress: 100, video: '/v.mp4', sizeBytes: 9 })) } as unknown as AnimationPort;
    const events = await lastValueFrom(drawPiece(port, 'p1').pipe(toArray()));
    expect(render).toHaveBeenCalledWith('p1');
    expect(events.map((e) => e.kind)).toEqual(['progress', 'progress', 'done']);
    expect(events[1]).toEqual({ kind: 'progress', info: { state: 'running', progress: 40 } });
    expect(events[2]).toMatchObject({ kind: 'done', result: { video: '/v.mp4', sizeBytes: 9 } });
  });

  it('only follows a piece that is already being drawn, without asking for a render', async () => {
    const render = vi.fn();
    const port = { render, follow: () => of(piece({ state: 'running', progress: 10 }), piece({ state: 'done', video: '/v.mp4' })) } as unknown as AnimationPort;
    const events = await lastValueFrom(followRender(port, 'p1').pipe(toArray()));
    expect(render).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: 'done' });
  });

  it('errors with the reason when the drawing fails', async () => {
    const port = { render: () => of({ seconds: 1, frames: 1 }), follow: () => of(piece({ state: 'failed', error: 'no disk' })) } as unknown as AnimationPort;
    await expect(lastValueFrom(drawPiece(port, 'p1'))).rejects.toThrow('no disk');
  });
});
