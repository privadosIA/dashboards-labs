import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { PagedList } from '@lab/paged-list';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { LibraryModel, ModelSource } from '../../port';
import { CATALOG_LIST_ID, CatalogStore } from '../catalog.store';
import { ModelCard } from '../model-card/model-card';
import { Thumbnails } from '../thumbnails';

/** How long a typist pauses before the catalog is asked (milliseconds). */
const TYPING_MS = 250;

/** The models of the installed packs: search, filters by pack, tag and animations, a page at a time. With `pickable` each model offers to be picked. `refresh` changes whenever the packs may have: the catalog is read again. */
@Component({
  selector: 'lab-model-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelCard, MatCheckboxModule, MatIconModule, AutoAnimateDirective, PagedList],
  providers: [CatalogStore, Thumbnails],
  templateUrl: './model-catalog.html',
  styleUrl: './model-catalog.scss',
})
export class ModelCatalog {
  protected readonly store = inject(CatalogStore);
  protected readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).catalog;
  protected readonly listId = CATALOG_LIST_ID;
  readonly pickable = input(false);
  /** Changes when a pack was installed, removed or imported. */
  readonly refresh = input(0);
  readonly picked = output<LibraryModel>();
  /** The id (`<pack>/<name>`) of a model to find: the catalog shows the generated models whose name is that one. */
  readonly find = input('');
  protected readonly sources: readonly ModelSource[] = ['catalog', 'user', 'generated'];
  protected readonly text = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      this.refresh();
      untracked(() => void this.store.reload());
    });
    effect(() => {
      const id = this.find();
      if (!id) return;
      const name = id.split('/').pop() ?? id;
      untracked(() => {
        this.text.set(name);
        void this.store.set({ q: name, source: 'generated', engine: undefined });
      });
    });
  }

  protected source(value: string): void {
    void this.store.set({ source: (value || undefined) as ModelSource | undefined, ...(value === 'generated' ? {} : { engine: undefined }) });
  }

  protected engine(value: string): void {
    void this.store.set({ engine: value || undefined });
  }

  protected type(value: string): void {
    this.text.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.store.set({ q: value.trim() || undefined }), TYPING_MS);
  }

  protected pack(value: string): void {
    void this.store.set({ pack: value || undefined });
  }

  protected tag(value: string): void {
    void this.store.set({ tag: value || undefined });
  }

  protected onlyClips(on: boolean): void {
    void this.store.set({ hasClips: on || undefined });
  }
}
