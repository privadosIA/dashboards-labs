import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { InMemorySongs, type InMemoryOptions } from '../song/in-memory.adapter';
import { EngineFailed } from '../song/port';
import { SONGS } from '../song/tokens';
import { EngineControl } from './engine-control';

function control(options: InMemoryOptions = {}): { control: EngineControl; port: InMemorySongs } {
  TestBed.resetTestingModule();
  const port = new InMemorySongs({ pace: 10, ...options });
  TestBed.configureTestingModule({ providers: [{ provide: SONGS, useValue: port }] });
  return { control: TestBed.inject(EngineControl), port };
}

describe('EngineControl', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('marks an engine as starting until the server says it is up, reading again every few seconds meanwhile', async () => {
    const { control: c, port } = control({ clap: false });
    const seen = c.version();
    await c.start('clap');
    expect(c.starting().has('clap')).toBe(true);
    expect(c.version()).toBeGreaterThan(seen);
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.starting().has('clap')).toBe(false);
    expect((await firstValueFrom(port.containers())).find((e) => e.engine === 'clap')?.available).toBe(true);
  });

  it('gives up after two minutes when the engine does not come up', async () => {
    const { control: c, port } = control({ clap: false });
    // a server whose container never comes up: it answers the start and goes on saying stopped
    const stopped = [{ engine: 'clap', available: false, reason: 'not_running', container: 'stopped' }] as const;
    vi.spyOn(port, 'containers').mockReturnValue(of(stopped));
    await c.start('clap');
    await vi.advanceTimersByTimeAsync(119_000);
    expect(c.starting().has('clap')).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(c.starting().has('clap')).toBe(false);
  });

  it('starts a generator that has no container (ACE-Step) without waiting for anything', async () => {
    const { control: c } = control();
    await c.start('ace-step');
    expect(c.starting().size).toBe(0);
  });

  it('does not start an engine twice while it starts', async () => {
    const { control: c, port } = control({ clap: false });
    const start = vi.spyOn(port, 'start');
    await c.start('clap');
    await c.start('clap');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('stops an engine and tells the screens to read again', async () => {
    const { control: c, port } = control();
    const seen = c.version();
    await c.stop('heartmula');
    expect(c.version()).toBeGreaterThan(seen);
    expect((await firstValueFrom(port.containers())).find((e) => e.engine === 'heartmula')?.available).toBe(false);
  });

  it('passes on the refusal of the server and does not mark the engine as starting', async () => {
    const { control: c, port } = control();
    await firstValueFrom(port.stopEngine('heartmula'));
    vi.spyOn(port, 'start').mockReturnValue(throwError(() => new EngineFailed('refused', 'no_gpu')));
    await expect(c.start('heartmula')).rejects.toMatchObject({ kind: 'refused', reason: 'no_gpu' });
    expect(c.starting().size).toBe(0);
  });
});
