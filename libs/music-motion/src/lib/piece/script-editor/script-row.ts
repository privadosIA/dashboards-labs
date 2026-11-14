import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';


import type { Catalog, Design, Level, Mode, PieceDesign, ScriptPiece, Stage, Style } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { formatClock } from '../../shared/format';
import { LOCK_KEY } from '../../shared/lock';
import { PartParams } from '@lab/motion-parts';
import { ExtraParts } from './extra-parts/extra-parts';
import { PieceDesignBlock } from './piece-design/piece-design';
import { StageEditor } from '../stage-editor/stage-editor';
import { toRowModel, unchanged, type RowModel } from './row-model';
import { FIXED_END, FIXED_START, buildRowSchema } from './row-schema';

/** Milliseconds a cut waits after the last key before it moves, so typing 12 does not first move it to 1. */
export const TIME_DEBOUNCE_MS = 500;

const TIME_KEYS = ['start', 'end', 'hitAt', 'hitLength'];

/** One piece of the script, as a form. It says what the person changed; the editor applies it to the script. */
@Component({
  selector: 'app-script-row',
  imports: [DynamicFormComponent, ExtraParts, PartParams, PieceDesignBlock, StageEditor],
  templateUrl: './script-row.html',
  styleUrl: './script-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptRow {
  readonly piece = input.required<ScriptPiece>();
  readonly index = input.required<number>();
  readonly count = input.required<number>();
  readonly catalog = input.required<Catalog>();
  readonly level = input.required<Level>();
  /** The style of the piece: only the illustrated one has a stage. */
  readonly style = input<Style>('typographic');
  readonly defaultMode = input.required<Mode>();
  /** The song's design, to say what a piece's own design replaces. */
  readonly song = input.required<Design>();
  readonly locked = input(false);
  /** The server's reason when it is about this piece. */
  readonly problem = input('');
  /** The fields as the person left them, when they differ from the piece. */
  readonly edit = output<RowModel>();
  /** The parameters of the piece's part, as the person left them. */
  readonly params = output<Record<string, unknown>>();
  /** The stage of the piece as the person left it; `null` when nothing is left. */
  readonly stage = output<Stage | null>();
  /** The person added an extra part. */
  readonly addExtra = output<string>();
  readonly removeExtra = output<number>();
  readonly extraPart = output<{ k: number; part: string }>();
  readonly extraParams = output<{ k: number; params: Record<string, unknown> }>();
  /** The design the piece has of its own, as the person left it; `null` when none is left. */
  readonly pieceDesign = output<PieceDesign | null>();
  /** The person asked to see this piece on the song map. */
  readonly show = output<void>();

  protected readonly t = textsFor(inject(LanguageService).lang).script;
  protected readonly clock = formatClock;
  protected readonly schema = computed(() => buildRowSchema(this.piece(), this.catalog(), this.level(), this.t));
  protected readonly model = signal<RowModel>({});
  /** The catalog's description of the part the piece uses; none when the catalog does not have it. */
  protected readonly part = computed(() => this.catalog().parts.find((x) => x.name === this.piece().part) ?? null);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const piece = this.piece();
      const fixed = { [FIXED_START]: this.index() === 0, [FIXED_END]: this.index() === this.count() - 1, [LOCK_KEY]: this.locked() };
      const dm = this.defaultMode();
      untracked(() => this.model.update((m) => (unchanged(m, piece, dm) && m[LOCK_KEY] === fixed[LOCK_KEY] ? { ...m, ...fixed } : { ...toRowModel(piece, dm), ...fixed })));
    });
  }

  protected changed(model: RowModel): void {
    const piece = this.piece();
    const dm = this.defaultMode();
    clearTimeout(this.timer);
    if (unchanged(model, piece, dm)) return;
    const now = toRowModel(piece, dm);
    const onlyTimes = Object.keys(now).filter((k) => String(model[k] ?? '') !== String(now[k] ?? '')).every((k) => TIME_KEYS.includes(k));
    if (onlyTimes) this.timer = setTimeout(() => this.edit.emit(model), TIME_DEBOUNCE_MS);
    else this.edit.emit(model);
  }
}
