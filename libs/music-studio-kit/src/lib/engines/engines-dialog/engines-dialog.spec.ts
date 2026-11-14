import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom, throwError } from 'rxjs';

import { stubStorage } from '../../../testing/memory-storage';
import { InMemorySongs, type InMemoryOptions } from '../../song/in-memory.adapter';
import { EngineFailed } from '../../song/port';
import { SONGS } from '../../song/tokens';
import { EnginesDialog } from './engines-dialog';

async function draw(options: InMemoryOptions = {}, patch?: (port: InMemorySongs) => void) {
  stubStorage();
  TestBed.resetTestingModule();
  const port = new InMemorySongs({ pace: 10, ...options });
  patch?.(port);
  const close = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: SONGS, useValue: port }, { provide: MatDialogRef, useValue: { close } }] });
  const fixture = TestBed.createComponent(EnginesDialog);
  await settle(fixture);
  return { fixture, port, close };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector<T>(sel);
const text = (f: ComponentFixture<unknown>, sel: string) => q(f, sel)?.textContent?.replace(/\s+/g, ' ').trim();
const click = async (f: ComponentFixture<unknown>, sel: string) => {
  q<HTMLButtonElement>(f, sel)!.click();
  await settle(f);
};

describe('EnginesDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists HeartMuLa, DiffRhythm2, LAION-CLAP and MuQ-MuLan with their state', async () => {
    const { fixture } = await draw({ clap: false, muq: false, engines: [{ generator: 'diffrhythm2', available: false, reason: 'no_gpu' }] });
    expect([...fixture.nativeElement.querySelectorAll('[data-testid^=engine-row-]')].map((r) => (r as HTMLElement).dataset['testid'])).toEqual(['engine-row-heartmula', 'engine-row-diffrhythm2', 'engine-row-clap', 'engine-row-muq']);
    expect(text(fixture, '[data-testid=engine-state-heartmula]')).toBe('Running');
    expect(text(fixture, '[data-testid=engine-state-diffrhythm2]')).toBe('Not available');
    expect(text(fixture, '[data-testid=engine-reason-diffrhythm2]')).toBe('No card has free memory.');
    expect(text(fixture, '[data-testid=engine-state-clap]')).toBe('Stopped');
    expect(text(fixture, '[data-testid=engine-state-muq]')).toBe('Not available');
    expect(text(fixture, '[data-testid=engine-reason-muq]')).toBe('The model weights are missing.');
  });

  it('starts a stopped generator: it shows Starting and then Running with a Stop button', async () => {
    vi.useFakeTimers();
    const { fixture } = await draw({ engines: [{ generator: 'heartmula', available: false, reason: 'not_running' }] });
    expect(text(fixture, '[data-testid=engine-state-heartmula]')).toBe('Stopped');
    expect(q(fixture, '[data-testid=engine-stop-heartmula]')).toBeNull();
    await click(fixture, '[data-testid=engine-start-heartmula]');
    expect(text(fixture, '[data-testid=engine-state-heartmula]')).toBe('Starting…');
    await vi.advanceTimersByTimeAsync(3000);
    await settle(fixture);
    expect(text(fixture, '[data-testid=engine-state-heartmula]')).toBe('Running');
    expect(q(fixture, '[data-testid=engine-start-heartmula]')).toBeNull();
    expect(q(fixture, '[data-testid=engine-stop-heartmula]')).toBeTruthy();
  });

  it('starts LAION-CLAP like a generator', async () => {
    vi.useFakeTimers();
    const { fixture, port } = await draw({ clap: false });
    await click(fixture, '[data-testid=engine-start-clap]');
    await vi.advanceTimersByTimeAsync(3000);
    await settle(fixture);
    expect(text(fixture, '[data-testid=engine-state-clap]')).toBe('Running');
    expect(await firstValueFrom(port.recognizers())).toContainEqual({ id: 'clap', available: true });
  });

  it('stops a running engine and shows it stopped', async () => {
    const { fixture } = await draw();
    await click(fixture, '[data-testid=engine-stop-heartmula]');
    expect(text(fixture, '[data-testid=engine-state-heartmula]')).toBe('Stopped');
    expect(q(fixture, '[data-testid=engine-start-heartmula]')).toBeTruthy();
  });

  it('says next to the engine why a stop was refused (a run uses it)', async () => {
    const { fixture } = await draw({}, (port) => vi.spyOn(port, 'stopEngine').mockReturnValue(throwError(() => new EngineFailed('busy'))));
    await click(fixture, '[data-testid=engine-stop-heartmula]');
    expect(text(fixture, '[data-testid=engine-error-heartmula]')).toBe('A job is using it: wait for it to finish.');
    expect(q(fixture, '[data-testid=engine-error-clap]')).toBeNull();
  });

  it('says next to the engine why a start was refused, with the reason the server gave', async () => {
    const { fixture } = await draw({ clap: false }, (port) => vi.spyOn(port, 'start').mockReturnValue(throwError(() => new EngineFailed('refused', 'no_gpu'))));
    await click(fixture, '[data-testid=engine-start-clap]');
    expect(text(fixture, '[data-testid=engine-error-clap]')).toBe('The server cannot start it now. No card has free memory.');
  });

  it('offers no button for what cannot be started or stopped: an engine that is broken, and MuQ-MuLan', async () => {
    const { fixture } = await draw({ muq: false, engines: [{ generator: 'diffrhythm2', available: false, reason: 'no_service' }] });
    for (const id of ['diffrhythm2', 'muq']) {
      expect(q(fixture, `[data-testid=engine-start-${id}]`), id).toBeNull();
      expect(q(fixture, `[data-testid=engine-stop-${id}]`), id).toBeNull();
    }
    const muq = await draw();
    expect(text(muq.fixture, '[data-testid=engine-state-muq]')).toBe('Available');
    expect(q(muq.fixture, '[data-testid=engine-stop-muq]')).toBeNull();
  });

  it('says the state could not be read when the server does not answer, and closes', async () => {
    const { fixture, close } = await draw({}, (port) => vi.spyOn(port, 'containers').mockReturnValue(throwError(() => new Error('down'))));
    expect(text(fixture, '[data-testid=engines-unreadable]')).toBe('The state of the engines could not be read.');
    await click(fixture, '[data-testid=engines-close]');
    expect(close).toHaveBeenCalled();
  });
});
