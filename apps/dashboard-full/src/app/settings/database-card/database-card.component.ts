import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { DatabaseDriver, DatabaseRequest, DatabaseSettings, DatabaseTestResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { PanelComponent } from '../../shared/panel/panel.component';

const DEFAULT_PORT: Record<string, number> = { mysql: 3306, postgres: 5432 };

/**
 * Where the run history is kept: the SQLite file (the default) or a MySQL or Postgres server that several servers
 * can share. The engine is read when the server starts, so a change asks for a restart. The password is never
 * shown: a form that leaves it empty keeps the saved one.
 */
@Component({
  selector: 'app-database-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule],
  templateUrl: './database-card.component.html',
  styleUrl: './database-card.component.scss',
})
export class DatabaseCardComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly db = signal<DatabaseSettings | null>(null);
  protected readonly driver = signal<DatabaseDriver>('sqlite');
  protected readonly host = signal('');
  protected readonly port = signal('');
  protected readonly name = signal('');
  protected readonly user = signal('');
  protected readonly password = signal('');
  protected readonly serverName = signal('');

  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly copying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly test = signal<DatabaseTestResult | null>(null);
  protected readonly copied = signal<Record<string, number> | null>(null);

  protected readonly remote = computed(() => this.driver() !== 'sqlite');
  protected readonly defaultPort = computed(() => DEFAULT_PORT[this.driver()] ?? 0);

  /** The history of the file can be copied: a server is saved and this one still uses the file. */
  protected readonly canCopy = computed(() => {
    const d = this.db();
    return !!d && d.saved.driver !== 'sqlite' && d.active.driver === 'sqlite';
  });

  async ngOnInit(): Promise<void> {
    try {
      this.apply(await firstValueFrom(this.api.getDatabase()));
    } catch {
      this.error.set($localize`:@@db.loadFailed:Could not read where the history is kept.`);
    }
  }

  private apply(d: DatabaseSettings): void {
    this.db.set(d);
    this.driver.set(d.saved.driver);
    this.host.set(d.saved.host ?? '');
    this.port.set(d.saved.port ? String(d.saved.port) : '');
    this.name.set(d.saved.name ?? '');
    this.user.set(d.saved.user ?? '');
    this.password.set('');
    this.serverName.set(d.server_name);
  }

  protected request(withServerName: boolean): DatabaseRequest {
    const body: DatabaseRequest = { driver: this.driver() };
    if (this.remote()) {
      body.host = this.host().trim();
      body.name = this.name().trim();
      body.user = this.user().trim();
      const port = Number(this.port());
      if (this.port().trim() && Number.isFinite(port)) body.port = port;
      if (this.password()) body.password = this.password();
    }
    if (withServerName) body.server_name = this.serverName().trim();
    return body;
  }

  protected pick(driver: DatabaseDriver): void {
    this.driver.set(driver);
    this.test.set(null);
    this.error.set(null);
  }

  protected async runTest(): Promise<void> {
    this.testing.set(true);
    this.error.set(null);
    this.test.set(null);
    try {
      this.test.set(await firstValueFrom(this.api.testDatabase(this.request(false))));
    } catch (e) {
      this.error.set(messageOf(e, $localize`:@@db.testFailed:Could not test the connection.`));
    } finally {
      this.testing.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.copied.set(null);
    try {
      this.apply(await firstValueFrom(this.api.putDatabase(this.request(true))));
    } catch (e) {
      this.error.set(messageOf(e, $localize`:@@db.saveFailed:Could not save.`));
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(): Promise<void> {
    this.copying.set(true);
    this.error.set(null);
    try {
      this.copied.set((await firstValueFrom(this.api.copyDatabase())).copied);
    } catch (e) {
      this.error.set(messageOf(e, $localize`:@@db.copyFailed:Could not copy the history.`));
    } finally {
      this.copying.set(false);
    }
  }

  protected copiedText(c: Record<string, number>): string {
    return Object.entries(c)
      .filter(([, n]) => n > 0)
      .map(([table, n]) => `${table}: ${n}`)
      .join(' · ');
  }
}

function messageOf(e: unknown, fallback: string): string {
  const err = e as HttpErrorResponse;
  return err?.error?.error?.message ?? fallback;
}
