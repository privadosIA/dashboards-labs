import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { Texts } from '../../../core/texts';

/** The most characters the concept can have (the server's limit). */
export const CONCEPT_MAX = 200;

/**
 * The idea of a song's design, as a plain text box with its name above and how much of its room is used below, like the sentence of the guided flow: the design form
 * leaves its place to the host (the slot `concept`), which gives the text here, the words in its language (a host that mounts the library from a lazy route has no language
 * of the library's own to read) and takes what is written.
 */
@Component({
  selector: 'app-concept-box',
  templateUrl: './concept-box.html',
  styleUrl: './concept-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptBox {
  /** The design's words (`textsFor(lang).design`), in the host's language. */
  readonly texts = input.required<Texts['design']>();
  readonly value = input('');
  /** While the piece is being drawn nothing of the design changes. */
  readonly disabled = input(false);
  readonly changed = output<string>();

  protected readonly max = CONCEPT_MAX;

  protected type(event: Event): void {
    this.changed.emit((event.target as HTMLTextAreaElement).value);
  }
}
