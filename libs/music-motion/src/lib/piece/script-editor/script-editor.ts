import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { addExtra, AnimationFailure, covers, isBusy, isProposing, pieceOf, removeExtra, setExtraParams, setExtraPart, setParams, setPieceDesign, setStage, type Catalog, type PieceDesign, type PieceDetail, type Script, type Stage } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { applyRow, type RowModel } from './row-model';
import { ScriptRow } from './script-row';

/**
 * The script of a piece as a list of forms. What the person types is kept as a draft that the screen shows at once; the
 * whole script is sent when saved, and the server decides: its reason is shown at the piece it names and the draft stays.
 */
@Component({
  selector: 'app-script-editor',
  imports: [ScriptRow],
  templateUrl: './script-editor.html',
  styleUrl: './script-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptEditor {
  readonly piece = input.required<PieceDetail>();
  readonly catalog = input.required<Catalog>();
  /** The piece as the server holds it after the script was saved. */
  readonly saved = output<PieceDetail>();
  /** The span of the piece the person asked to see on the song map. */
  readonly selected = output<{ start: number; end: number }>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.script;

  protected readonly draft = signal<Script>({ version: 1, pieces: [] });
  protected readonly locked = computed(() => isBusy(this.piece()) || isProposing(this.piece()));
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.piece().script));
  protected readonly whole = computed(() => covers(this.draft(), this.piece().songMap.duration));
  protected readonly working = signal(false);
  protected readonly done = signal(false);
  protected readonly refused = signal('');
  private readonly named = computed(() => pieceOf(this.refused()));
  protected readonly general = computed(() => (this.refused() && !this.named() ? this.refused() : ''));
  protected readonly defaultMode = computed(() => this.piece().design.design.defaultMode);
  protected readonly songDesign = computed(() => this.piece().design.design);

  constructor() {
    // The draft starts from the piece's script, and again when the piece's script changes (saved, or a proposal replaced it).
    effect(() => {
      const script = this.piece().script;
      untracked(() => {
        this.draft.set(structuredClone(script) as Script);
        this.refused.set('');
      });
    });
  }

  protected problemOf(id: string): string {
    return this.named() === id ? this.refused() : '';
  }

  protected edit(i: number, model: RowModel): void {
    this.done.set(false);
    this.draft.update((s) => applyRow(s, i, model, this.catalog(), this.piece().design.design.defaultMode));
  }

  protected editParams(i: number, params: Record<string, unknown>): void {
    this.done.set(false);
    this.draft.update((s) => setParams(s, i, params));
  }

  protected editStage(i: number, stage: Stage | null): void {
    this.done.set(false);
    this.draft.update((s) => setStage(s, i, stage));
  }

  /** A change of the draft made by one of the editing functions. */
  private apply(change: (script: Script) => Script): void {
    this.done.set(false);
    this.draft.update(change);
  }

  protected addExtraPart(i: number, part: string): void {
    this.apply((s) => addExtra(s, i, part, this.catalog()));
  }

  protected removeExtraPart(i: number, k: number): void {
    this.apply((s) => removeExtra(s, i, k));
  }

  protected changeExtraPart(i: number, e: { k: number; part: string }): void {
    this.apply((s) => setExtraPart(s, i, e.k, e.part, this.catalog()));
  }

  protected changeExtraParams(i: number, e: { k: number; params: Record<string, unknown> }): void {
    this.apply((s) => setExtraParams(s, i, e.k, e.params));
  }

  protected changePieceDesign(i: number, design: PieceDesign | null): void {
    this.apply((s) => setPieceDesign(s, i, design));
  }

  protected show(i: number): void {
    const p = this.draft().pieces[i];
    if (p) this.selected.emit({ start: p.start, end: p.end });
  }

  protected discard(): void {
    this.draft.set(structuredClone(this.piece().script) as Script);
    this.refused.set('');
    this.done.set(false);
  }

  protected save(): void {
    if (this.working() || this.locked() || !this.dirty()) return;
    this.working.set(true);
    this.refused.set('');
    this.done.set(false);
    this.port
      .saveScript(this.piece().id, this.draft())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (piece) => {
          this.working.set(false);
          this.done.set(true);
          this.saved.emit(piece);
        },
        error: (e) => {
          this.working.set(false);
          this.refused.set(e instanceof AnimationFailure ? e.reason : failureText(e, this.texts));
        },
      });
  }
}
