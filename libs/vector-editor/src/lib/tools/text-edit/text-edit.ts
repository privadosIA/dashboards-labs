import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, viewChild } from '@angular/core';

import { VECTOR_EDITOR_LANG } from '../../provide-vector-editor';
import { vectorTexts } from '../../texts';

/** The box of the text on the canvas, in the canvas's own pixels. */
export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The words of a text node typed in place: a `<textarea>` over the canvas where the text is, in its size and its font. Enter or leaving the
 * field keeps the words, Escape drops the change. The keys and the pointer stay here: the canvas must not take them for its own shortcuts.
 */
@Component({
  selector: 'lab-vector-text-edit',
  templateUrl: './text-edit.html',
  styleUrl: './text-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorTextEdit {
  readonly text = input.required<string>();
  readonly box = input.required<TextBox>();
  /** Screen pixels. */
  readonly fontSize = input.required<number>();
  readonly fontFamily = input.required<string>();
  readonly fontWeight = input(400);
  readonly commit = output<string>();
  readonly cancel = output<void>();

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private finished = false;

  constructor() {
    afterNextRender(() => {
      const el = this.field().nativeElement;
      el.focus({ preventScroll: true });
      el.select();
    });
  }

  protected key(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      this.finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.finish(false);
    }
  }

  protected blur(): void {
    this.finish(true);
  }

  private finish(keep: boolean): void {
    if (this.finished) return;
    this.finished = true;
    if (keep) this.commit.emit(this.field().nativeElement.value);
    else this.cancel.emit();
  }
}
