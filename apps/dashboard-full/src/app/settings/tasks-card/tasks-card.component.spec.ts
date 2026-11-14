import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ProviderInfo, RoutingResponse } from '../../core/api.models';
import { TasksCardComponent } from './tasks-card.component';
import { AvailabilityStore } from '../../core/availability.store';

const BUILTIN: ProviderInfo = { id: 'ollama', name: 'Ollama', type: 'ollama', base_url: 'http://127.0.0.1:11434', text_model: '', vision_model: '', builtin: true, remote: false, key_set: false };
const CLOUD: ProviderInfo = { id: 'cloud', name: 'Cloud', type: 'openai', base_url: 'https://api.example.com/v1', text_model: 'gpt-mini', vision_model: '', builtin: false, remote: true, key_set: true };
const LAN: ProviderInfo = { id: 'lan', name: 'LAN', type: 'openai', base_url: 'http://127.0.0.1:8000/v1', text_model: 't', vision_model: 'v', builtin: false, remote: false, key_set: false };

const local = (name = 'Ollama', provider = 'ollama', model = '') => ({ provider, name, remote: false, consented: true, model });
const ROUTING: RoutingResponse = {
  routing: { assistant: local(), describe_image: local(), describe_video: local(), quality: local(), motion_graphics: local() },
  max_calls: 60,
};

