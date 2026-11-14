import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { rename, setLocked, setVisible } from '../model/edits';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import type { VectorStore } from '../store/vector-store';
import { vectorTexts } from '../texts';
import { dropNode, rowsOf, zoneOf, type DropZone, type Row } from './rows';

/**
 * The layers: the nodes in drawing order (the first is drawn first, at the back), with an editable name, visibility and lock, selection
 * shared with the canvas, and drag to reorder among siblings and into or out of groups. What an import holds mirrors its markup, so those
 * rows are selected, renamed and shown or hidden, but not moved.
 */
@Component({
  selector: 'lab-vector-tree',
  templateUrl: './tree.html',
  styleUrl: './tree.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorTree {
  readonly store = input.required<VectorStore>();

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly editing = signal<string | undefined>(undefined);
  protected readonly drop = signal<{ id: string; zone: DropZone } | undefined>(undefined);
  private readonly dragging = signal<string | undefined>(undefined);
  private readonly focused = signal<string | undefined>(undefined);

  protected readonly rows = computed(() => rowsOf(this.store().doc().nodes, this.collapsed()));
  protected readonly selection = computed(() => this.store().selection());
  /** The row that takes the Tab stop: the focused one, else the first selected, else the first. */
  protected readonly focusId = computed(() => this.focused() ?? this.selection()[0] ?? this.rows()[0]?.id);
  protected readonly deep = computed(() => this.rows().some((r) => r.atLimit));

  protected select(row: Row, e: MouseEvent): void {
    this.focused.set(row.id);
    if (e.shiftKey || e.ctrlKey || e.metaKey) this.store().toggleSelect(row.id);
    else this.store().select([row.id]);
  }

  protected toggleCollapse(id: string, e: Event): void {
    e.stopPropagation();
    this.collapsed.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected toggleVisible(row: Row, e: Event): void {
    e.stopPropagation();
    this.store().apply((d) => setVisible(d, row.id, !row.visible));
  }

  protected toggleLocked(row: Row, e: Event): void {
    e.stopPropagation();
    this.store().apply((d) => setLocked(d, row.id, !row.locked));
  }

  protected startRename(id: string, e?: Event): void {
    e?.stopPropagation();
    this.editing.set(id);
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-testid="name-input"]')?.select());
  }

  protected nameKey(e: KeyboardEvent, row: Row): void {
    e.stopPropagation();
    if (e.key === 'Enter') this.commitName(e, row);
    else if (e.key === 'Escape') this.editing.set(undefined);
  }

  protected commitName(e: Event, row: Row): void {
    if (this.editing() !== row.id) return;
    this.editing.set(undefined);
    const name = (e.target as HTMLInputElement).value.trim();
    if (name && name !== row.name) this.store().apply((d) => rename(d, row.id, name), `name:${row.id}`);
  }

  // — drag and drop —

  protected dragStart(e: DragEvent, row: Row): void {
    if (!row.movable || this.editing()) {
      e.preventDefault();
      return;
    }
    this.dragging.set(row.id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.id);
    }
  }

  protected dragOver(e: DragEvent, row: Row): void {
    const id = this.dragging();
    if (!id || !row.movable) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = zoneOf(rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5, row.accepts);
    if (dropNode(this.store().doc().nodes, id, row.id, zone) === this.store().doc().nodes) return;
    e.preventDefault();
    if (this.drop()?.id !== row.id || this.drop()?.zone !== zone) this.drop.set({ id: row.id, zone });
  }

  protected dropOn(e: DragEvent, row: Row): void {
    const id = this.dragging();
    const target = this.drop();
    e.preventDefault();
    this.dragEnd();
    if (!id || !target || target.id !== row.id) return;
    this.store().apply((d) => ({ ...d, nodes: dropNode(d.nodes, id, row.id, target.zone) }));
  }

  protected dragEnd(): void {
    this.dragging.set(undefined);
    this.drop.set(undefined);
  }

  // — the keyboard —

  protected keydown(e: KeyboardEvent): void {
    const rows = this.rows();
    const at = rows.findIndex((r) => r.id === this.focusId());
    const move = (to: number): void => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (!next) return;
      this.focused.set(next.id);
      this.store().select([next.id]);
      queueMicrotask(() => (document.querySelector(`[data-testid="row-${next.id.replace(/["\\]/g, '\\$&')}"]`) as HTMLElement | null)?.focus());
    };
    const row = rows[at];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(at + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(at - 1);
        break;
      case 'ArrowRight':
        if (row?.hasChildren && this.collapsed().has(row.id)) this.toggleCollapse(row.id, e);
        break;
      case 'ArrowLeft':
        if (row?.hasChildren && !this.collapsed().has(row.id)) this.toggleCollapse(row.id, e);
        break;
      case 'F2':
        if (row) this.startRename(row.id);
        break;
      case 'Enter':
      case ' ':
        if (row && (e.target as HTMLElement).tagName === 'LI') {
          e.preventDefault();
          this.store().select([row.id]);
        }
        break;
    }
  }
}
