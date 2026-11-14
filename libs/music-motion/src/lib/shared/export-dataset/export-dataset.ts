import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { LocalStyles } from '../../animation/local-styles';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { exportAnimation } from '../export-animation';
import { failureText } from '../failure-text';

/** The Export dataset button of one animation, and the line that says what was saved or why not. Used by the card, the page and the Datasets screen. */
@Component({
  selector: 'app-export-dataset',
  templateUrl: './export-dataset.html',
  styleUrl: './export-dataset.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDataset {
  readonly piece = input.required<{ readonly id: string; readonly title: string }>();

  private readonly port = inject(ANIMATION);
  private readonly local = inject(LocalStyles);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.pieces;
  protected readonly workingText = this.texts.datasets.export.working;

  protected readonly working = signal(false);
  protected readonly saved = signal('');
  protected readonly refused = signal('');

  protected async export(): Promise<void> {
    if (this.working()) return;
    this.working.set(true);
    this.saved.set('');
    this.refused.set('');
    try {
      this.saved.set(this.t.exportedDataset(await exportAnimation(this.port, this.local, this.piece())));
    } catch (e) {
      this.refused.set(`${this.t.exportFailed} ${failureText(e, this.texts)}`);
    } finally {
      this.working.set(false);
    }
  }
}
