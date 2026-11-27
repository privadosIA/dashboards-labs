import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';

import { ProjectSummary } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { ClientLabelsStore, validClient } from '../../core/client-labels.store';
import { ProjectsStore } from '../../core/projects.store';
import { schemaFor } from '../../shared/dynamic/schema-loader';
import formsEn from './dynamic/forms.en.json';
import formsEs from './dynamic/forms.es.json';
import { asDetails, detailsOf, patchOf } from './project-details';

export interface ProjectDetailsData {
  project: ProjectSummary;
}

/**
 * Changes a project's name, client and adult label by field, without opening the editor. Only the fields that differ are sent;
 * the server owns the rules (`409` while a run is active, `422` for a value the loader refuses), so its reason is shown and the
 * dialog stays open with what the person typed.
 */
@Component({
  selector: 'app-project-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatDialogModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './project-details-dialog.component.html',
  styleUrl: './project-details-dialog.component.scss',
})
export class ProjectDetailsDialogComponent {
  protected readonly data = inject<ProjectDetailsData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ProjectDetailsDialogComponent, ProjectSummary | undefined>>(MatDialogRef);
  private readonly store = inject(ProjectsStore);
  private readonly env = inject(EnvironmentStore);
  /** The labels the server knows: offered while the client is typed (any valid name may still be written). */
  protected readonly labels = inject(ClientLabelsStore);

  private readonly start = detailsOf(this.data.project);
  protected readonly model = signal<Record<string, unknown>>({ ...this.start });
  protected readonly saving = signal(false);
  /** What the server refused, in its words, or what the form itself says is missing. */
  protected readonly problem = signal('');

  /** A server that hides adult content does not offer the label «for people over 18» (a project marked so would vanish from the list). */
  protected readonly schema = computed<DfFormSchema>(() => {
    const full = schemaFor({ es: formsEs, en: formsEn });
    if (!this.env.hidesAdult()) return full;
    const fields = full.fields.map((f) => {
      const field = f as { key?: string; options?: { value: string }[] };
      return field.key === 'adult' ? { ...field, options: (field.options ?? []).filter((o) => o.value !== 'true') } : f;
    });
    return { ...full, fields } as DfFormSchema;
  });

  protected async save(): Promise<void> {
    const patch = patchOf(this.start, asDetails(this.model()));
    if (Object.keys(patch).length === 0) {
      this.ref.close(undefined);
      return;
    }
    if (patch.name === '') {
      this.problem.set($localize`:@@projectDetails.nameEmpty:The name cannot be empty.`);
      return;
    }
    if (patch.client && !validClient(patch.client)) {
      this.problem.set($localize`:@@projectDetails.clientInvalid:A client label has one to 32 lowercase letters, digits or hyphens.`);
      return;
    }
    this.saving.set(true);
    this.problem.set('');
    try {
      this.ref.close(await this.store.patch(this.data.project.id, patch, this.data.project.kind));
    } catch (e) {
      this.problem.set((e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@projectDetails.failed:The project could not be changed.`);
    } finally {
      this.saving.set(false);
    }
  }
}
