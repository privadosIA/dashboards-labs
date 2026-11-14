import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';

import { MAX_PARTS_PER_STYLE } from '@lab/animation-dataset';
import { LEVELS, type Level, type Part } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/**
 * Picks the parts of a style from the catalog: a list to search and filter by level, and the chosen ones in order, which can be moved
 * and removed. It refuses a part that is already chosen, a part that the level chosen does not draw, and a ninth part.
 */
@Component({
  selector: 'app-part-picker',
  templateUrl: './part-picker.html',
  styleUrl: './part-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartPicker {
  /** The parts of the catalog to choose from. */
  readonly catalog = input<readonly Part[]>([]);
  /** The names chosen, in order. */
  readonly chosen = model<readonly string[]>([]);

  protected readonly t = textsFor(inject(LanguageService).lang).styleBuilder.picker;
  protected readonly max = MAX_PARTS_PER_STYLE;
  protected readonly levels = LEVELS;
  protected readonly query = signal('');
  protected readonly level = signal<Level | ''>('');

  protected readonly full = computed(() => this.chosen().length >= this.max);
  protected readonly matching = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.catalog().filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  });
  /** The chosen names, with the catalog's part when it still has it. */
  protected readonly picked = computed(() => this.chosen().map((name) => ({ name, part: this.catalog().find((p) => p.name === name) })));

  /** Why a part cannot be added now, or an empty text when it can. */
  protected whyNot(part: Part): string {
    if (this.chosen().includes(part.name)) return '';
    if (this.level() && !part.levels.includes(this.level() as Level)) return this.t.unsupported(this.t.levels[this.level() as Level]);
    if (this.full()) return this.t.full(this.max);
    return '';
  }

  protected isChosen(part: Part): boolean {
    return this.chosen().includes(part.name);
  }

  protected add(part: Part): void {
    if (this.isChosen(part) || this.whyNot(part)) return;
    this.chosen.set([...this.chosen(), part.name]);
  }

  protected remove(index: number): void {
    this.chosen.set(this.chosen().filter((_, i) => i !== index));
  }

  protected move(index: number, by: -1 | 1): void {
    const to = index + by;
    if (to < 0 || to >= this.chosen().length) return;
    const next = [...this.chosen()];
    [next[index], next[to]] = [next[to], next[index]];
    this.chosen.set(next);
  }

  protected setLevel(event: Event): void {
    this.level.set((event.target as HTMLSelectElement).value as Level | '');
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
