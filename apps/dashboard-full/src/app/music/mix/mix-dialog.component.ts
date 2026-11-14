import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { MusicStore } from '../music.store';
import { MixEditorComponent } from './mix-editor.component';
import { FloatingWindow } from '../../shared/floating-window/floating-window';
import { Edge } from '../../shared/floating-window/window-rect';

export interface MixDialogData {
  /** Index of the mix in the project's `mixes`. */
  index: number;
}

/**
 * The mixer in a modal: a mix grows with its clips, so it gets the whole
 * screen instead of the studio's column. It is the same editor, bound to the
 * same store. It closes with the X, Esc or a click outside (or by itself when
 * its mix is removed), moves by its title bar, resizes from any side or corner
 * (it can reach both screen edges) and maximizes with the button (or a double
 * click on the bar). The first move or resize takes over the window's position
 * (fixed, in pixels); the `mo-maximized` class in the global styles overrides it.
 */
@Component({
  selector: 'app-mix-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MixEditorComponent],
  templateUrl: './mix-dialog.component.html',
  styleUrl: './mix-dialog.component.scss',
})
export class MixDialogComponent {
  protected readonly data = inject<MixDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<MixDialogComponent>);
  private readonly store = inject(MusicStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly win = new FloatingWindow(this.ref, this.host);

  protected readonly edges = this.win.edges;

  /** The window fills the whole screen (and neither moves nor resizes until it is restored). */
  protected readonly maximized = this.win.maximized;

  protected readonly maximizeLabel = $localize`:@@mix.maximize:Maximize`;
  protected readonly restoreLabel = $localize`:@@mix.restore:Restore size`;

  /**
   * Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes the project's
   * last edit, unless a text field has the focus: there the browser undoes typing.
   */
  @HostListener('keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) this.store.undo();
    else if ((key === 'z' && e.shiftKey) || key === 'y') this.store.redo();
    else return;
    e.preventDefault();
  }

  protected toggleMaximize(): void {
    this.win.toggleMaximize();
  }

  protected startResize(ev: PointerEvent, edge: Edge): void {
    this.win.startResize(ev, edge);
  }

  /** Dragging the bar moves the window (the buttons on it keep working). */
  protected startMove(ev: PointerEvent): void {
    this.win.startMove(ev);
  }

  constructor() {
    effect(() => {
      if (!this.store.mixes()[this.data.index]) this.ref.close();
    });
  }
}
