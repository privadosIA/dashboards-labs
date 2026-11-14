import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { DatabaseSettings } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { DatabaseCardComponent } from './database-card.component';

const SQLITE: DatabaseSettings = { saved: { driver: 'sqlite', password_set: false }, active: { driver: 'sqlite', password_set: false }, restart_required: false, server_name: 'estudio', servers: [] };
const MYSQL_SAVED: DatabaseSettings = {
  saved: { driver: 'mysql', host: 'db.lan', port: 3306, name: 'mediaorquestator', user: 'mo', password_set: true },
  active: { driver: 'sqlite', password_set: false },
  restart_required: true,
  server_name: 'estudio',
  servers: ['estudio', 'portatil'],
};

describe('DatabaseCardComponent', () => {
  let fixture: ComponentFixture<DatabaseCardComponent>;
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

  async function open(initial: DatabaseSettings) {
    api = {
      getDatabase: vi.fn(() => of(initial)),
      putDatabase: vi.fn(() => of(initial)),
      testDatabase: vi.fn(() => of({ ok: true, version: '8.4.13', empty: true })),
      copyDatabase: vi.fn(() => of({ copied: { runs: 49, run_events: 758, findings: 0 } })),
    };
    await TestBed.configureTestingModule({ imports: [DatabaseCardComponent], providers: [{ provide: ApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(DatabaseCardComponent);
    fixture.detectChanges();
    await settle();
  }

  it('starts with SQLite: no server fields, no test and no copy', async () => {
    await open(SQLITE);
    expect(q('db-active')!.textContent).toContain('SQLite');
    expect(q('db-host')).toBeNull();
    expect(q('db-test')).toBeNull();
    expect(q('db-copy')).toBeNull();
    expect(q('db-restart')).toBeNull();
  });

  it('shows what is saved without the password, says a restart is needed and offers the copy', async () => {
    await open(MYSQL_SAVED);
    expect(q<HTMLInputElement>('db-host')!.value).toBe('db.lan');
    expect(q<HTMLInputElement>('db-user')!.value).toBe('mo');
    expect(q<HTMLInputElement>('db-password')!.value).toBe('');
    expect(q<HTMLInputElement>('db-password')!.placeholder).toBe('••••••••');
    expect(q('db-restart')).not.toBeNull();
    expect(q('db-copy')).not.toBeNull();
    expect(q('db-servers')!.textContent).toContain('estudio, portatil');
  });

  it('saving sends the form, with the password only when it was typed', async () => {
    await open(MYSQL_SAVED);
    await (q('db-save') as HTMLButtonElement).click();
    await settle();
    expect(api['putDatabase']).toHaveBeenCalledWith({ driver: 'mysql', host: 'db.lan', name: 'mediaorquestator', user: 'mo', port: 3306, server_name: 'estudio' });
    await type('db-password', 's3cret');
    (q('db-save') as HTMLButtonElement).click();
    await settle();
    expect(api['putDatabase']).toHaveBeenLastCalledWith(expect.objectContaining({ password: 's3cret' }));
  });

  it('tests the connection with the form and says what answered', async () => {
    await open(MYSQL_SAVED);
    (q('db-test') as HTMLButtonElement).click();
    await settle();
    expect(api['testDatabase']).toHaveBeenCalledWith(expect.objectContaining({ driver: 'mysql', host: 'db.lan' }));
    expect(api['putDatabase']).not.toHaveBeenCalled(); // testing saves nothing
    expect(q('db-test-result')!.textContent).toContain('8.4.13');
    expect(q('db-test-result')!.textContent).toContain('tablas');
  });

  it('a database that does not answer shows why, and a refused form shows the server\'s words', async () => {
    await open(MYSQL_SAVED);
    api['testDatabase'].mockReturnValue(of({ ok: false, error: 'dial tcp: connection refused' }));
    (q('db-test') as HTMLButtonElement).click();
    await settle();
    expect(q('db-test-error')!.textContent).toContain('connection refused');
    api['putDatabase'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: { code: 'invalid_request', message: 'the host is empty' } } })));
    (q('db-save') as HTMLButtonElement).click();
    await settle();
    expect(q('db-error')!.textContent).toContain('the host is empty');
  });

  it('copies the history and says how many rows of each table', async () => {
    await open(MYSQL_SAVED);
    (q('db-copy') as HTMLButtonElement).click();
    await settle();
    expect(api['copyDatabase']).toHaveBeenCalled();
    expect(q('db-copied')!.textContent).toContain('runs: 49 · run_events: 758');
    expect(q('db-copied')!.textContent).not.toContain('findings'); // nothing copied of it
  });

  it('choosing a server engine shows its fields, and SQLite hides them again', async () => {
    await open(SQLITE);
    (fixture.componentInstance as unknown as { pick(d: string): void }).pick('postgres');
    await settle();
    expect(q('db-host')).not.toBeNull();
    expect(q<HTMLInputElement>('db-port')!.placeholder).toBe('5432');
    (fixture.componentInstance as unknown as { pick(d: string): void }).pick('sqlite');
    await settle();
    expect(q('db-host')).toBeNull();
  });
});
