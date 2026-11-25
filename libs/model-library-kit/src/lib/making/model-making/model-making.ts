import { ChangeDetectionStrategy, Component, effect, inject, output, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { GenerateModel } from '../generate-model/generate-model';
import { MakingStore } from '../making.store';
import { ModelEngines } from '../model-engines/model-engines';
import { ModelGenerations } from '../model-generations/model-generations';

/**
 * Making 3D models: the engines, the form that starts a generation and the list of generations. It appears only where the server has the 3D service (a 503 from the engines leaves nothing of it on the screen, and no error).
 * `made` tells the host that a generation ended: the catalog is worth reading again. `showModel` carries the id of a finished generation's model.
 */
@Component({
  selector: 'lab-model-making',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelEngines, ModelGenerations, MatButtonModule, MatIconModule, AutoAnimateDirective],
  providers: [MakingStore],
  templateUrl: './model-making.html',
  styleUrl: './model-making.scss',
})
export class ModelMaking {
  protected readonly store = inject(MakingStore);
  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang).making;
  readonly made = output<void>();
  readonly showModel = output<string>();
  private seen = 0;

  constructor() {
    void this.store.load();
    effect(() => {
      const n = this.store.finished();
      untracked(() => {
        if (n > this.seen) this.made.emit();
        this.seen = n;
      });
    });
  }

  protected open(): void {
    // the dialog is made at the root: it gets the store through its data, not through the injector
    this.dialog.open(GenerateModel, { data: this.store, width: '36rem', maxWidth: '92vw' });
  }
}
