import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { HttpErrorResponse } from '@angular/common/http';

import { ClientLabelsStore } from '../../core/client-labels.store';
import { ClientColorData, ClientColorDialogComponent } from './client-color-dialog/client-color-dialog.component';

/**
 * The client labels as filter chips, drawn from what the server reports (`GET /api/clients`): the label with its own colour and its count, in the order of
 * its use. A chip is a toggle (several may be on); its menu changes the label's colour or restores the default one. It draws nothing when there are no labels.
 */
@Component({
  selector: 'app-client-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoAnimateDirective, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './client-chips.component.html',
  styleUrl: './client-chips.component.scss',
})
export class ClientChipsComponent {
  protected readonly labels = inject(ClientLabelsStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  /** The labels that are on. */
  readonly selected = input<ReadonlySet<string>>(new Set());
  readonly selectedChange = output<ReadonlySet<string>>();

  protected isOn(name: string): boolean {
    return this.selected().has(name);
  }

  protected toggle(name: string): void {
    const next = new Set(this.selected());
    if (!next.delete(name)) next.add(name);
    this.selectedChange.emit(next);
  }

  protected clear(): void {
    this.selectedChange.emit(new Set());
  }

  protected changeColor(name: string): void {
    this.dialog.open<ClientColorDialogComponent, ClientColorData>(ClientColorDialogComponent, { data: { name }, width: '24rem', maxWidth: '95vw' });
  }

  /** Back to the colour the server works out from the name. */
  protected async restore(name: string): Promise<void> {
    try {
      await this.labels.setColor(name, null);
    } catch (e) {
      this.snack.open((e as HttpErrorResponse)?.error?.error?.message ?? $localize`:@@clientColor.failed:The colour could not be saved.`, undefined, { duration: 5000 });
    }
  }
}
