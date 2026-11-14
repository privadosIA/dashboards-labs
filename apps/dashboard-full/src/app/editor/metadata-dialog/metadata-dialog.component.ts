import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Observable } from 'rxjs';

import { GenerationMetadata } from '../../core/api.models';

export interface MetadataDialogData {
  metadata: GenerationMetadata;
  /** The scene already has a prompt: applying the found one replaces it. */
  hasPrompt: boolean;
  /** Whether a file with the found model's name is installed; null when no model was found. */
  modelInstalled: boolean | null;
}

/** The fields the user chose to apply. */
export interface MetadataSelection {
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  steps?: number;
  cfg_scale?: number;
}

/**
 * Offers the generation settings found in an imported starting picture: a
 * checkbox per applicable field (the prompt starts unchecked when the scene
 * already has one, steps and cfg start unchecked), and the model shown only as
 * information. Closes with the chosen fields, or nothing when declined.
 */
@Component({
  selector: 'app-metadata-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule],
  templateUrl: './metadata-dialog.component.html',
  styleUrl: './metadata-dialog.component.scss',
})
export class MetadataDialogComponent {
  protected readonly data = inject<MetadataDialogData>(MAT_DIALOG_DATA);
  private readonly m = this.data.metadata;

  protected readonly prompt = signal(!!this.m.prompt && !this.data.hasPrompt);
  protected readonly negative = signal(!!this.m.negative_prompt);
  protected readonly seed = signal(this.m.seed !== undefined);
  protected readonly steps = signal(false);
  protected readonly cfg = signal(false);

  protected readonly any = () => this.prompt() || this.negative() || this.seed() || this.steps() || this.cfg();

  protected selection(): MetadataSelection {
    const out: MetadataSelection = {};
    if (this.prompt() && this.m.prompt) out.prompt = this.m.prompt;
    if (this.negative() && this.m.negative_prompt) out.negative_prompt = this.m.negative_prompt;
    if (this.seed() && this.m.seed !== undefined) out.seed = this.m.seed;
    if (this.steps() && this.m.steps !== undefined) out.steps = this.m.steps;
    if (this.cfg() && this.m.cfg_scale !== undefined) out.cfg_scale = this.m.cfg_scale;
    return out;
  }
}

/** Opens the dialog; emits the chosen fields, or null when the user declines. */
export function openMetadataDialog(dialog: MatDialog, data: MetadataDialogData): Observable<MetadataSelection | null> {
  return dialog
    .open<MetadataDialogComponent, MetadataDialogData, MetadataSelection | null>(MetadataDialogComponent, {
      data,
      autoFocus: 'first-tabbable',
      width: '560px',
    })
    .afterClosed() as Observable<MetadataSelection | null>;
}
