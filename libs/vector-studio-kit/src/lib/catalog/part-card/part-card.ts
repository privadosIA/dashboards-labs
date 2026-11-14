import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** A vector part of the catalog as it is shown: its still thumbnail, name and description. */
export interface CatalogItem {
  name: string;
  description: string;
  /** A `data:` address of the still SVG at 0 s. */
  thumbnail: string;
}

/**
 * One part of the catalog: Open, and Delete, which asks first. When the server says pieces use the part, the reason is shown and the button says
 * Delete anyway: the same call with `force`.
 */
@Component({
  selector: 'app-part-card',
  templateUrl: './part-card.html',
  styleUrl: './part-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartCard {
  readonly item = input.required<CatalogItem>();
  /** The server's reason when it refused to delete the part because something uses it. */
  readonly busy = input<string | undefined>(undefined);
  readonly open = output<void>();
  /** Deletes the part; `true` when the person insisted after being told it is in use. */
  readonly remove = output<boolean>();

  protected readonly t = textsFor(inject(LanguageService).lang).catalog;
  protected readonly confirming = signal(false);

  /** The card stays asking until the part is gone: if the server says it is in use, the reason shows here and the button changes. */
  protected confirm(): void {
    this.remove.emit(!!this.busy());
  }

  protected cancel(): void {
    this.confirming.set(false);
  }
}
