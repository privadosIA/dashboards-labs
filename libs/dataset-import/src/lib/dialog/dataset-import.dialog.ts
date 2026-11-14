import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { PROJECT_ID_PATTERN, firstEntry, projectIdFromFile, type DatasetPreview } from '../model';
import { DatasetFailed, type DatasetFailure } from '../port';
import { datasetTexts } from '../texts';
import { DATASET_ENTRY_SINK, DATASET_IMPORT_OPTIONS, DATASET_PORT } from '../tokens';

/** What the dialog is showing: choosing the file, the server's report, or the project that was made. */
type Step = 'file' | 'report' | 'done';

/** The text of a file, read in the browser (the server does the parsing). */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Importing a dataset: choose the file, read what the server made of it, name the project and confirm. The server owns the dataset's formats:
 * the dialog sends the file's text as it is and shows the server's report and counts before anything is created.
 */
@Component({
  selector: 'lab-dataset-import-dialog',
  templateUrl: './dataset-import.dialog.html',
  styleUrl: './dataset-import.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetImportDialog {
  protected readonly ref = inject<MatDialogRef<DatasetImportDialog, string | undefined>>(MatDialogRef);
  private readonly port = inject(DATASET_PORT);
  private readonly options = inject(DATASET_IMPORT_OPTIONS);
  private readonly sink = inject(DATASET_ENTRY_SINK, { optional: true });
  protected readonly t = datasetTexts(this.options.lang);
  protected readonly mode = this.options.mode;

  protected readonly step = signal<Step>('file');
  protected readonly busy = signal(false);
  protected readonly preview = signal<DatasetPreview | null>(null);
  protected readonly fileName = signal('');
  protected readonly name = signal('');
  protected readonly failure = signal<DatasetFailure | null>(null);
  /** The server's own words about a file it refused, when it gave any (it names what to change). */
  protected readonly reason = signal('');
  protected readonly createdId = signal('');
  /** The title of the entry the dashboard took into its form, when it did. */
  protected readonly filled = signal<string | null>(null);

  /** The name is valid when it follows the server's pattern. */
  protected readonly validName = computed(() => PROJECT_ID_PATTERN.test(this.name()));
  protected readonly message = computed(() => {
    const f = this.failure();
    return f ? this.t.errors[f] : '';
  });
  protected readonly createdText = computed(() =>
    this.t.created[this.mode].replace('{n}', String(this.preview()?.imported ?? 0)).replace('{id}', this.createdId()),
  );

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.failure.set(null);
    this.reason.set('');
    this.busy.set(true);
    try {
      const preview = await firstValueFrom(this.port.preview(await readText(file), this.mode));
      this.preview.set(preview);
      this.fileName.set(file.name);
      this.name.set(projectIdFromFile(file.name));
      this.step.set('report');
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  protected rename(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value.trim());
    this.failure.set(null);
    this.reason.set('');
  }

  protected async confirm(): Promise<void> {
    const preview = this.preview();
    if (!preview || !this.validName() || this.busy()) return;
    this.failure.set(null);
    this.reason.set('');
    this.busy.set(true);
    try {
      this.createdId.set(await firstValueFrom(this.port.confirm(this.name(), preview.yaml)));
      this.fill(preview);
      this.step.set('done');
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown): void {
    this.failure.set(e instanceof DatasetFailed ? e.kind : 'unreachable');
    this.reason.set(e instanceof DatasetFailed && e.kind === 'rejected' ? e.detail : '');
  }

  /** The dashboard takes the first entry into its form; the done step says so. */
  private fill(preview: DatasetPreview): void {
    const entry = this.sink ? firstEntry(preview.yaml, this.mode) : null;
    if (!entry || !this.sink || !(entry.style || entry.tags || entry.lyrics)) return;
    this.sink(entry);
    this.filled.set(entry.title || ((entry.style || entry.tags).length > 48 ? `${(entry.style || entry.tags).slice(0, 48).trimEnd()}…` : entry.style || entry.tags));
  }

  /** Back to the file step to choose another one. */
  protected again(): void {
    this.preview.set(null);
    this.failure.set(null);
    this.reason.set('');
    this.step.set('file');
  }
}
