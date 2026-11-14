import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';

import { isEmptyPiece, type Script, type ScriptPiece } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import { motionEditorTexts } from '../texts';
import { sameSelection, type Selection } from '../timeline/selection';
import { hiddenParts } from './visibility';

/**
 * The script's structure as rows: each piece in time order with its main part, and under it, when opened, its extra parts. Selecting a row
 * selects the same thing in the timeline and the inspector. The "solo" and "hide" switches are an aid for the preview, not a change to the
 * script: they say which parts the preview leaves out (`visibility`).
 */
@Component({
  selector: 'lab-motion-layers',
  templateUrl: './layers.html',
  styleUrl: './layers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionLayers {
  readonly script = input.required<Script>();
  readonly selection = input<Selection | null>(null);
  /** The song time of the playhead: the row of the piece that holds it is marked and kept in view. */
  readonly playhead = input(0);
  readonly choose = output<Selection | null>();
  /** While the piece is being drawn or proposed the list only shows. */
  readonly locked = input(false);
  /** The remove button of a piece row was pressed: the page decides (the last piece cannot go). */
  readonly removePiece = output<string>();
  /** The add button was pressed: the page splits the piece under the playhead. */
  readonly addPiece = output<void>();
  /** The names of the parts the preview must leave out, each time a switch changes. */
  readonly visibility = output<ReadonlySet<string>>();

  protected readonly t = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  protected readonly rows = computed(() => [...this.script().pieces].sort((a, b) => a.start - b.start));
  /** The id of the piece under the playhead (the last one at the very end), or `null` for no pieces. */
  protected readonly current = computed(() => {
    const t = this.playhead();
    const rows = this.rows();
    return (rows.find((p) => t >= p.start - 1e-9 && t < p.end - 1e-9) ?? rows[rows.length - 1])?.id ?? null;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal<ReadonlySet<string>>(new Set());
  protected readonly solo = signal<string | null>(null);
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // The list follows the song: when the playhead enters another piece its row scrolls into view, without taking the selection. Only the list scrolls: `scrollIntoView` would also move the
    // page (and the editor with it) every time the playhead is dragged across a piece, so the row is brought into view by hand.
    effect(() => {
      const id = this.current();
      if (id === null) return;
      const host = this.host.nativeElement;
      const row = Array.from(host.querySelectorAll<HTMLElement>('[data-piece]')).find((el) => el.dataset['piece'] === id);
      const list = host.querySelector<HTMLElement>('ul.layers');
      if (!row || !list) return;
      const r = row.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      if (r.top < l.top) list.scrollTop -= l.top - r.top;
      else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
    });
  }

  protected isEmpty(piece: ScriptPiece): boolean {
    return isEmptyPiece(piece);
  }

  protected isSelected(piece: string, extra?: number): boolean {
    return sameSelection(this.selection(), extra === undefined ? { piece } : { piece, extra });
  }

  protected pick(piece: string, extra?: number): void {
    this.choose.emit(extra === undefined ? { piece } : { piece, extra });
  }

  protected toggleOpen(piece: string): void {
    const next = new Set(this.open());
    if (!next.delete(piece)) next.add(piece);
    this.open.set(next);
  }

  protected isOpen(piece: string): boolean {
    return this.open().has(piece);
  }

  protected toggleSolo(part: string): void {
    this.solo.set(this.solo() === part ? null : part);
    this.emit();
  }

  protected toggleHide(part: string): void {
    const next = new Set(this.hidden());
    if (!next.delete(part)) next.add(part);
    this.hidden.set(next);
    this.emit();
  }

  protected isHidden(part: string): boolean {
    const solo = this.solo();
    return this.hidden().has(part) || (solo !== null && solo !== part);
  }

  private emit(): void {
    this.visibility.emit(hiddenParts(this.script(), this.solo(), this.hidden()));
  }
}
