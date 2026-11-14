import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialogRef } from '@angular/material/dialog';
import { catchError, forkJoin, of, switchMap } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { EngineFailed } from '../../song/port';
import { SONGS } from '../../song/tokens';
import { EngineControl } from '../engine-control';

type RowId = 'heartmula' | 'diffrhythm2' | 'clap' | 'muq';
type RowState = 'running' | 'starting' | 'stopped' | 'ready' | 'unavailable';

interface Row {
  id: RowId;
  name: string;
  state: RowState;
  /** Why it cannot be used, in words; empty when it can or is only stopped. */
  reason: string;
  canStart: boolean;
  canStop: boolean;
}

const NAMES: Record<RowId, string> = { heartmula: 'HeartMuLa', diffrhythm2: 'DiffRhythm2', clap: 'LAION-CLAP', muq: 'MuQ-MuLan' };

/** The music engines of the server and what they are doing: the ones with a container can be started and stopped from here. */
@Component({
  selector: 'app-engines-dialog',
  templateUrl: './engines-dialog.html',
  styleUrl: './engines-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnginesDialog {
  protected readonly ref = inject<MatDialogRef<EnginesDialog>>(MatDialogRef);
  private readonly port = inject(SONGS);
  private readonly control = inject(EngineControl);
  protected readonly t = textsFor(inject(LanguageService).lang);

  /** `undefined` until the server has answered, `null` when it could not be read; read again whenever an engine starts, stops or comes up. */
  private readonly data = toSignal(
    toObservable(this.control.version).pipe(
      switchMap(() => forkJoin({ containers: this.port.containers(), recognizers: this.port.recognizers() }).pipe(catchError(() => of(null)))),
    ),
  );
  protected readonly unreadable = computed(() => this.data() === null);
  protected readonly rows = computed<readonly Row[]>(() => {
    const data = this.data();
    if (!data) return [];
    const why = (reason?: string): string => this.t.engines.reasons[reason ?? ''] ?? this.t.engines.unknownReason;
    const containers = data.containers.map((c): Row => {
      const stopped = c.container === 'stopped' || (!c.container && !c.available && c.reason === 'not_running');
      const state: RowState = this.control.starting().has(c.engine) || c.container === 'starting' ? 'starting' : c.available ? 'running' : stopped ? 'stopped' : 'unavailable';
      return { id: c.engine, name: NAMES[c.engine], state, reason: state === 'unavailable' ? why(c.reason) : '', canStart: state === 'stopped', canStop: state === 'running' || state === 'starting' };
    });
    // MuQ-MuLan is a program and not a container: it can only say whether it can be used
    const muq = data.recognizers.find((r) => r.id === 'muq');
    const row: Row = { id: 'muq', name: NAMES.muq, state: muq?.available ? 'ready' : 'unavailable', reason: muq?.available ? '' : why(muq?.reason), canStart: false, canStop: false };
    return [...containers, row];
  });
  /** What a refused start or stop said, next to its engine. */
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  private readonly working = signal<ReadonlySet<string>>(new Set());

  protected busy(id: RowId): boolean {
    return this.working().has(id);
  }

  protected start(id: RowId): Promise<void> {
    return this.act(id, () => this.control.start(id as 'heartmula'));
  }

  protected stop(id: RowId): Promise<void> {
    return this.act(id, () => this.control.stop(id as 'heartmula'));
  }

  private async act(id: RowId, what: () => Promise<void>): Promise<void> {
    if (this.busy(id)) return;
    this.working.update((w) => new Set(w).add(id));
    this.errors.update((e) => ({ ...e, [id]: '' }));
    try {
      await what();
    } catch (err) {
      const text = err instanceof EngineFailed ? (err.kind === 'busy' ? this.t.engines.errors.busy : `${this.t.engines.errors.refused}${err.reason ? ` ${this.t.engines.reasons[err.reason] ?? ''}` : ''}`.trim()) : this.t.engines.errors.failed;
      this.errors.update((e) => ({ ...e, [id]: text }));
    } finally {
      this.working.update((w) => {
        const next = new Set(w);
        next.delete(id);
        return next;
      });
    }
  }
}
