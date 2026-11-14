import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { PackageInstallGroup, PackageReport, RecipeFile } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ModelsStore } from '../../core/models.store';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { PROJECT_ID_PATTERN } from '../project-name-dialog/project-name-dialog.component';

export interface PackageImportResult {
  id: string;
  mode: string;
}

/**
 * Imports a project package (the full export): shows what the project uses,
 * which of it this machine has and which is missing (with a button to install
 * the missing models from the catalog), and creates the project. The UI
 * reads nothing of the zip: the server does, and its report is what is shown.
 */
@Component({
  selector: 'app-package-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    ReactiveFormsModule,
    BytesPipe,
  ],
  templateUrl: './package-import.component.html',
  styleUrl: './package-import.component.scss',
})
export class PackageImportComponent {
  private readonly api = inject(ApiService);
  private readonly ref = inject(MatDialogRef<PackageImportComponent, PackageImportResult>);
  protected readonly models = inject(ModelsStore);

  private file: File | null = null;
  protected readonly fileName = signal('');
  protected readonly busy = signal(false);
  protected readonly report = signal<PackageReport | null>(null);
  protected readonly error = signal('');

  protected readonly projectId = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(PROJECT_ID_PATTERN)],
  });

  /** Installs started from this dialog that have not finished: when the last one ends the report is read again. */
  private pending = false;

  protected readonly installing = computed(() => this.models.activeByCatalog());

  constructor() {
    void this.models.refresh();
    effect(() => {
      const running = this.models.activeByCatalog().size;
      if (running === 0 && this.pending) {
        this.pending = false;
        void this.preview(true);
      }
    });
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    if (!f) return;
    this.file = f;
    this.fileName.set(f.name);
    this.projectId.setValue('');
    await this.preview(false);
  }

  private async preview(keepId: boolean): Promise<void> {
    if (!this.file) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(this.api.previewPackage(this.file));
      this.report.set(r);
      if (!keepId || !this.projectId.value) this.projectId.setValue(r.suggested_id);
    } catch (e) {
      this.report.set(null);
      this.error.set(readMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected group(f: RecipeFile): PackageInstallGroup | undefined {
    return this.report()?.install?.find((g) => g.catalog_id === f.catalog_id);
  }

  protected async install(g: PackageInstallGroup): Promise<void> {
    try {
      this.pending = true;
      await this.models.start({ id: g.catalog_id });
    } catch {
      this.pending = false; // the error interceptor already told the user what failed
    }
  }

  protected async installAll(): Promise<void> {
    for (const g of this.report()?.install ?? []) {
      if (!this.installing().has(g.catalog_id)) await this.install(g);
    }
  }

  protected progress(id: string): number | null {
    const d = this.installing().get(id);
    return d && d.total ? Math.round((d.bytes / d.total) * 100) : null;
  }

  protected async create(): Promise<void> {
    if (!this.file || this.projectId.invalid) {
      this.projectId.markAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.confirmPackage(this.projectId.value, this.file));
      this.ref.close({ id: res.id, mode: this.report()?.mode ?? 'video' });
    } finally {
      this.busy.set(false);
    }
  }
}

function readMessage(e: unknown): string {
  const body = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
  return body ?? (e instanceof Error ? e.message : String(e));
}
