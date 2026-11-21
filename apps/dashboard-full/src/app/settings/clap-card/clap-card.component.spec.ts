import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EngineAvailability } from '../../core/api.models';
import { EnginesStore } from '../../core/engines.store';
import { ClapCardComponent } from './clap-card.component';

const STOPPED: EngineAvailability = { available: false, mode: 'local', reason: 'not_running', container: { state: 'stopped' } };

describe('ClapCardComponent', () => {
  let fixture: ComponentFixture<ClapCardComponent>;
  let engines: { data: ReturnType<typeof signal<Record<string, EngineAvailability> | null>>; refresh: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; callError: ReturnType<typeof signal<string | null>> };
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => el().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function show(clap: EngineAvailability | null) {
    engines = { data: signal<Record<string, EngineAvailability> | null>(clap ? { clap } : {}), refresh: vi.fn(() => Promise.resolve()), start: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()), callError: signal<string | null>(null) };
    await TestBed.configureTestingModule({ imports: [ClapCardComponent], providers: [{ provide: EnginesStore, useValue: engines }] }).compileComponents();
    fixture = TestBed.createComponent(ClapCardComponent);
    await settle();
  }

  it('says what it is and that it runs only as a .NET service, with no backend choice', async () => {
    await show(STOPPED);
    expect(el().textContent).toContain('LAION-CLAP');
    expect(el().textContent).toContain('no hace música');
    expect(q('clap-only-dotnet')!.textContent).toContain('solo como servicio .NET');
    expect(el().querySelector('mat-radio-group, app-music-backend')).toBeNull();
  });

  it('shows it stopped, starts it, then running with its port, and stops it', async () => {
    await show(STOPPED);
    expect(q('clap-state')!.textContent).toContain('Parado');
    (q('clap-start') as HTMLButtonElement).click();
    expect(engines.start).toHaveBeenCalledWith('clap');
    engines.data.set({ clap: { available: true, mode: 'local', container: { state: 'running', port: 8789 } } });
    await settle();
    expect(q('clap-state')!.textContent).toContain('En marcha');
    expect(q('clap-state')!.textContent).toContain(':8789');
    expect(q('clap-start')).toBeNull();
    q('clap-stop')!.click();
    expect(engines.stop).toHaveBeenCalledWith('clap');
  });

  it('says why it cannot start when the service is not installed, and cannot be started', async () => {
    await show({ available: false, mode: 'local', reason: 'no_service', container: { state: 'stopped' } });
    expect(q('clap-blocked')!.textContent).toContain('get-services.sh');
    expect((q('clap-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server\'s refusal of a start in its words', async () => {
    await show(STOPPED);
    engines.callError.set('clap cannot be started: no GPU has the free memory');
    await settle();
    expect(q('clap-call-error')!.textContent).toContain('no GPU has the free memory');
  });

  it('has no card for a server that does not list it', async () => {
    await show(null);
    expect(el().querySelector('mo-panel')).toBeNull();
  });
});
