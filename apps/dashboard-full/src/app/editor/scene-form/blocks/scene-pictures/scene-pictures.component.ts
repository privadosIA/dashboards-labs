import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ImagesManifest, ManifestImage } from '../../../../core/api.models';
import { ApiService } from '../../../../core/api.service';
import { GalleryLightboxComponent, LightboxData } from '../../../../gallery/gallery-lightbox/gallery-lightbox.component';
import { EditorStore } from '../../../editor.store';

/**
 * The pictures of a scene in a project in images mode, read from the export
 * manifest of its last run: one thumbnail per variant, as a video scene shows
 * its clip.
 */
@Component({
  selector: 'app-scene-pictures',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './scene-pictures.component.html',
  styleUrl: './scene-pictures.component.scss',
})
export class ScenePicturesComponent {
  readonly sceneId = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly store = inject(EditorStore);
  private readonly dialog = inject(MatDialog);
  private readonly manifest = signal<ImagesManifest | null>(null);
  private readonly attempt = signal(0);

  protected readonly pictures = computed<ManifestImage[]>(() => {
    const m = this.manifest();
    return m ? m.images.filter((i) => i.scene_id === this.sceneId()).sort((a, b) => a.variant - b.variant) : [];
  });

  constructor() {
    effect(() => {
      this.attempt();
      const cfg = this.store.config();
      const id = this.store.projectId();
      if (cfg?.output.mode !== 'images' || !id) {
        untracked(() => this.manifest.set(null));
        return;
      }
      untracked(() => {
        void firstValueFrom(this.api.getManifest(id, cfg.project || id))
          .then((m) => this.manifest.set(m))
          .catch(() => this.manifest.set(null)); // nothing exported yet: the block says so
      });
    });
  }

  protected url(img: ManifestImage): string {
    return this.api.artifactUrl(this.store.projectId(), img.file);
  }

  /** Looks again at the manifest (a run may have written pictures since). */
  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }

  protected open(index: number): void {
    this.dialog.open<GalleryLightboxComponent, LightboxData>(GalleryLightboxComponent, {
      data: { images: this.pictures(), index, urlOf: (img) => this.url(img) },
      maxWidth: '95vw',
    });
  }
}
