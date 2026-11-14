import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { CatalogEntry } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { EditEngine, StyleChoice, TIERS, Tier, editEngineOf, editLabel, pickStyleEntry, styleHelp, styleLabel, stylesOf, tierLabel } from '../../editor/quality-tiers';
import { EditEngineSelectComponent } from '../../shared/edit-engine-select/edit-engine-select.component';

export interface ProjectNameDialogData {
  title: string;
  confirmLabel: string;
  /** Pre-filled suggestion (e.g. "<source>-copia" when duplicating). */
  initial?: string;
  /**
   * Offers an optional style and quality for a new image/video project. The
   * dialog fills this object in; the caller applies what it holds after creating.
   */
  choice?: NewProjectChoice;
}

export interface NewProjectChoice {
  style?: StyleChoice;
  tier?: Tier;
  /** Easy mode: the best model and animation the machine can run, chosen by the program (style and quality are then not asked). */
  auto?: boolean;
  /** The project's adult label: true (for adults), false (reviewed) or undefined (not reviewed). */
  adult?: boolean;
  /** The engine of Retouch when the style is Retouch and both are installed (the fast one when absent). */
  editEngine?: EditEngine;
}

/** Mirrors the server's project id pattern (projects.go). */
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Asks for a project identifier (create and duplicate flows). The cheap
 * pattern check runs here; the server stays authoritative on collisions.
 */
@Component({
  selector: 'app-project-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule, EditEngineSelectComponent],
  templateUrl: './project-name-dialog.component.html',
  styleUrl: './project-name-dialog.component.scss',
})
export class ProjectNameDialogComponent {
  protected readonly data = inject<ProjectNameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ProjectNameDialogComponent, string>);

  protected readonly name = new FormControl(this.data.initial ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(PROJECT_ID_PATTERN)],
  });

  private readonly api = inject(ApiService);
  protected readonly env = inject(EnvironmentStore);
  private readonly catalog = signal<CatalogEntry[]>([]);

  /** Bumped on every change of look, so the help line follows it (the choice is a plain object). */
  private readonly pickedStyle = signal(0);

  protected readonly styles = computed(() => [
    ...stylesOf(this.catalog()).map((value) => ({ value: value as StyleChoice, label: styleLabel(value), available: !!pickStyleEntry(this.catalog(), value) })),
    { value: 'edit' as StyleChoice, label: editLabel(), available: this.catalog().some((e) => e.edit && e.installed) },
  ]);
  /** One line about the look chosen, so the names are not all there is to go by. */
  protected readonly currentStyleHelp = computed(() => {
    this.pickedStyle();
    return styleHelp(this.data.choice?.style ?? 'auto');
  });
  /** The engines of Retouch installed, offered when the look chosen is Retouch. */
  protected readonly editEngines = computed(() => this.catalog().filter((e) => e.kind === 'model' && e.edit && e.installed).map(editEngineOf));
  protected readonly showEditEngine = computed(() => {
    this.pickedStyle();
    return this.data.choice?.style === 'edit' && !this.auto();
  });
  protected readonly pickedEngine = signal<EditEngine | null>(null);
  protected readonly tiers = TIERS.map((value) => ({ value, label: tierLabel(value) }));

  constructor() {
    if (this.data.choice) void this.loadCatalog();
  }

  private async loadCatalog(): Promise<void> {
    try {
      this.catalog.set((await firstValueFrom(this.api.getCatalog())).entries);
    } catch {
      this.catalog.set([]); // the styles stay disabled; the project is created as before
    }
  }

  /** Whether Easy mode was ticked: the style and the quality are then the program's to choose. */
  protected readonly auto = signal(this.data.choice?.auto ?? false);

  protected setAuto(on: boolean): void {
    this.auto.set(on);
    if (this.data.choice) {
      this.data.choice.auto = on || undefined;
      if (on) {
        this.data.choice.style = undefined;
        this.data.choice.tier = undefined;
      }
    }
  }

  protected adultValue(): string {
    const a = this.data.choice?.adult;
    return a === undefined ? '' : a ? 'true' : 'false';
  }

  protected setAdult(value: string): void {
    if (this.data.choice) this.data.choice.adult = value === '' ? undefined : value === 'true';
  }

  protected setEditEngine(engine: EditEngine): void {
    this.pickedEngine.set(engine);
    if (this.data.choice) this.data.choice.editEngine = engine;
  }

  protected setStyle(value: StyleChoice | ''): void {
    if (this.data.choice) {
      this.data.choice.style = value || undefined;
      // A model made for adults labels the project so; the user can still change it below.
      if (value && value !== 'edit' && pickStyleEntry(this.catalog(), value)?.adult) this.data.choice.adult = true;
    }
    this.pickedStyle.update((n) => n + 1);
  }


  protected setTier(value: Tier | ''): void {
    if (this.data.choice) this.data.choice.tier = value || undefined;
  }

  protected submit(): void {
    if (this.name.valid) {
      this.ref.close(this.name.value);
    } else {
      this.name.markAsTouched();
    }
  }
}
