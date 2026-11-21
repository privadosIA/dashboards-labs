import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

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

  let section: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(initial = LOCAL, named = 'assistant') {
    section = new BehaviorSubject(convertToParamMap({ section: named }));
    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: section.asObservable() } }, provideHttpClient(), provideHttpClientTesting(), { provide: AvailabilityStore, useValue: { refresh: () => Promise.resolve() } }, { provide: EnginesStore, useValue: fakeEngines() }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SettingsPageComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/settings').flush(initial);
    // the providers and tasks cards have their own specs
    http.match('/api/providers').forEach((r) => r.flush({ providers: [] }));
    http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: [] }));
    http.match('/api/settings/database').forEach((r) => r.flush({ saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, source: 'default', server_name: 'x', servers: [] }));
    http.match('/api/data/status').forEach((r) => r.flush({ engine: 'sqlite', migrations: { applied: [], pending: [] }, tables: [], imports: [], legacy_files: [] }));
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

  it('has the Data card, after the database card, and it reads the state of the data', async () => {
    await open(LOCAL, 'data');
    expect(el.querySelector('app-data-card')).not.toBeNull();
    const cards = [...el.querySelectorAll('app-database-card, app-data-card')].map((c) => c.tagName.toLowerCase());
    expect(cards).toEqual(['app-database-card', 'app-data-card']);
    expect(q('data-engine')?.textContent).toContain('sqlite');
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

  describe('the sections', () => {
    const cards = (el: HTMLElement) => [...el.querySelectorAll('app-providers-card, app-tasks-card, app-motion-model-card, app-heartmula-card, app-diffrhythm2-card, app-clap-card, app-database-card, app-data-card, app-browser-card, app-monitoring-card')].map((c) => c.tagName.toLowerCase().replace('app-', '').replace('-card', ''));

    it('draws only the cards of the section: Assistant has Ollama, Providers, Tasks and the motion model', async () => {
      await open(LOCAL, 'assistant');
      expect(q('settings-input')).not.toBeNull();
      expect(cards(el)).toEqual(['providers', 'tasks', 'motion-model']);
    });

    it.each([
      ['music', ['heartmula', 'diffrhythm2', 'clap']],
      ['data', ['database', 'data']],
      ['system', ['browser', 'monitoring']],
    ])('%s has its own cards and no Ollama panel', async (name, expected) => {
      await open(LOCAL, name);
      expect(cards(el)).toEqual(expected);
      expect(q('settings-input')).toBeNull();
    });

    it('a card of another section makes no request until its section is opened', async () => {
      await open(LOCAL, 'assistant');
      http.expectNone('/api/data/status');
      http.expectNone('/api/settings/database');
      http.expectNone('/api/settings/monitoring');
      expect(el.querySelector('[data-testid="settings-sections"] a[aria-current="page"]')?.getAttribute('href')).toBe('/settings/assistant');
    });

    it('marks the open section with aria-current, and links the four sections', async () => {
      await open(LOCAL, 'music');
      const links = [...el.querySelectorAll<HTMLAnchorElement>('[data-testid="settings-sections"] a')];
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/settings/assistant', '/settings/music', '/settings/data', '/settings/system']);
      expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null]);
    });

    it('names the sections in the language of the tests (Spanish)', async () => {
      await open(LOCAL, 'data');
      expect([...el.querySelectorAll('[data-testid="settings-sections"] a')].map((a) => a.textContent!.trim())).toEqual(['Asistente', 'Música', 'Datos', 'Sistema']);
    });

    it('opens Assistant, and puts it in the address, for a section that does not exist', async () => {
      const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
      await open(LOCAL, 'nothing');
      expect(q('settings-input')).not.toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/settings', 'assistant'], { replaceUrl: true });
    });

    it('follows the address when the person goes to another section', async () => {
      await open(LOCAL, 'assistant');
      expect(q('settings-input')).not.toBeNull();
      section.next(convertToParamMap({ section: 'system' }));
      await settle();
      http.match('/api/settings/monitoring').forEach((r) => r.flush({ tools: [] }));
      expect(q('settings-input')).toBeNull();
      expect(cards(el)).toEqual(['browser', 'monitoring']);
    });
  });
});
