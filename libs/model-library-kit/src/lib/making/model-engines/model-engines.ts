import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { BackendId, BackendStatus, EngineStatus } from '../../port';
import { InstallPlanDialog } from '../install-plan/install-plan';
import { MakingStore } from '../making.store';

/** The names the engines are shown under. */
const LABELS: Record<string, string> = { triposr: 'TripoSR', sf3d: 'Stable Fast 3D' };
/** The reasons that an install can fix (the others, as Docker that does not answer or a missing key, are not the install's to fix). */
const INSTALLABLE = ['no_service', 'no_weights', 'no_image'];
/** The engine's own reasons that the server refuses an install for (a key or a licence that is not the install's to give). */
const BLOCKED = ['key_missing', 'key_rejected', 'licence_not_accepted'];

/**
 * The engines that make 3D models: whether each can be used now or why not (in words), how each runs (the .NET service or the Docker container: which is in use, what each lacks and the choice between them), the start and stop
 * of each engine's own service, and the install of what is missing, which starts only from the dialog that shows the plan (by backend and by parts) and asks for confirmation. A server that sends no backends is shown as before.
 * The store belongs to the section that holds this panel.
 */
@Component({
  selector: 'lab-model-engines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, AutoAnimateDirective],
  templateUrl: './model-engines.html',
  styleUrl: './model-engines.scss',
})
export class ModelEngines {
  protected readonly store = inject(MakingStore);
  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang).making;

  protected readonly rows = computed(() =>
    this.store.names().map((id) => {
      const status = this.store.engines()[id];
      const container = status.container?.state ?? 'stopped';
      const external = status.mode === 'external';
      const job = this.store.jobs()[id];
      const inUse = this.store.backendOf(id);
      const running = job?.state === 'running';
      return {
        id,
        label: LABELS[id] ?? id,
        status,
        container,
        external,
        job,
        reason: this.reason(status),
        canStart: !status.available && status.reason === 'not_running' && !external && container === 'stopped',
        canStop: container === 'running' && !external,
        // an engine with backends installs from the row of its backend; one without them (an older server) has the one button
        canInstall: !status.backends && !!status.reason && INSTALLABLE.includes(status.reason) && !external && !running,
        backends: external ? [] : this.backendRows(id, status, inUse, running),
        canUseDefault: this.store.canChoose(id) && this.store.backend()?.source === 'setting',
        busy: this.store.busy().has(id),
        problem: this.store.problems()[id] ?? '',
      };
    }),
  );

  /** One row for each way the engine can run: what it lacks in words, whether it is the one in use, and what can be done with it. */
  private backendRows(id: string, status: EngineStatus, inUse: string, running: boolean) {
    const b = this.t.backends;
    return Object.entries(status.backends ?? {}).map(([name, backend]: [string, BackendStatus]) => {
      const used = name === inUse;
      const items = (backend.missing ?? []).map((m) => b.missing[m] ?? m).join(', ');
      return {
        id: name,
        label: b.names[name] ?? name,
        used,
        source: used && this.store.backend() ? (this.store.backend()?.source === 'setting' ? b.saved : b.byDefault) : '',
        text: backend.available ? b.ready : b.lacks(items, backend.need_bytes),
        ready: backend.available,
        canUse: !used && this.store.canChoose(id),
        canInstall: !backend.available && !!backend.reason && INSTALLABLE.includes(backend.reason) && !BLOCKED.includes(status.reason ?? '') && !running,
      };
    });
  }

  /** In words: the sentence of the reason when there is one, otherwise what the server said, otherwise the code. */
  private reason(status: EngineStatus): string {
    if (status.available || !status.reason) return '';
    return this.t.engines.reasons[status.reason] ?? (status.detail || this.t.engines.unknownReason(status.reason));
  }

  protected start(id: string): void {
    void this.store.start(id);
  }

  protected stop(id: string): void {
    void this.store.stop(id);
  }

  /** Opens the plan of an install: for the backend in use, or for another one (the container can be installed before it is chosen). */
  protected install(id: string, backend?: string): void {
    this.dialog.open(InstallPlanDialog, { data: { store: this.store, engine: id, label: LABELS[id] ?? id, ...(backend ? { backend: backend as BackendId } : {}) }, width: '34rem', maxWidth: '92vw' });
  }

  protected use(backend: string): void {
    void this.store.setBackend(backend as BackendId);
  }

  protected useDefault(): void {
    void this.store.setBackend('');
  }

  protected cancelInstall(id: string): void {
    void this.store.cancelInstall(id);
  }
}
