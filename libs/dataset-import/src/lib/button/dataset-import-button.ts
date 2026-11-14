import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { DatasetImportDialog } from '../dialog/dataset-import.dialog';
import { datasetTexts } from '../texts';
import { DATASET_IMPORT_OPTIONS } from '../tokens';

/** The button of a dashboard's header that opens the dataset import. */
@Component({
  selector: 'lab-dataset-import-button',
  templateUrl: './dataset-import-button.html',
  styleUrl: './dataset-import-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetImportButton {
  private readonly dialog = inject(MatDialog);
  protected readonly t = datasetTexts(inject(DATASET_IMPORT_OPTIONS).lang);

  protected open(): void {
    this.dialog.open(DatasetImportDialog, { width: 'min(34rem, 92vw)', maxWidth: '92vw', autoFocus: 'first-tabbable', panelClass: 'studio-kit' });
  }
}
