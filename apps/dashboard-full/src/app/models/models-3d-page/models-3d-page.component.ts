import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ModelCatalog, ModelMaking, ModelPacks } from '@lab/model-library-kit';

import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

/** The 3D library: the packs of 3D models the server keeps (install, import, remove) and the catalog of the installed ones, with their licences. A model is copied from here into a project's scene or a piece. */
@Component({
  selector: 'app-models-3d-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, ModelMaking, ModelPacks, ModelCatalog, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './models-3d-page.component.html',
  styleUrl: './models-3d-page.component.scss',
})
export class Models3dPageComponent {
  /** Counts the changes of the packs, so that the catalog reads itself again. */
  protected readonly changes = signal(0);

  /** The model a finished generation named: the catalog shows it. */
  protected readonly found = signal('');

  /** Counts the generations that ended: the packs are read again (the pack `generated` has one more model) and so is the catalog. */
  protected readonly ended = signal(0);

  protected generationEnded(): void {
    this.ended.update((n) => n + 1);
    this.packsChanged();
  }

  protected packsChanged(): void {
    this.changes.update((n) => n + 1);
  }

  protected show(id: string): void {
    this.found.set('');
    // the same id twice must work: clear it, then set it, so the catalog sees a change
    queueMicrotask(() => {
      this.found.set(id);
      // a browser scrolls to the catalog; the test environment has no scrolling
      document.getElementById('models3d-catalog')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }
}
