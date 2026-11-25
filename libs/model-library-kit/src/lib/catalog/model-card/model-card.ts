import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { LibraryModel } from '../../port';
import { ModelViewer } from '../../viewer/open-viewer';
import { Thumbnails } from '../thumbnails';

/** A model of the catalog: its picture, what it has (animations, triangles) and where it comes from (licence, author, and a mark when the licence asks for the author to be named). */
@Component({
  selector: 'lab-model-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './model-card.html',
  styleUrl: './model-card.scss',
})
export class ModelCard {
  readonly model = input.required<LibraryModel>();
  /** Offer to pick it. */
  readonly pickable = input(false);
  readonly pick = output<LibraryModel>();

  private readonly thumbnails = inject(Thumbnails);
  private readonly viewer = inject(ModelViewer);
  protected readonly t = textsFor(inject(LanguageService).lang).catalog;
  protected readonly v = textsFor(inject(LanguageService).lang).viewer;
  protected readonly picture = signal<{ state: 'loading' | 'ready' | 'none'; url: string }>({ state: 'loading', url: '' });
  protected readonly clipsText = computed(() => this.model().clips.join(', '));
  /** `Made with TripoSR (triposr@3f1c9a2)`: the version only when the server gave one. */
  protected readonly madeWith = computed(() => {
    const m = this.model();
    if (!m.engine) return '';
    return m.engine_version ? this.t.madeWith(m.engine, m.engine_version) : this.t.madeWith(m.engine, '').replace(/ \(\)$/, '');
  });

  protected look(): void {
    this.viewer.open({ model: this.model(), pack: this.model().pack, name: this.model().name });
  }

  constructor() {
    effect(() => {
      const { pack, name } = this.model();
      this.picture.set({ state: 'loading', url: '' });
      void this.thumbnails.url(pack, name).then((url) => this.picture.set(url ? { state: 'ready', url } : { state: 'none', url: '' }));
    });
  }
}
