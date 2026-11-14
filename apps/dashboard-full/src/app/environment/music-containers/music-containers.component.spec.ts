import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { EngineAvailability, EnvironmentReport } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { MusicContainersComponent } from './music-containers.component';

const REPORT = {
  binaries: [],
  models: [],
  voices: [],
  loras: [],
  gpus: [
    { index: 0, name: 'RTX 4070', free_vram_mb: 11000 },
    { index: 1, name: 'RTX 5060 Ti', free_vram_mb: 15000 },
  ],
} as unknown as EnvironmentReport;

const stopped: EngineAvailability = { available: false, mode: 'local', reason: 'not_running', container: { state: 'stopped' } };
const running: EngineAvailability = { available: true, mode: 'local', container: { state: 'running', gpu: 1, port: 41233, memory_mb: 3072 } };

describe('MusicContainersComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<MusicContainersComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function open(engines: Record<string, EngineAvailability>) {
    await TestBed.configureTestingModule({
      imports: [MusicContainersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(EnvironmentStore).report.set(REPORT);
    fixture = TestBed.createComponent(MusicContainersComponent);
    fixture.detectChanges();
    http.expectOne('/api/music/engines?stats=1').flush({ engines });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('offers to start a stopped container on the card chosen', async () => {
    await open({ heartmula: stopped, diffrhythm2: running });
    expect(el().querySelector('[data-testid=container-heartmula] [data-testid=container-state]')?.textContent).toContain('parado');
    expect(el().querySelector('[data-testid=container-diffrhythm2] [data-testid=container-state]')?.textContent).toContain('en marcha');
    expect(el().querySelector('[data-testid=container-diffrhythm2] [data-testid=container-state]')?.textContent).toContain('3.0 GB');

    const select = el().querySelector<HTMLSelectElement>('[data-testid=container-heartmula] [data-testid=container-gpu]')!;
    expect(select.options.length).toBe(3); // auto, GPU 0 and GPU 1
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    el().querySelector<HTMLButtonElement>('[data-testid=container-heartmula] [data-testid=container-start]')!.click();

    const req = http.expectOne('/api/music/engines/heartmula/start');
    expect(req.request.body).toEqual({ gpu: 1 });
    req.flush({ container: { state: 'starting' } }, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: { heartmula: { ...stopped, container: { state: 'starting' } }, diffrhythm2: running } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=container-heartmula] [data-testid=container-state]')?.textContent).toContain('arrancando');
  });

  it('lists the LAION-CLAP experiment with the same start button', async () => {
    await open({ clap: stopped });
    const row = el().querySelector('[data-testid=container-clap]')!;
    expect(row.textContent).toContain('LAION-CLAP');
    row.querySelector<HTMLButtonElement>('[data-testid=container-start]')!.click();
    http.expectOne('/api/music/engines/clap/start').flush({ container: { state: 'starting' } });
    await fixture.whenStable();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: { clap: { ...stopped, container: { state: 'starting' } } } });
  });

  it('stops a running one', async () => {
    await open({ heartmula: running });
    el().querySelector<HTMLButtonElement>('[data-testid=container-stop]')!.click();
    http.expectOne('/api/music/engines/heartmula/stop').flush({ container: { state: 'stopped' } });
    await fixture.whenStable();
    http.expectOne('/api/music/engines?stats=1').flush({ engines: { heartmula: stopped } });
  });

  it('says why a container cannot be started and where to fix it', async () => {
    await open({ heartmula: { available: false, mode: 'local', reason: 'no_weights', container: { state: 'stopped' } } });
    expect(el().querySelector('[data-testid=container-blocked]')?.textContent).toContain('Faltan sus pesos');
    expect(el().querySelector('[data-testid=container-blocked] a')?.getAttribute('href')).toBe('/models');
    expect(el().querySelector('[data-testid=container-start]')).toBeNull();
  });

  it('shows the error of a start that failed', async () => {
    await open({ heartmula: { ...stopped, container: { state: 'stopped', error: 'did not get ready' } } });
    expect(el().querySelector('[data-testid=container-error]')?.textContent).toContain('did not get ready');
  });
});
