import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { AnimationList } from './animation-list/animation-list';
import { ImportReport } from './import-report/import-report';

/** The animation's datasets: one animation taken out of this server as a file, and one brought in from another. */
@Component({
  selector: 'app-datasets-page',
  imports: [AnimationList, ImportReport],
  templateUrl: './datasets.page.html',
  styleUrl: './datasets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetsPage {
  protected readonly t = textsFor(inject(LanguageService).lang).datasets;
}
