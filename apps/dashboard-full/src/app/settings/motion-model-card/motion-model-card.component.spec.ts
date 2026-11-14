import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MotionModelSettings } from '../../core/api.models';
import { MotionModelCardComponent } from './motion-model-card.component';

describe('MotionModelCardComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<MotionModelCardComponent>;
  let changed: (MotionModelSettings | null)[];
  const q = (id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid=${id}]`);
  const type = (value: string) => {
    const input = q('motion-model-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  function open(model: MotionModelSettings): void {
    TestBed.configureTestingModule({ imports: [MotionModelCardComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MotionModelCardComponent);
    changed = [];
    fixture.componentInstance.changed.subscribe((m) => changed.push(m));
    fixture.componentRef.setInput('model', model);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('says which model is used: the assistant\'s until one is chosen', () => {
    open({ saved: '', default: 'qwen3:8b' });
    expect(q('motion-model-current')?.textContent).toContain('qwen3:8b');
    expect(q('motion-model-current')?.textContent).toContain('el predeterminado');
    expect(q('motion-model-reset')).toBeNull();
  });

  it('reads the installed models only when the field is first used', async () => {
    open({ saved: '', default: 'qwen3:8b' });
    http.expectNone('/api/assist/models');
    (q('motion-model-input') as HTMLInputElement).dispatchEvent(new Event('focus'));
    http.expectOne('/api/assist/models').flush({ default: 'qwen3:8b', models: [{ name: 'qwen3-coder:30b', size_bytes: 1, fits: true }] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Array.from(fixture.nativeElement.querySelectorAll('datalist option')).map((o) => (o as HTMLOptionElement).value)).toEqual(['qwen3-coder:30b']);
    (q('motion-model-input') as HTMLInputElement).dispatchEvent(new Event('focus')); // not asked again
  });

  it('saves the typed model and reports the result', async () => {
    open({ saved: '', default: 'qwen3:8b' });
    expect((q('motion-model-save') as HTMLButtonElement).disabled).toBe(true); // nothing changed
    type('qwen3-coder:30b');
    (q('motion-model-save') as HTMLButtonElement).click();
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ motion_model: 'qwen3-coder:30b' });
    const after = { saved: 'qwen3-coder:30b', default: 'qwen3:8b' };
    req.flush({ ollama: {}, motion_model: after });
    await fixture.whenStable();
    expect(changed).toEqual([after]);
    http.match((r) => r.url === '/api/models/availability').forEach((r) => r.flush({ tasks: {} }));
  });

  it('shows the server\'s reason for a name it refuses', async () => {
    open({ saved: '', default: 'qwen3:8b' });
    type('two words');
    (q('motion-model-save') as HTMLButtonElement).click();
    http.expectOne('/api/settings').flush({ error: { code: 'invalid', message: 'the model name cannot contain spaces or control characters' } }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('motion-model-error')?.textContent).toContain('cannot contain spaces');
    expect(changed).toEqual([]);
  });

  it('goes back to the assistant\'s model', () => {
    open({ saved: 'qwen3-coder:30b', default: 'qwen3:8b' });
    (q('motion-model-reset') as HTMLButtonElement).click();
    expect(http.expectOne('/api/settings').request.body).toEqual({ motion_model: '' });
  });
});
