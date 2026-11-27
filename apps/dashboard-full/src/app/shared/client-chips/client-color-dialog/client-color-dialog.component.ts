import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DynamicFormComponent } from '@core/dynamic-forms';

import { ClientLabelsStore } from '../../../core/client-labels.store';
import { isClientColor } from '../../client-color';
import { schemaFor } from '../../dynamic/schema-loader';
import colorEn from './dynamic/forms.en.json';
import colorEs from './dynamic/forms.es.json';

export interface ClientColorData {
  /** The label whose colour is chosen. */
  name: string;
}

/**
 * Chooses the colour of a client label. The server keeps it (every dashboard then shows the same one), so a refusal (`400`) is shown in its words
 * and the dialog stays open with what was typed; the label keeps its previous colour until the server accepts the new one.
 */
@Component({
  selector: 'app-client-color-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatDialogModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './client-color-dialog.component.html',
  styleUrl: './client-color-dialog.component.scss',
})
export class ClientColorDialogComponent {
  protected readonly data = inject<ClientColorData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ClientColorDialogComponent, string | undefined>>(MatDialogRef);
  protected readonly labels = inject(ClientLabelsStore);

  protected readonly schema = schemaFor({ es: colorEs, en: colorEn });
  protected readonly model = signal<Record<string, unknown>>({ color: this.labels.colorOf(this.data.name) });
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  /** What is typed, when it is a colour the server accepts; the swatch shows it before it is saved. */
  protected readonly typed = computed(() => {
    const value = this.model()['color'];
    return isClientColor(value) ? value.toLowerCase() : null;
  });

  protected async save(): Promise<void> {
    const color = this.typed();
    if (!color) {
      this.problem.set($localize`:@@clientColor.invalid:Write the colour as #rrggbb, for example #3366cc.`);
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      await this.labels.setColor(this.data.name, color);
      this.ref.close(color);
    } catch (e) {
      this.problem.set((e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@clientColor.failed:The colour could not be saved.`);
    } finally {
      this.saving.set(false);
    }
  }
}
