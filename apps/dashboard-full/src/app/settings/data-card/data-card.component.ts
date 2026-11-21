import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom } from 'rxjs';

import { DataCleanAnswer, DataImportRecord, DataStatus } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ShareService } from '../../core/share.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { exportName } from './export-name';

/** What the card is waiting for: while it is not empty the buttons are disabled and a progress bar shows. */
type Busy = '' | 'status' | 'import' | 'export' | 'clean';

/** What went wrong in an action, in the server's words; `nothingDeleted` is for the cleaning, which says so. */
interface Problem {
  text: string;
  nothingDeleted: boolean;
}

/**
 * The data of the server, which now lives in a database: the engine, the migrations and the rows, what the import of the
 * old state files did, a backup of the data, and the old files that can be deleted. The server owns every rule (what can
 * be imported, what can be deleted): the card shows what it answers and the reason when it refuses.
 */
@Component({
  selector: 'app-data-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelComponent, BytesPipe, AutoAnimateDirective, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressBarModule],
  templateUrl: './data-card.component.html',
  styleUrl: './data-card.component.scss',
})
export class DataCardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly share = inject(ShareService);
  private readonly bytes = new BytesPipe();

  protected readonly status = signal<DataStatus | null>(null);
  /** The records shown: the ones of the status, with the ones an import just answered laid over them. */
  protected readonly imports = signal<DataImportRecord[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly busy = signal<Busy>('');
  protected readonly problem = signal<Problem | null>(null);
  protected readonly cleaned = signal<DataCleanAnswer['cleaned'] | null>(null);
  protected readonly ticked = signal<ReadonlySet<string>>(new Set());

  /** The entities that still have state files, with how many and how big. */
  protected readonly legacy = computed(() => (this.status()?.legacy_files ?? []).filter((l) => l.files > 0));
  protected readonly pickedLegacy = computed(() => this.legacy().filter((l) => this.ticked().has(l.entity)));

  ngOnInit(): void {
    void this.read();
  }

  /** Reads the state of the data again. A failure is shown in words and touches nothing else. */
  protected async read(): Promise<void> {
    const before = this.busy();
    if (!before) this.busy.set('status');
    try {
      const status = await firstValueFrom(this.api.getDataStatus());
      this.status.set(status);
      this.imports.set(status.imports);
      this.loadFailed.set(false);
      // what is no longer left behind cannot stay ticked
      const left = new Set(status.legacy_files.filter((l) => l.files > 0).map((l) => l.entity));
      this.ticked.update((t) => new Set([...t].filter((e) => left.has(e))));
    } catch {
      this.loadFailed.set(true);
    } finally {
      if (!before) this.busy.set('');
    }
  }

  /** Imports every entity not imported yet, or the one named again. */
  protected async runImport(entity?: string): Promise<void> {
    this.busy.set('import');
    this.problem.set(null);
    this.cleaned.set(null);
    try {
      const answer = await firstValueFrom(this.api.importData(entity));
      const by = new Map(answer.imports.map((r) => [r.entity, r]));
      this.imports.update((list) => [...list.map((r) => by.get(r.entity) ?? r), ...answer.imports.filter((r) => !list.some((x) => x.entity === r.entity))]);
    } catch (e) {
      this.problem.set({ text: reasonOf(e, $localize`:@@data.importFailed:The import could not be run.`), nothingDeleted: false });
      this.busy.set('');
      return;
    }
    this.busy.set('');
    await this.read();
  }

  /** Fetches the export with the token and saves it, named by the server when the page can read the name. */
  protected async downloadExport(): Promise<void> {
    this.busy.set('export');
    this.problem.set(null);
    try {
      const res = await firstValueFrom(this.api.downloadDataExport());
      if (!res.body) throw new Error('empty');
      this.share.saveBlob(res.body, exportName(res.headers.get('Content-Disposition')));
    } catch (e) {
      this.problem.set({ text: await reasonOfBlob(e, $localize`:@@data.exportFailed:The export could not be downloaded.`), nothingDeleted: false });
      this.busy.set('');
      return;
    }
    this.busy.set('');
    await this.read();
  }

  protected toggle(entity: string): void {
    this.ticked.update((t) => {
      const next = new Set(t);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  }

  /** Deletes the state files of the ticked entities, only after the dialog that says what is lost is confirmed. */
  protected async clean(): Promise<void> {
    const picked = this.pickedLegacy();
    if (!picked.length) return;
    const files = picked.reduce((n, l) => n + l.files, 0);
    const size = this.bytes.transform(picked.reduce((n, l) => n + l.bytes, 0));
    const names = picked.map((l) => l.entity).join(', ');
    const confirmed = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@data.cleanTitle:Delete old state files`,
        message: $localize`:@@data.cleanMessage:${files}:files: files (${size}:size:) of ${names}:entities: are deleted. Nothing else is touched: the data in the database stays.`,
        confirmLabel: $localize`:@@data.cleanConfirm:Delete old state files`,
        destructive: true,
      }),
    );
    if (!confirmed) return;
    this.busy.set('clean');
    this.problem.set(null);
    this.cleaned.set(null);
    try {
      this.cleaned.set((await firstValueFrom(this.api.cleanLegacyData(picked.map((l) => l.entity)))).cleaned);
      this.ticked.set(new Set());
    } catch (e) {
      this.problem.set({ text: reasonOf(e, $localize`:@@data.cleanFailed:The files could not be deleted.`), nothingDeleted: true });
    }
    this.busy.set('');
    await this.read();
  }
}

/** The server's reason when the answer was a blob (a failed download): its JSON error is read from it. */
async function reasonOfBlob(e: unknown, fallback: string): Promise<string> {
  const body = (e as HttpErrorResponse)?.error;
  if (body instanceof Blob) {
    try {
      return (JSON.parse(await body.text()) as { error?: { message?: string } }).error?.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  return reasonOf(e, fallback);
}

/** The server's reason, as it wrote it. */
function reasonOf(e: unknown, fallback: string): string {
  return (e as HttpErrorResponse)?.error?.error?.message ?? fallback;
}
