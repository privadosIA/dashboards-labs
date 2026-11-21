import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';

import { PhoneService } from '../../core/phone.service';
import { ActionSheetService } from '../action-sheet/action-sheet.service';

/** One choice of a list of options. */
export interface Option<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  /** Marks the choice in tests (on a wide screen its button, on a phone its row of the sheet). */
  testId?: string;
}

/**
 * A choice among a few options. On a wide screen it is a row of toggle buttons; on a phone, where four buttons in a
 * line do not fit and make the card long, it is a single line with the current value that opens a bottom sheet with
 * the choices. Same options, same effect: only the way of picking changes.
 */
@Component({
  selector: 'app-option-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule, MatIconModule],
  templateUrl: './option-row.component.html',
  styleUrl: './option-row.component.scss',
})
export class OptionRowComponent<T extends string = string> {
  readonly label = input.required<string>();
  readonly options = input.required<Option<T>[]>();
  readonly value = input.required<T>();
  readonly disabled = input(false);
  /** The buttons share the width of the row. */
  readonly fill = input(false);
  /** The buttons go on to a new line when they do not fit. */
  readonly wrap = input(false);
  readonly testId = input<string>();
  readonly picked = output<T>();

  protected readonly phone = inject(PhoneService).phone;
  private readonly sheet = inject(ActionSheetService);
  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));

  protected open(): void {
    this.sheet.open(
      this.label(),
      this.options().map((o) => ({
        icon: o.icon,
        label: o.label,
        selected: o.value === this.value(),
        testId: o.testId,
        run: () => this.picked.emit(o.value),
      })),
    );
  }
}
