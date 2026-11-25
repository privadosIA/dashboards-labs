import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AutoAnimateDirective } from '@lab/motion-ui';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { ImportPack } from '../import-pack/import-pack';
import { PackCard } from '../pack-card/pack-card';
import { PacksStore } from '../packs.store';

/** The packs of the library: the server's list and the imported ones, with install (and its progress), cancel, remove and the import of a zip. `changed` tells the host that the models of the library are others now: a pack finished installing, was removed or was imported. */
@Component({
  selector: 'lab-model-packs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PackCard, MatButtonModule, MatIconModule, AutoAnimateDirective],
  providers: [PacksStore],
  templateUrl: './model-packs.html',
  styleUrl: './model-packs.scss',
})
export class ModelPacks {
  protected readonly store = inject(PacksStore);
  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang).packs;
  /** A pack was installed, removed or imported: the catalog is worth reading again. */
  readonly changed = output<void>();
  /** Changes when the host knows the packs may be others (a generation ended: the pack `generated` has one more model): the list is read again. */
  readonly refresh = input(0);

  /** Which packs have models in the library right now: when it changes, the catalog is others. */
  private readonly installed = computed(() =>
    this.store
      .packs()
      .filter((p) => p.state === 'installed')
      .map((p) => p.id)
      .join(),
  );
  private seen: string | null = null;

  constructor() {
    void this.store.load();
    let first = true;
    effect(() => {
      this.refresh();
      untracked(() => {
        if (first) first = false;
        else void this.store.load();
      });
    });
    effect(() => {
      const now = this.installed();
      // the first reading of the list is not a change; an install that ends, a removal and an import are
      if (this.store.status() !== 'ready') return;
      untracked(() => {
        if (this.seen !== null && this.seen !== now) this.changed.emit();
        this.seen = now;
      });
    });
  }

  protected install(id: string): Promise<void> {
    return this.store.install(id);
  }

  protected cancel(id: string): Promise<void> {
    return this.store.cancel(id);
  }

  protected remove(id: string): Promise<void> {
    return this.store.remove(id);
  }

  protected importZip(): void {
    this.store.importProblem.set('');
    this.dialog
      .open(ImportPack, { data: this.store, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe();
  }
}
