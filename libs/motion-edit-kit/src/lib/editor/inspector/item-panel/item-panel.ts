import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MAX_PAGE_PARTS, itemLength, itemPartProblem, layerEditProblem, layerOf, layerProblems, pageParts, removeItem, removeLayer, setItemParams, setItemPart, setItemRange, touches, type Catalog, type Script } from '@lab/animation-core';
import { PartParams, type Part, type PartLevel } from '@lab/motion-parts';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { Collapsible } from '../../../shared/collapsible/collapsible';
import { AnimatePanel } from '../animate/animate-panel';
import { onScript, type EditRequest } from '../edit';

/** Above this many parts on the page of a piece the panel says how many the render will draw there. */
const HEAVY_PARTS = 5;

/** A part an item may have, or the reason it may not. */
interface Choice {
  readonly name: string;
  readonly why: string | null;
}

/**
 * An item of a layer: its part (only the ones the pages it touches can draw), its parameters, where it starts and ends in the song, its
 * animation over its own length, and the way to take it, or its whole layer, away. What the server would refuse is said in its own words.
 * Each change is a request for the page.
 */
@Component({
  selector: 'app-item-panel',
  imports: [AnimatePanel, Collapsible, PartParams],
  templateUrl: './item-panel.html',
  styleUrl: './item-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemPanel {
  readonly script = input.required<Script>();
  readonly catalog = input.required<Catalog>();
  readonly level = input.required<PartLevel>();
  /** The layer and the place of the item in its lane. */
  readonly layer = input.required<string>();
  readonly item = input.required<number>();
  readonly locked = input(false);
  readonly playhead = input(0);
  /** The keyframe selected on the timeline, when it is one of this item's. */
  readonly keyframe = input<{ readonly param: string; readonly keyframe: number } | null>(null);
  readonly edit = output<EditRequest>();
  readonly pick = output<{ readonly param: string; readonly keyframe: number }>();

  protected readonly t = textsFor(inject(LanguageService).lang).inspector;
  /** Why the last edit of the range was refused, in the server's words. */
  protected readonly notice = signal('');

  protected readonly found = computed(() => layerOf(this.script(), this.layer())?.items[this.item()]);
  protected readonly part = computed<Part | undefined>(() => this.catalog().parts.find((p) => p.name === this.found()?.part));
  protected readonly length = computed(() => {
    const it = this.found();
    return it ? itemLength(it) : 0;
  });
  /** What the server would refuse in this layer, in its words. */
  protected readonly problems = computed(() =>
    layerProblems(this.script(), this.catalog())
      .filter((p) => p.layer === this.layer() && (p.item === undefined || p.item === this.item()))
      .map((p) => p.text),
  );
  protected readonly choices = computed<Choice[]>(() => {
    const script = this.script();
    const cat = this.catalog();
    const current = this.found()?.part;
    return cat.parts.map((p) => ({ name: p.name, why: p.name === current ? null : itemPartProblem(script, this.layer(), this.item(), p.name, cat) }));
  });
  /** The most parts any page the item touches would draw, when that is a lot. */
  protected readonly heavy = computed(() => {
    const it = this.found();
    if (!it) return 0;
    const script = this.script();
    const most = Math.max(0, ...script.pieces.map((p, i) => (touches(it, p) ? pageParts(script, i).length : 0)));
    return most > HEAVY_PARTS ? most : 0;
  });
  protected readonly maxParts = MAX_PAGE_PARTS;

  protected choose(name: string): void {
    const cat = this.catalog();
    this.edit.emit(onScript((s) => setItemPart(s, this.layer(), this.item(), name, cat)));
  }

  protected params(values: Record<string, unknown>): void {
    this.edit.emit(onScript((s) => setItemParams(s, this.layer(), this.item(), values), `item-params-${this.layer()}-${this.item()}`));
  }

  /** Sets the start or the end; when the item cannot go there (a neighbour, the song, a part drawn twice) the panel says why and nothing changes. */
  protected setRange(edge: 'start' | 'end', raw: string): void {
    const it = this.found();
    const n = Number(raw);
    this.notice.set('');
    if (!it || raw === '' || !Number.isFinite(n)) return;
    const start = edge === 'start' ? n : it.start;
    const end = edge === 'end' ? n : it.end;
    const cat = this.catalog();
    const script = this.script();
    const next = setItemRange(script, this.layer(), this.item(), start, end, cat);
    if (next === script) {
      const free = setItemRange(script, this.layer(), this.item(), start, end);
      if (free !== script) this.notice.set(layerEditProblem(script, free, cat) ?? '');
      return;
    }
    this.edit.emit(onScript((s) => setItemRange(s, this.layer(), this.item(), start, end, cat), `item-range-${this.layer()}-${this.item()}`));
  }

  protected remove(): void {
    this.edit.emit(onScript((s) => removeItem(s, this.layer(), this.item())));
  }

  protected removeLayer(): void {
    this.edit.emit(onScript((s) => removeLayer(s, this.layer())));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
