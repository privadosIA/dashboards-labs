import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ProviderInfo } from '../../core/api.models';
import { ProvidersCardComponent } from './providers-card.component';
import { AvailabilityStore } from '../../core/availability.store';

const BUILTIN: ProviderInfo = { id: 'ollama', name: 'Ollama', type: 'ollama', base_url: 'http://127.0.0.1:11434', text_model: '', vision_model: '', builtin: true, remote: false, key_set: false };
const OPENROUTER: ProviderInfo = { id: 'openrouter', name: 'OpenRouter', type: 'openai', base_url: 'https://openrouter.ai/api/v1', text_model: 'gpt-4o-mini', vision_model: 'gpt-4o', builtin: false, remote: true, key_set: true };

describe('ProvidersCardComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ProvidersCardComponent>;
  let el: HTMLElement;
  let confirm = true;

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (id: string, value: string) => {
    const input = q(id)!.matches('input') ? (q(id) as HTMLInputElement) : (q(id)!.querySelector('input') as HTMLInputElement);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  async function open(list: ProviderInfo[] = [BUILTIN]) {
    await TestBed.configureTestingModule({
      imports: [ProvidersCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AvailabilityStore, useValue: { refresh: () => Promise.resolve() } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(confirm) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProvidersCardComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/providers').flush({ providers: list });
    await settle();
  }

  afterEach(() => http.verify());

  it('lists the built-in Ollama as read only, and a saved provider with its marks', async () => {
    await open([BUILTIN, OPENROUTER]);
    expect(q('provider-ollama')?.textContent).toContain('integrado');
    expect(q('provider-edit-ollama')).toBeNull();
    expect(q('provider-delete-ollama')).toBeNull();
    expect(q('provider-openrouter')?.textContent).toContain('https://openrouter.ai/api/v1');
    expect(q('provider-openrouter')?.querySelector('[data-testid="provider-remote"]')).not.toBeNull();
    expect(q('provider-openrouter')?.querySelector('[data-testid="provider-key-set"]')).not.toBeNull();
    expect(q('provider-edit-openrouter')).not.toBeNull();
  });

  it('adds a provider, sending the typed key, and lists it afterwards', async () => {
    await open();
    q('provider-add')!.click();
    await settle();
    await type('provider-name', 'OpenRouter');
    await type('provider-url', 'https://openrouter.ai/api/v1');
    await type('provider-text-model', 'gpt-4o-mini');
    await type('provider-key', 'sk-secret-123');
    (q('provider-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne({ method: 'POST', url: '/api/providers' });
    expect(req.request.body).toMatchObject({ name: 'OpenRouter', type: 'openai', base_url: 'https://openrouter.ai/api/v1', text_model: 'gpt-4o-mini', key: 'sk-secret-123' });
    req.flush({ ...OPENROUTER });
    await settle();
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, OPENROUTER] });
    await settle();
    expect(q('provider-openrouter')).not.toBeNull();
    expect(q('provider-form')).toBeNull();
  });

  it('never shows a saved key: editing opens an empty key field with a "saved" mark, and saving without typing leaves the key', async () => {
    await open([BUILTIN, OPENROUTER]);
    q('provider-edit-openrouter')!.click();
    await settle();
    const key = q('provider-key') as HTMLInputElement;
    expect(key.value).toBe('');
    expect(key.type).toBe('password');
    expect(q('provider-key-saved')).not.toBeNull();
    await type('provider-vision-model', 'gpt-4o-mini');
    (q('provider-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne({ method: 'PUT', url: '/api/providers/openrouter' });
    expect('key' in req.request.body).toBe(false);
    expect(req.request.body.vision_model).toBe('gpt-4o-mini');
    req.flush({ ...OPENROUTER, vision_model: 'gpt-4o-mini' });
    await settle();
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, { ...OPENROUTER, vision_model: 'gpt-4o-mini' }] });
    await settle();
  });

  it('removes a saved key with its button: the provider stays and the empty key is sent', async () => {
    await open([BUILTIN, OPENROUTER]);
    q('provider-edit-openrouter')!.click();
    await settle();
    q('provider-key-remove')!.click();
    await settle();
    expect(q('provider-key-saved')).toBeNull();
    expect(q('provider-key-removing')).not.toBeNull();
    (q('provider-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne({ method: 'PUT', url: '/api/providers/openrouter' });
    expect(req.request.body.key).toBe('');
    req.flush({ ...OPENROUTER, key_set: false });
    await settle();
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, { ...OPENROUTER, key_set: false }] });
    await settle();
    expect(q('provider-openrouter')).not.toBeNull();
    expect(q('provider-openrouter')?.querySelector('[data-testid="provider-key-set"]')).toBeNull();
  });

  it('shows the server reason next to the form and keeps the list unchanged', async () => {
    await open();
    q('provider-add')!.click();
    await settle();
    await type('provider-name', 'Bad');
    await type('provider-url', 'https://u:p@h/v1');
    (q('provider-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne({ method: 'POST', url: '/api/providers' }).flush({ error: { code: 'invalid', message: 'credentials in the address are not allowed' } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(q('provider-error')?.textContent).toContain('credentials');
    expect(q('provider-form')).not.toBeNull();
  });

  it('tests a provider and shows whether it answers, or the reason', async () => {
    await open([BUILTIN, OPENROUTER]);
    q('provider-test-openrouter')!.click();
    http.expectOne({ method: 'POST', url: '/api/providers/openrouter/test' }).flush({ ok: true, host: 'https://openrouter.ai/api/v1', remote: true, models: [{ name: 'gpt-4o' }, { name: 'gpt-4o-mini' }] });
    await settle();
    expect(q('provider-result-openrouter')?.getAttribute('data-ok')).toBe('true');
    expect(q('provider-result-openrouter')?.textContent).toContain('gpt-4o');
    q('provider-test-ollama')!.click();
    http.expectOne('/api/providers/ollama/test').flush({ ok: false, host: 'http://127.0.0.1:11434', remote: false, error: 'no provider answers at http://127.0.0.1:11434 (connection refused)' });
    await settle();
    expect(q('provider-result-ollama')?.textContent).toContain('connection refused');
  });

  it('deletes a provider only after confirming', async () => {
    await open([BUILTIN, OPENROUTER]);
    confirm = false;
    q('provider-delete-openrouter')!.click();
    await settle();
    http.expectNone({ method: 'DELETE', url: '/api/providers/openrouter' });
    confirm = true;
    q('provider-delete-openrouter')!.click();
    await settle(); // the confirmation dialog resolves asynchronously
    http.expectOne({ method: 'DELETE', url: '/api/providers/openrouter' }).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    http.expectOne('/api/providers').flush({ providers: [BUILTIN] });
    await settle();
    expect(q('provider-openrouter')).toBeNull();
  });
});
