import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DynamicFormComponent } from '@core/dynamic-forms';

import { ProjectKind } from '../../core/api.models';
import { ClientLabelsStore, validClient } from '../../core/client-labels.store';
import { schemaFor } from '../dynamic/schema-loader';
import formsEn from './dynamic/forms.en.json';
import formsEs from './dynamic/forms.es.json';

export interface ClientLabelData {
  /** The id of the item (a generation, an edit or a project): its prefix says which route changes the label. */
  id: string;
  /** What the item is called, for the person. */
  name: string;
  /** The label it has now. */
  client: string;
  /** What the item is, when the host knows (a project row's `kind`): it chooses the route before the id's prefix does. */
  kind?: ProjectKind;
}

/**
 * Changes the client label of one item. The label may be any valid name, and the ones the server knows are offered. An invalid name is not sent; the server's
 * refusal (`409` while the item runs, `404`) is shown in its words and the dialog stays open. It closes with `true` when the label changed.
 */
@Component({
  selector: 'app-client-label-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatDialogModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './client-label-dialog.component.html',
  styleUrl: './client-label-dialog.component.scss',
})
export class ClientLabelDialogComponent {
  protected readonly data = inject<ClientLabelData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ClientLabelDialogComponent, boolean>>(MatDialogRef);
  protected readonly labels = inject(ClientLabelsStore);

  protected readonly schema = schemaFor({ es: formsEs, en: formsEn });
  /** An ordinary `embedded` or `unknown` label is what the server says when there is none: the field shows it empty. */
  private readonly start = ['embedded', 'unknown'].includes(this.data.client) ? '' : this.data.client;
  protected readonly model = signal<Record<string, unknown>>({ client: this.start });
  protected readonly saving = signal(false);
  protected readonly problem = signal('');

  protected async save(): Promise<void> {
    const raw = this.model()['client'];
    const typed = (typeof raw === 'string' ? raw : '').trim();
    if (typed === this.start) {
      this.ref.close(false);
      return;
    }
    if (!validClient(typed)) {
      this.problem.set($localize`:@@clientLabel.invalid:A client label has one to 32 lowercase letters, digits or hyphens.`);
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      await this.labels.setClient(this.data.id, typed === '' ? null : typed, this.data.kind);
      this.ref.close(true);
    } catch (e) {
      const status = (e as HttpErrorResponse)?.status;
      this.problem.set(
        status === 409
          ? $localize`:@@clientLabel.running:The label cannot be changed while it is running.`
          : ((e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@clientLabel.failed:The label could not be changed.`),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
