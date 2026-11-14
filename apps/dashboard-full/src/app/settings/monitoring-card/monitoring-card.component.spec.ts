import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MonitoringEntry } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { MonitoringCardComponent } from './monitoring-card.component';

const EMPTY: MonitoringEntry[] = [
  { id: 'grafana', secret_set: false },
  { id: 'prometheus', secret_set: false },
  { id: 'loki', secret_set: false },
  { id: 'redis', secret_set: false },
];
const SAVED: MonitoringEntry[] = [
  { id: 'grafana', address: 'http://192.168.1.20:3000', user: '', secret_set: true },
  { id: 'prometheus', address: 'http://192.168.1.21:9090', secret_set: false },
  { id: 'loki', secret_set: false },
  { id: 'redis', address: '192.168.1.20:6379', secret_set: true },
];

describe('MonitoringCardComponent', () => {
  let fixture: ComponentFixture<MonitoringCardComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (id: string, value: string) => {
    const input = q<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  async function open(tools: MonitoringEntry[]) {
    api = {
      getMonitoring: vi.fn(() => of({ tools })),
      putMonitoring: vi.fn(() => of({ tools })),
      testMonitoring: vi.fn(() => of({ ok: true, version: '13.2.2', authenticated: true })),
    };
    await TestBed.configureTestingModule({ imports: [MonitoringCardComponent], providers: [{ provide: ApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(MonitoringCardComponent);
    fixture.detectChanges();
    await settle();
  }

  it('lists the four tools, empty at first: no link, nothing to test', async () => {
    await open(EMPTY);
    for (const id of ['grafana', 'prometheus', 'loki', 'redis']) expect(q('mon-' + id)).not.toBeNull();
    expect(q('mon-open-grafana')).toBeNull();
    expect(q<HTMLButtonElement>('mon-test-grafana')!.disabled).toBe(true);
  });

  it('shows what is saved without the key, and links the tools that have a page', async () => {
    await open(SAVED);
    expect(q<HTMLInputElement>('mon-address-grafana')!.value).toBe('http://192.168.1.20:3000');
    expect(q<HTMLInputElement>('mon-secret-grafana')!.value).toBe('');
    expect(q<HTMLInputElement>('mon-secret-grafana')!.placeholder).toBe('••••••••');
    expect(q<HTMLAnchorElement>('mon-open-grafana')!.getAttribute('href')).toBe('http://192.168.1.20:3000');
    expect(q('mon-open-redis')).toBeNull(); // Redis has no page
    expect(q('mon-open-loki')).toBeNull(); // nothing saved
  });

  it('tests with the form and saves nothing, naming the version and that the key was accepted', async () => {
    await open(EMPTY);
    await type('mon-address-grafana', '192.168.1.20:3000');
    await type('mon-secret-grafana', 'glsa_x');
    (q('mon-test-grafana') as HTMLButtonElement).click();
    await settle();
    expect(api['testMonitoring']).toHaveBeenCalledWith('grafana', { address: '192.168.1.20:3000', user: '', secret: 'glsa_x' });
    expect(api['putMonitoring']).not.toHaveBeenCalled();
    expect(q('mon-result-grafana')!.textContent).toContain('13.2.2');
    expect(q('mon-result-grafana')!.textContent).toContain('acepta el usuario');
  });

  it('saving sends the key only when one was typed', async () => {
    await open(SAVED);
    (q('mon-save-redis') as HTMLButtonElement).click();
    await settle();
    expect(api['putMonitoring']).toHaveBeenCalledWith('redis', { address: '192.168.1.20:6379', user: '' });
    await type('mon-secret-redis', 'nueva');
    (q('mon-save-redis') as HTMLButtonElement).click();
    await settle();
    expect(api['putMonitoring']).toHaveBeenLastCalledWith('redis', { address: '192.168.1.20:6379', user: '', secret: 'nueva' });
  });

  it('a tool that is off shows why, and a refused address shows the server\'s words', async () => {
    await open(SAVED);
    api['testMonitoring'].mockReturnValue(of({ ok: false, error: 'dial tcp 192.168.1.21:9090: connection refused' }));
    (q('mon-test-prometheus') as HTMLButtonElement).click();
    await settle();
    expect(q('mon-result-prometheus')!.getAttribute('data-ok')).toBe('false');
    expect(q('mon-result-prometheus')!.textContent).toContain('connection refused');
    api['putMonitoring'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: { code: 'invalid_request', message: 'the port is not valid' } } })));
    (q('mon-save-prometheus') as HTMLButtonElement).click();
    await settle();
    expect(q('mon-error-prometheus')!.textContent).toContain('the port is not valid');
  });
});
