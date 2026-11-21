import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SettingSource } from '../../core/api.models';

/**
 * Where a value of the settings comes from: saved here (`setting`), from the environment (`env`) or the default.
 * It describes the value; it never replaces the field that edits it.
 */
@Component({
  selector: 'app-source-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './source-chip.component.html',
  styleUrl: './source-chip.component.scss',
})
export class SourceChipComponent {
  readonly source = input.required<SettingSource>();
}
