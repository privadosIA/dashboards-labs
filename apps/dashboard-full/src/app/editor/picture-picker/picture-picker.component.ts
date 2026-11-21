import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import { GenerationMetadata } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { isImageFile } from '../../core/source-name';
import { EditorStore } from '../editor.store';

/**
 * Chooses one of the project's pictures or uploads one, with a preview. Used
 * for a scene's own image and for the starting picture of an img2img scene;
 * it only reports the chosen file name, the owner decides what it means.
 */
@Component({
  selector: 'app-picture-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule],
  templateUrl: './picture-picker.component.html',
  styleUrl: './picture-picker.component.scss',
})
export class PicturePickerComponent {
  /** The chosen file name; '' while nothing is chosen. */
  readonly value = input('');
  readonly label = input($localize`:@@picture.label:Image`);
  readonly hint = input('');
  readonly error = input<string | undefined>(undefined);
  /** Prefix of the data-testid of the parts (`<id>-select`, `-upload`, `-preview`, `-error`). */
  readonly testId = input('picture');
  readonly picked = output<string>();
  /**
   * Only for the starting picture: also accept a GIF or a video (its first
   * frame becomes the picture) and report the generation settings the file
   * carried, when it carried any.
   */
  readonly importMetadata = input(false);
  readonly metadataFound = output<{ name: string; metadata: GenerationMetadata }>();

  protected readonly store = inject(EditorStore);
  private readonly api = inject(ApiService);

  protected readonly pictures = computed(() =>
    this.store.sources().filter((s) => (s.kind ? s.kind === 'image' : isImageFile(s.name))),
  );
  protected readonly missing = computed(() => {
    const v = this.value();
    return !!v && this.store.sourcesLoaded() && !this.pictures().some((p) => p.name === v);
  });

  protected url(name: string): string {
    return this.api.artifactUrl(this.store.projectId(), `sources/${name}`);
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.importMetadata()) {
      const res = await this.store.uploadPicture(file);
      if (!res) return;
      this.picked.emit(res.name);
      if (res.metadata) this.metadataFound.emit({ name: res.name, metadata: res.metadata });
      return;
    }
    const name = await this.store.uploadSource(file);
    if (name) this.picked.emit(name);
  }
}
