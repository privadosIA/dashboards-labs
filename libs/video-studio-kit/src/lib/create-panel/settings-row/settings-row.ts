import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

export interface RowOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * One setting as a row: its label, its current value and a chevron. Activating it opens a menu (Material's, so the arrow
 * keys, Escape, a click outside and the focus coming back to the row are already there) with the options of the setting
 * and, projected after them, anything else the setting needs (the free duration). It only says what was chosen.
 */
@Component({
  selector: 'app-settings-row',
  imports: [MatMenu, MatMenuItem, MatMenuTrigger],
  templateUrl: './settings-row.html',
  styleUrl: './settings-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsRow {
  readonly label = input.required<string>();
  /** What the row shows as the current value. */
  readonly value = input.required<string>();
  readonly options = input<readonly RowOption[]>([]);
  /** The option that is the current one, marked in the menu. */
  readonly selected = input<string>('');
  /** What is wrong with the value, shown under the row. */
  readonly error = input<string>('');
  readonly testId = input<string>('');
  readonly choose = output<string>();

  private readonly trigger = viewChild.required(MatMenuTrigger);

  open(): void {
    this.trigger().openMenu();
  }

  close(): void {
    this.trigger().closeMenu();
  }
}
