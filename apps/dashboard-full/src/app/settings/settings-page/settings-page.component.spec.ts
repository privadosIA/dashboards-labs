import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsPageComponent } from './settings-page.component';
import { AvailabilityStore } from '../../core/availability.store';
import { EnginesStore } from '../../core/engines.store';
import { fakeEngines } from '../../core/engines.fake';

const LOCAL = { ollama: { host: 'http://127.0.0.1:11434', source: 'default', remote: false, saved: '' } };
const REMOTE_SAVED = { ollama: { host: 'http://192.168.1.50:11434', source: 'setting', remote: true, saved: 'http://192.168.1.50:11434' } };

describe('SettingsPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SettingsPageComponent>;
  let el: HTMLElement;

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (value: string) => {
    const input = q('settings-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  async function open(initial = LOCAL) {
    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AvailabilityStore, useValue: { refresh: () => Promise.resolve() } }, { provide: EnginesStore, useValue: fakeEngines() }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SettingsPageComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/settings').flush(initial);
    // the providers and tasks cards have their own specs
    http.match('/api/providers').forEach((r) => r.flush({ providers: [] }));
    http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: [] }));
    http.match('/api/settings/database').forEach((r) => r.flush({ saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, server_name: 'x', servers: [] }));
    http.match('/api/routing').forEach((r) => r.flush({ routing: { assistant: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' }, describe_image: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' }, describe_video: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' }, quality: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' }, motion_graphics: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' } }, max_calls: 60 }));
    await settle();
  }

  afterEach(() => http.verify());

  it('shows the address in use and where it comes from, with no warning for this machine', async () => {
    await open();
    expect(q('settings-host')?.textContent).toContain('http://127.0.0.1:11434');
    expect(q('settings-source')?.getAttribute('data-source')).toBe('default');
    expect(q('settings-remote-warning')).toBeNull();
    expect(q('settings-reset')).toBeNull(); // nothing saved to remove
  });

  it('warns that data leaves the computer when the address in use is another machine', async () => {
    await open(REMOTE_SAVED);
    expect(q('settings-remote-warning')?.textContent).toContain('saldrán de este ordenador');
    expect(q('settings-source')?.getAttribute('data-source')).toBe('setting');
    expect(q('settings-reset')).not.toBeNull();
  });

  it('tests the typed address before saving: version, models and the ones that read pictures', async () => {
    await open();
    await type('192.168.1.50');
    q('settings-test')!.click();
    const req = http.expectOne('/api/settings/ollama/test');
    expect(req.request.body).toEqual({ host: '192.168.1.50' });
    req.flush({
      ok: true,
      host: 'http://192.168.1.50:11434',
      remote: true,
      version: '0.12.3',
      models: [
        { name: 'gemma4:26b', vision: true },
        { name: 'qwen3:8b', vision: false },
      ],
    });
    await settle();
    expect(q('settings-test-result')?.getAttribute('data-ok')).toBe('true');
    expect(q('settings-test-result')?.textContent).toContain('0.12.3');
    expect(el.querySelectorAll('[data-testid="settings-models"] li').length).toBe(2);
    expect(el.querySelectorAll('[data-testid="settings-vision"]').length).toBe(1);
    // the tested address is remote: the warning shows although it is not saved yet
    expect(q('settings-remote-warning')).not.toBeNull();
  });

  it('says nothing answered, naming the address, and still lets the user save', async () => {
    await open();
    await type('10.9.9.9');
    q('settings-test')!.click();
    http.expectOne('/api/settings/ollama/test').flush({ ok: false, host: 'http://10.9.9.9:11434', remote: true, error: 'no Ollama answers at http://10.9.9.9:11434 (connection refused)' });
    await settle();
    expect(q('settings-test-error')?.textContent).toContain('10.9.9.9');
    expect((q('settings-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('tests the address in use when nothing is typed', async () => {
    await open();
    q('settings-test')!.click();
    expect(http.expectOne('/api/settings/ollama/test').request.body).toEqual({});
  });

  it('saves the address and then shows it in use with the source "setting"', async () => {
    await open();
    expect((q('settings-save') as HTMLButtonElement).disabled).toBe(true); // nothing typed
    await type('192.168.1.50:11434');
    q('settings-save')!.click();
    const req = http.expectOne({ method: 'PUT', url: '/api/settings' });
    expect(req.request.body).toEqual({ ollama_host: '192.168.1.50:11434' });
    req.flush(REMOTE_SAVED);
    await settle();
    expect(q('settings-host')?.textContent).toContain('http://192.168.1.50:11434');
    expect(q('settings-source')?.getAttribute('data-source')).toBe('setting');
    expect(q('settings-reset')).not.toBeNull();
  });

  it('shows the server reason for an invalid address and keeps the one in use', async () => {
    await open();
    await type('http://host/path');
    q('settings-save')!.click();
    http.expectOne('/api/settings').flush({ error: { code: 'invalid', message: 'the address must have no path' } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(q('settings-error')?.textContent).toContain('no path');
    expect(q('settings-host')?.textContent).toContain('http://127.0.0.1:11434');
  });

  it('goes back to the environment by removing the saved address', async () => {
    await open(REMOTE_SAVED);
    q('settings-reset')!.click();
    const req = http.expectOne({ method: 'PUT', url: '/api/settings' });
    expect(req.request.body).toEqual({ ollama_host: '' });
    req.flush({ ollama: { host: 'http://10.0.0.2:11434', source: 'env', remote: true, saved: '' } });
    await settle();
    expect(q('settings-source')?.getAttribute('data-source')).toBe('env');
    expect(q('settings-reset')).toBeNull();
  });
});