describe('TasksCardComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TasksCardComponent>;
  let el: HTMLElement;
  let accept = true;
  let lastDialog: { message?: string; title?: string } = {};

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const settle = async () => {
    await fixture.whenStable();
    for (let i = 0; i < 6; i++) await Promise.resolve(); // the card's own awaits
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const flushLoad = async (routing: RoutingResponse = ROUTING, providers: ProviderInfo[] = [BUILTIN, CLOUD, LAN]) => {
    http.expectOne('/api/routing').flush(routing);
    http.expectOne('/api/providers').flush({ providers });
    await settle();
  };

  beforeEach(async () => {
    accept = true;
    lastDialog = {};
    await TestBed.configureTestingModule({
      imports: [TasksCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AvailabilityStore, useValue: { refresh: () => Promise.resolve() } },
        {
          provide: MatDialog,
          useValue: { open: (_c: unknown, cfg: { data: { message: string; title: string } }) => ((lastDialog = cfg.data), { afterClosed: () => of(accept) }) },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TasksCardComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await flushLoad();
  });

  afterEach(() => http.verify());

  it('has a row per task, all on the built-in Ollama by default, with no badge', () => {
    for (const t of ['assistant', 'describe_image', 'describe_video', 'quality', 'motion_graphics']) {
      expect(q('task-' + t)).not.toBeNull();
    }
    expect(el.querySelectorAll('[data-testid="provider-badge"]').length).toBe(0);
    expect(q('task-model-assistant')?.textContent?.trim()).toBe('—');
  });

  it('disables a provider that lacks the model the task needs, with the reason', () => {
    // Cloud has a text model but no vision model; the vision tasks cannot use it, the assistant can
    const opt = (task: string, id: string) => q(`task-option-${task}-${id}`);
    // options live in the overlay once the select opens; check through the component's own rule
    const comp = fixture.componentInstance as unknown as { unavailable(p: ProviderInfo, t: string): string };
    expect(comp.unavailable(CLOUD, 'describe_image')).toContain('visión');
    expect(comp.unavailable(CLOUD, 'quality')).toContain('visión');
    expect(comp.unavailable(CLOUD, 'assistant')).toBe('');
    expect(comp.unavailable(LAN, 'describe_video')).toBe('');
    expect(comp.unavailable(BUILTIN, 'describe_image')).toBe('');
    expect(opt).toBeDefined();
  });

  it('a local provider is saved without any dialog', async () => {
    const comp = fixture.componentInstance as unknown as { choose(t: string, id: string): Promise<void> };
    const p = comp.choose('assistant', 'lan');
    await Promise.resolve();
    const req = http.expectOne({ method: 'PUT', url: '/api/routing' });
    expect(req.request.body).toEqual({ routing: { assistant: 'lan' } });
    expect(lastDialog.message).toBeUndefined();
    req.flush({ ...ROUTING, routing: { ...ROUTING.routing, assistant: local('LAN', 'lan', 't') } });
    await settle();
    await Promise.resolve();
    http.expectOne('/api/routing').flush({ ...ROUTING, routing: { ...ROUTING.routing, assistant: local('LAN', 'lan', 't') } });
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await p;
    await settle();
    expect(q('task-model-assistant')?.textContent?.trim()).toBe('t');
  });

  it('a remote provider opens a consent dialog naming it and what is sent, and is saved only after accepting', async () => {
    const comp = fixture.componentInstance as unknown as { choose(t: string, id: string): Promise<void> };
    const p = comp.choose('assistant', 'cloud');
    await settle();
    expect(lastDialog.message).toContain('Cloud');
    expect(lastDialog.message).toContain('https://api.example.com/v1');
    expect(lastDialog.message).toContain('textos');
    const req = http.expectOne({ method: 'PUT', url: '/api/routing' });
    expect(req.request.body).toEqual({ routing: { assistant: 'cloud' }, acknowledge_remote: true });
    const after = { ...ROUTING, routing: { ...ROUTING.routing, assistant: { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-mini' } } };
    req.flush(after);
    await settle();
    http.expectOne('/api/routing').flush(after);
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await p;
    await settle();
    expect(q('task-model-assistant')?.textContent?.trim()).toBe('gpt-mini');
  });

  it('cancelling the consent dialog saves nothing and leaves the selector where it was', async () => {
    accept = false;
    const comp = fixture.componentInstance as unknown as { choose(t: string, id: string): Promise<void> };
    const p = comp.choose('describe_image', 'cloud');
    await settle();
    http.expectNone({ method: 'PUT', url: '/api/routing' });
    http.expectOne('/api/routing').flush(ROUTING); // re-read to put the selector back
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await p;
    await settle();
    expect(q('task-model-describe_image')?.textContent?.trim()).toBe('—');
  });

  it('shows the server reason next to the row when it refuses', async () => {
    const comp = fixture.componentInstance as unknown as { choose(t: string, id: string): Promise<void> };
    const p = comp.choose('quality', 'lan');
    await Promise.resolve();
    http.expectOne({ method: 'PUT', url: '/api/routing' }).flush({ error: { code: 'no_model', message: 'set a vision model for the provider' } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    http.expectOne('/api/routing').flush(ROUTING);
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await p;
    await settle();
    expect(q('task-error-quality')?.textContent).toContain('vision model');
  });

  it('shows the badge for a task that runs on a remote provider', async () => {
    http.verify();
    const remote: RoutingResponse = { ...ROUTING, routing: { ...ROUTING.routing, assistant: { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-mini' } } };
    fixture.componentRef.setInput('version', 1);
    fixture.detectChanges();
    await flushLoad(remote);
    // the badge reads the shared store, which the card fed with the routing it loaded
    expect(el.querySelectorAll('[data-testid="provider-badge"]').length).toBe(1);
    expect(q('task-assistant')?.textContent).toContain('Cloud');
  });

  it('saves the call cap and refuses a value below 1 without asking the server', async () => {
    const comp = fixture.componentInstance as unknown as { setCap(v: string): Promise<void> };
    await comp.setCap('0');
    http.expectNone({ method: 'PUT', url: '/api/routing' });
    await settle();
    expect(q('task-cap-error')).not.toBeNull();
    const p = comp.setCap('25');
    await Promise.resolve();
    const req = http.expectOne({ method: 'PUT', url: '/api/routing' });
    expect(req.request.body).toEqual({ max_calls: 25 });
    req.flush({ ...ROUTING, max_calls: 25 });
    await p;
    await settle();
    expect((q('task-cap') as HTMLInputElement).value).toBe('25');
  });
});

describe('TasksCardComponent: a choice that is not saved', () => {
  it('puts the selector back on the provider in use when the consent is cancelled', async () => {
    await TestBed.configureTestingModule({
      imports: [TasksCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AvailabilityStore, useValue: { refresh: () => Promise.resolve() } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(false) }) } },
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TasksCardComponent);
    fixture.detectChanges();
    http.expectOne('/api/routing').flush(ROUTING);
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await fixture.whenStable();
    for (let i = 0; i < 6; i++) await Promise.resolve(); // the card's own awaits: the providers must be known
    const select = { value: 'cloud' }; // what the user just picked
    const comp = fixture.componentInstance as unknown as { choose(t: string, id: string, s: { value: unknown }): Promise<void> };
    const p = comp.choose('assistant', 'cloud', select);
    await fixture.whenStable();
    for (let i = 0; i < 6; i++) await Promise.resolve(); // the dialog answers, then the card re-reads
    http.expectOne('/api/routing').flush(ROUTING);
    http.expectOne('/api/providers').flush({ providers: [BUILTIN, CLOUD, LAN] });
    await p;
    expect(select.value).toBe('ollama');
    http.verify();
  });
});
