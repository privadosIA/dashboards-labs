import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';

import { LanguageService } from '../../core/language';
import { InfoTip } from '../../shared/info-tip/info-tip';
import { textsFor } from '../../core/texts';
import type { StartImage as Image } from '../../video/model';
import { StartImage } from '../start-image/start-image';

/** The frames of a clip: the start image and, beside it, the end image when the model takes one. It only holds them; the panel decides what they mean. */
@Component({
  selector: 'app-frames',
  templateUrl: './frames.html',
  styleUrl: './frames.scss',
  imports: [InfoTip, StartImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Frames {
  readonly start = model<Image | null>(null);
  readonly end = model<Image | null>(null);
  /** Whether the end frame is drawn: only for a model that takes an end image. */
  readonly showEnd = input(false);

  protected readonly t = textsFor(inject(LanguageService).lang);
}
