import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ManifestImage } from '../../core/api.models';
import { ShareService } from '../../core/share.service';

export interface LightboxData {
  images: ManifestImage[];
  index: number;
  urlOf: (img: ManifestImage) => string;
}

/**
 * Print lightbox: one image large with its full reproducibility caption
 * (seed, prompt, model, sampler/steps) and keyboard navigation.
 */
@Component({
  selector: 'app-gallery-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './gallery-lightbox.component.html',
  styleUrl: './gallery-lightbox.component.scss',
  host: {
    '(document:keydown.arrowright)': 'next()',
    '(document:keydown.arrowleft)': 'prev()',
  },
})
export class GalleryLightboxComponent {
  protected readonly data = inject<LightboxData>(MAT_DIALOG_DATA);
  protected readonly sharer = inject(ShareService);
  protected readonly index = signal(this.data.index);
  protected readonly img = computed(() => this.data.images[this.index()]);
  protected readonly url = computed(() => this.data.urlOf(this.img()));

  protected next(): void {
    this.index.update((i) => Math.min(i + 1, this.data.images.length - 1));
  }

  protected prev(): void {
    this.index.update((i) => Math.max(i - 1, 0));
  }
}
