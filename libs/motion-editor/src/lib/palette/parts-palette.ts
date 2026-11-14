import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import type { Part } from '@lab/motion-parts';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import { motionEditorTexts } from '../texts';
import { PALETTE_MIME, itemToJson, type PaletteItem } from './palette-item';

/**
 * The library the editor draws from: a text that appears on screen and every part of the catalog, searchable, with a mark on the ones the
 * piece's level does not support. Each row is dragged onto the timeline; the + button adds it to the piece that is selected (the page decides
 * what that means), so it can be done without a mouse drag too.
 */
@Component({
  selector: 'lab-parts-palette',
  templateUrl: './parts-palette.html',
  styleUrl: './parts-palette.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartsPalette {
  readonly parts = input.required<readonly Part[]>();
  /** The level of the piece, to mark the parts it does not support. */
  readonly level = input<string>('medium');
  readonly locked = input(false);
  /** Parts that cannot be used for what is selected, each with the reason (the server's words): they are dimmed and the reason is said. */
  readonly unavailable = input<Readonly<Record<string, string>>>({});
  /** Draws its own heading; a host that gives it one (a folding header) turns this off. */
  readonly heading = input(true);
  /** The + of a row: the host adds the item where it makes sense. */
  readonly add = output<PaletteItem>();
  /** The replace button of a part row: the host makes it the part of the chosen piece. */
  readonly replace = output<PaletteItem>();
  /** The layer button of a part row: the host makes a layer item of it where the playhead is. */
  readonly addLayer = output<PaletteItem>();

  protected readonly t = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  protected readonly query = signal('');
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return [...this.parts()]
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ part: p, supported: p.levels.includes(this.level() as never), why: this.unavailable()[p.name] ?? '' }));
  });
  protected readonly textVisible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return !q || this.t.palette.text.toLowerCase().includes(q);
  });

  protected start(event: DragEvent, item: PaletteItem): void {
    if (this.locked() || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(PALETTE_MIME, itemToJson(item));
    event.dataTransfer.setData('text/plain', item.kind === 'part' ? item.name : this.t.palette.text);
  }

  protected typed(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected item(name: string): PaletteItem {
    return { kind: 'part', name };
  }
}
