import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { firstValueFrom } from 'rxjs';

import { ImportMode, ImportPreview, ImportResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { PROJECT_ID_PATTERN } from '../project-name-dialog/project-name-dialog.component';

/**
 * Import wizard (spec: project-workspace): subir → informe → confirmar.
 * A real sequence, hence a stepper. The UI never parses the dataset —
 * the server's import logic does, and its mapping report is shown before
 * anything is created.
 */
@Component({
  selector: 'app-import-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatStepperModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    ReactiveFormsModule,
  ],
  templateUrl: './import-wizard.component.html',
  styleUrl: './import-wizard.component.scss',
})
export class ImportWizardComponent {
  private readonly api = inject(ApiService);
  private readonly ref = inject(MatDialogRef<ImportWizardComponent, ImportResult>);

  private readonly stepper = viewChild.required(MatStepper);

  protected readonly fileName = signal<string>('');
  protected readonly fileContent = signal<string>('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly mode = signal<ImportMode>('video');

  protected readonly projectId = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(PROJECT_ID_PATTERN)],
  });

  protected setMode(mode: ImportMode): void {
    this.mode.set(mode);
    this.preview.set(null); // a report of the other kind no longer applies
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    this.fileContent.set(await file.text());
    const suggested = file.name.replace(/\.(json|html?)$/i, '').replace(/[^A-Za-z0-9._-]/g, '-');
    if (!this.projectId.value) {
      this.projectId.setValue(suggested);
    }
  }

  protected async runPreview(): Promise<void> {
    if (!this.fileContent() || this.projectId.invalid) {
      this.projectId.markAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      this.preview.set(
        await firstValueFrom(this.api.previewImport(this.fileContent(), this.projectId.value, undefined, this.mode())),
      );
      this.stepper().next();
    } finally {
      this.busy.set(false);
    }
  }

  protected toConfirm(): void {
    this.stepper().next();
  }

  protected async confirm(): Promise<void> {
    const p = this.preview();
    if (!p || this.projectId.invalid) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.confirmImport(this.projectId.value, p.yaml));
      this.ref.close({ id: res.id, mode: this.mode() });
    } finally {
      this.busy.set(false);
    }
  }
}
