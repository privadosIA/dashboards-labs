import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { BackendStatus, EngineAvailability, HeartMulaSettings, InstallJob } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnginesStore } from '../../core/engines.store';
import { MusicBackendComponent } from './music-backend.component';

const SETTINGS: HeartMulaSettings = { saved: '', token_set: false, remote: false, consented: false, source: 'default', backend: 'dotnet', backend_source: 'default' };
const READY: BackendStatus = { available: true };
const entry = (over: Partial<EngineAvailability> = {}): EngineAvailability => ({
  available: false,
  mode: 'local',
  reason: 'not_running',
  container: { state: 'stopped' },
  backends: { dotnet: READY, docker: READY },
  ...over,
});
const job = (extra: Partial<InstallJob> = {}): InstallJob => ({ id: 'install-1', engine: 'heartmula', backend: 'docker', state: 'running', parts: [{ part: 'weights', state: 'running' }], created_at: '2026-11-19T10:00:00Z', ...extra });

describe('MusicBackendComponent', () => {
  let fixture: ComponentFixture<MusicBackendComponent>;
  let api: { putMusicBackend: ReturnType<typeof vi.fn>; listInstalls: ReturnType<typeof vi.fn> };
  let engines: { data: ReturnType<typeof signal<Record<string, EngineAvailability> | null>>; refresh: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; callError: ReturnType<typeof signal<string | null>> };
  let opened: unknown[];
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => el().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function show(heartmula: EngineAvailability, settings: HeartMulaSettings = SETTINGS, installs: InstallJob[] = []) {
    opened = [];
    api = { putMusicBackend: vi.fn(), listInstalls: vi.fn(() => of({ installs })) };
    engines = { data: signal({ heartmula }), refresh: vi.fn(() => Promise.resolve()), start: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()), callError: signal<string | null>(null) };
    await TestBed.configureTestingModule({
      imports: [MusicBackendComponent],
      providers: [{ provide: ApiService, useValue: api }, { provide: EnginesStore, useValue: engines }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockImplementation(((_c: unknown, config: { data: unknown }) => {
      opened.push(config.data);
      return { afterClosed: () => of(true) };
    }) as never);
    fixture = TestBed.createComponent(MusicBackendComponent);
    fixture.componentRef.setInput('engine', 'heartmula');
    fixture.componentRef.setInput('settings', settings);
    await settle();
  }

  it('draws nothing for a server whose settings carry no backend', async () => {
    await show(entry(), { ...SETTINGS, backend: undefined, backend_source: undefined });
    expect(q('heartmula-backend')).toBeNull();
  });

  it('shows the two ways, the one in use, where it comes from, and that both are ready', async () => {
    await show(entry());
    expect(q('backend-dotnet')!.className).toContain('option--on');
    expect(q('backend-docker')!.className).not.toContain('option--on');
    expect(el().querySelectorAll('[data-testid="backend-status"]')).toHaveLength(2);
    expect(q('backend-dotnet')!.textContent).toContain('Listo');
    expect(q('backend-source')!.querySelector('.chip')!.textContent).toContain('por defecto');
    expect(q('backend-default')).toBeNull(); // nothing saved to remove
  });

  it('says what a backend lacks, in words and with the size to download, and offers to download it', async () => {
    await show(entry({ backends: { dotnet: READY, docker: { available: false, missing: ['image', 'weights'], reason: 'no_image', need_bytes: 35_200_000_000 } } }));
    const docker = q('backend-docker')!;
    expect(docker.textContent).toContain('la imagen de Docker');
    expect(docker.textContent).toContain('los pesos del modelo');
    expect(docker.textContent).toContain('35.2 GB');
    expect(q('backend-install-docker')).not.toBeNull();
    expect(q('backend-install-dotnet')).toBeNull();
    q('backend-install-docker')!.click();
    expect(opened).toEqual([{ engine: 'heartmula', backend: 'docker' }]);
  });

  it('turns Docker off, with its reason, when the server cannot use it, and leaves the .NET service and the address', async () => {
    await show(entry({ backends: { dotnet: READY, docker: { available: false, missing: ['docker'], reason: 'no_docker' } } }));
    expect(q('backend-docker')!.textContent).toContain('Docker no se puede usar en este servidor');
    expect(q('backend-docker')!.querySelector('input')!.disabled).toBe(true);
    expect(q('backend-dotnet')!.querySelector('input')!.disabled).toBe(false);
    expect(q('backend-install-docker')).toBeNull();
  });

  it('saves the choice at once, sending only the one key, and tells the card the new settings', async () => {
    await show(entry());
    const after = { ...SETTINGS, backend: 'docker' as const, backend_source: 'setting' as const };
    api.putMusicBackend.mockReturnValue(of({ heartmula: after }));
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    q('backend-docker')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    expect(api.putMusicBackend).toHaveBeenCalledWith('heartmula', 'docker');
    expect(changed).toHaveBeenCalledWith(after);
    expect(engines.refresh).toHaveBeenCalled();
  });

  it('shows the server\'s refusal in its words and keeps the choice as it was', async () => {
    await show(entry());
    api.putMusicBackend.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: { code: 'conflict', message: 'a run is making songs with heartmula' } } })));
    q('backend-docker')!.querySelector<HTMLInputElement>('input')!.click();
    await settle();
    expect(q('backend-error')!.textContent).toContain('a run is making songs with heartmula');
    expect(q('backend-dotnet')!.className).toContain('option--on');
  });

  it('goes back to the default by removing the saved choice', async () => {
    await show(entry(), { ...SETTINGS, backend: 'docker', backend_source: 'setting' });
    api.putMusicBackend.mockReturnValue(of({ heartmula: SETTINGS }));
    q('backend-default')!.click();
    await settle();
    expect(api.putMusicBackend).toHaveBeenCalledWith('heartmula', '');
  });

  it('says an address is saved, and turns the choice, Start and Stop off', async () => {
    await show(entry({ mode: 'external', available: true, reason: undefined }), { ...SETTINGS, saved: 'http://musica.local:8787', source: 'setting' });
    expect(q('backend-external')).not.toBeNull();
    expect(q('backend-run')).toBeNull();
    expect(q('backend-docker')!.querySelector('input')!.disabled).toBe(true);
    expect(q('backend-install-docker')).toBeNull();
  });

  it('starts what the backend in use has, shows it running with its port, and stops it', async () => {
    await show(entry());
    expect(q('backend-container')!.textContent).toContain('Parado');
    (q('backend-start') as HTMLButtonElement).click();
    expect(engines.start).toHaveBeenCalledWith('heartmula');
    engines.data.set({ heartmula: entry({ available: true, reason: undefined, container: { state: 'running', port: 8787, gpu: 1 } }) });
    await settle();
    expect(q('backend-container')!.textContent).toContain('En marcha');
    expect(q('backend-container')!.textContent).toContain(':8787');
    expect(q('backend-start')).toBeNull();
    q('backend-stop')!.click();
    expect(engines.stop).toHaveBeenCalledWith('heartmula');
  });

  it('cannot start a backend that lacks something', async () => {
    await show(entry({ backends: { dotnet: { available: false, missing: ['weights'], reason: 'no_weights' }, docker: READY } }));
    expect((q('backend-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says an install is running when the card opens, with a way back to it', async () => {
    await show(entry(), SETTINGS, [job(), job({ id: 'other', engine: 'diffrhythm2' })]);
    expect(q('backend-installing')).not.toBeNull();
    expect((q('backend-start') as HTMLButtonElement).disabled).toBe(true);
    q('backend-progress')!.click();
    expect(opened).toEqual([{ engine: 'heartmula', backend: 'docker', jobId: 'install-1' }]);
  });

  it('shows the server\'s refusal of a start in its words', async () => {
    await show(entry());
    engines.callError.set('heartmula cannot be started: the weights are not downloaded');
    await settle();
    expect(q('backend-call-error')!.textContent).toContain('the weights are not downloaded');
  });

  it('reads a running install again until it ends, and then shows what it brought', async () => {
    vi.useFakeTimers();
    try {
      await show(entry({ backends: { dotnet: { available: false, missing: ['weights'], reason: 'no_weights' }, docker: READY } }), SETTINGS, [job({ backend: 'dotnet' })]);
      expect(q('backend-installing')).not.toBeNull();
      api.listInstalls.mockReturnValue(of({ installs: [job({ backend: 'dotnet', state: 'done' })] }));
      engines.data.set({ heartmula: entry() });
      await vi.advanceTimersByTimeAsync(2100);
      fixture.detectChanges();
      expect(q('backend-installing')).toBeNull();
      expect(q('backend-dotnet')!.textContent).toContain('Listo');
      expect(engines.refresh.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
