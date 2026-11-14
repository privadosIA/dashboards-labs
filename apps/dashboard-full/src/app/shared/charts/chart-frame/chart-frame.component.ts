import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { uid } from '../chart-math';

/** The same numbers a chart draws, as a table (the chart's accessible twin). */
export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Wraps one chart: a title, a text description, the drawing (projected) and a
 * "show as table" switch that replaces the drawing with the same data. The
 * frame is a figure labelled by its title and described by its description.
 */
@Component({
  selector: 'mo-chart-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './chart-frame.component.html',
  styleUrl: './chart-frame.component.scss',
})
export class ChartFrameComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly table = input.required<ChartTable>();

  protected readonly showTable = signal(false);
  protected readonly titleId = uid('chart-title');
  protected readonly descId = uid('chart-desc');
  protected readonly hasData = computed(() => this.table().rows.length > 0);

  protected toggle(): void {
    this.showTable.update((v) => !v);
  }
}
