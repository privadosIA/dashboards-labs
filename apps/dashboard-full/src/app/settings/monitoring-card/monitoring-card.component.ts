import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { MonitoringEntry, MonitoringRequest, MonitoringTestResult, MonitoringTool } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { PanelComponent } from '../../shared/panel/panel.component';

/** One tool of the card as the form edits it. */
interface Row {
  id: MonitoringTool;
  name: string;
  address: string;
  user: string;
  /** What is typed; empty keeps the saved key. */
  secret: string;
  secretSet: boolean;
  /** The saved address, to know whether the form changed. */
  saved: string;
  placeholder: string;
  busy: boolean;
  test: MonitoringTestResult | null;
  error: string | null;
}

const TOOLS: { id: MonitoringTool; name: string; placeholder: string }[] = [
  { id: 'grafana', name: 'Grafana', placeholder: '192.0.2.20:3000' },
  { id: 'prometheus', name: 'Prometheus', placeholder: '192.0.2.21:9090' },
  { id: 'loki', name: 'Loki', placeholder: '192.0.2.20:3100' },
  { id: 'redis', name: 'Redis', placeholder: '192.0.2.20:6379' },
];

/**
 * The addresses and keys of the tools the user runs beside the server: Grafana, Prometheus, Loki and Redis. The
 * server depends on none of them (they may be switched off): it keeps what it is told and looks at a tool when asked.
 * With a user the calls use Basic authentication; with no user the key is a token. The key is never shown again.
 */
@Component({
  selector: 'app-monitoring-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  templateUrl: './monitoring-card.component.html',
  styleUrl: './monitoring-card.component.scss',
})
export class MonitoringCardComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly rows = signal<Row[]>([]);
  protected readonly loadError = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.apply((await firstValueFrom(this.api.getMonitoring())).tools);
    } catch {
      this.loadError.set(true);
    }
  }

  private apply(tools: MonitoringEntry[]): void {
    this.rows.set(
      TOOLS.map((t) => {
        const e = tools.find((x) => x.id === t.id);
        return { ...t, address: e?.address ?? '', user: e?.user ?? '', secret: '', secretSet: !!e?.secret_set, saved: e?.address ?? '', busy: false, test: null, error: null };
      }),
    );
  }

  protected patch(id: MonitoringTool, change: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  }

  private body(r: Row): MonitoringRequest {
    return { address: r.address.trim(), user: r.user.trim(), ...(r.secret ? { secret: r.secret } : {}) };
  }

  /** Where the tool's own page is (Grafana, Prometheus and Loki have one; Redis does not). */
  protected link(r: Row): string | null {
    return r.saved && r.id !== 'redis' ? r.saved : null;
  }

  protected async runTest(r: Row): Promise<void> {
    this.patch(r.id, { busy: true, test: null, error: null });
    try {
      this.patch(r.id, { test: await firstValueFrom(this.api.testMonitoring(r.id, this.body(r))) });
    } catch (e) {
      this.patch(r.id, { error: messageOf(e, $localize`:@@mon.testFailed:Could not test.`) });
    } finally {
      this.patch(r.id, { busy: false });
    }
  }

  protected async save(r: Row): Promise<void> {
    this.patch(r.id, { busy: true, error: null });
    try {
      const tools = (await firstValueFrom(this.api.putMonitoring(r.id, this.body(r)))).tools;
      const kept = this.rows().find((x) => x.id === r.id)?.test ?? null;
      this.apply(tools);
      this.patch(r.id, { test: kept });
    } catch (e) {
      this.patch(r.id, { busy: false, error: messageOf(e, $localize`:@@mon.saveFailed:Could not save.`) });
    }
  }
}

function messageOf(e: unknown, fallback: string): string {
  return (e as HttpErrorResponse)?.error?.error?.message ?? fallback;
}
