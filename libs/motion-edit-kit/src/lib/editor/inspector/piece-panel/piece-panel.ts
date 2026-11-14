import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { addExtra, extraChoices, removeExtra, setExtraParams, setExtraPart, setMode, setParams, setPart, setPieceDesign, setStage, type Catalog, type Design, type Mode, type PieceReview, type ReviewScene, verdictOf, type PieceDesign, type Script, type ScriptPiece, type SongMap, type Stage } from '@lab/animation-core';
import { modeFor, motionEditorTexts, warningText, type Warning } from '@lab/motion-editor';
import { PartParams, type Part, type PartLevel } from '@lab/motion-parts';
import { PieceDesignForm, StageEditor } from '@lab/music-motion';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { sceneTextsFor } from '../../scenes/texts';
import { hasSceneFeature, hasThemeFeature } from '../../scenes/features';
import { withPieceTransition } from '../theme/theme-edit';
import { onScript, type EditRequest } from '../edit';
import { AnimatePanel } from '../animate/animate-panel';
import { HitEditor } from '../hit-editor/hit-editor';
import { Collapsible } from '../../../shared/collapsible/collapsible';
import { LinesEditor } from '../lines-editor/lines-editor';

/**
 * Everything a script piece is made of, editable: its part and parameters, its mode, the lyrics it shows, its full-screen word, its extra
 * parts, its stage and its own design (with the typefaces). With `extra` set, only that extra part. Each change is a request for the page,
 * which owns the document.
 */
@Component({
  selector: 'app-piece-panel',
  imports: [AnimatePanel, Collapsible, HitEditor, LinesEditor, PartParams, PieceDesignForm, StageEditor],
  templateUrl: './piece-panel.html',
  styleUrl: './piece-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PiecePanel {
  readonly script = input.required<Script>();
  readonly songDesign = input.required<Design>();
  readonly songMap = input.required<SongMap>();
  readonly level = input.required<PartLevel>();
  readonly catalog = input.required<Catalog>();
  readonly pieceId = input.required<string>();
  /** The index in `with` of the extra part being edited, or `undefined` for the piece itself. */
  readonly extra = input<number | undefined>(undefined);
  readonly locked = input(false);
  /** Why the server refused this piece, in its own words. */
  readonly refused = input('');
  /** What the live checks found in the draft: the ones about this piece are listed. */
  readonly warnings = input<readonly Warning[]>([]);
  /** Where the playhead is, in song seconds: an animated parameter shows the value it has there. */
  readonly playhead = input(0);
  /** The last review of the piece: this block's grade and notes are shown. */
  readonly review = input<PieceReview | null>(null);
  /** The keyframe selected on the timeline, when it is one of this part's. */
  readonly keyframe = input<{ readonly param: string; readonly keyframe: number } | null>(null);
  readonly edit = output<EditRequest>();
  /** A keyframe was chosen in the panel. */
  readonly pick = output<{ readonly param: string; readonly keyframe: number }>();
  /** Scene…: write a scene for this block. */
  readonly writeScene = output<string>();
  /** Edit scene…: change the texts of the scene that is this block's part (its name). */
  readonly editScene = output<{ readonly piece: string; readonly part: string }>();

  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).editing;
  protected readonly ti = textsFor(this.lang).inspector;
  protected readonly ts = sceneTextsFor(this.lang);
  /** The server writes scenes: the Scene button and the badge are drawn only then. */
  /** What the review said of this block, with its verdict. */
  protected readonly graded = computed(() => {
    const scene: ReviewScene | undefined = this.extra() === undefined ? this.review()?.scenes.find((x) => x.scriptPiece === this.pieceId()) : undefined;
    return scene ? { ...scene, verdict: scene.verdict ?? verdictOf(scene.score) } : null;
  });
  /** The server carries a theme and a crossfade: a piece may have a crossfade of its own. */
  protected readonly themed = computed(() => hasThemeFeature(this.catalog()));
  /** The crossfade into this piece, when it has one of its own. */
  protected readonly ownTransition = computed(() => this.piece()?.transition_seconds);
  /** The crossfade that is drawn: the piece's own, or the design's. */
  protected readonly shownTransition = computed(() => this.ownTransition() ?? this.songDesign().transitionSeconds ?? 0);
  protected readonly sceneOn = computed(() => hasSceneFeature(this.catalog()));
  private readonly tm = motionEditorTexts(this.lang);
  protected readonly marks = computed(() => this.warnings().filter((w) => w.piece === this.pieceId() && (this.extra() === undefined || w.extra === undefined || w.extra === this.extra())).map((w) => ({ text: warningText(this.tm, w), soft: w.severity === 'info' })));

  protected readonly index = computed(() => this.script().pieces.findIndex((p) => p.id === this.pieceId()));
  protected readonly piece = computed<ScriptPiece | undefined>(() => this.script().pieces[this.index()]);
  protected readonly partName = computed(() => {
    const p = this.piece();
    const k = this.extra();
    return p ? (k === undefined ? p.part : (p.with?.[k]?.part ?? '')) : '';
  });
  protected readonly part = computed<Part | undefined>(() => this.catalog().parts.find((x) => x.name === this.partName()));
  protected readonly values = computed(() => {
    const p = this.piece();
    const k = this.extra();
    return p ? (k === undefined ? p.params : p.with?.[k]?.params) : undefined;
  });
  /** The parts that can be chosen here: for the main part every one the extras do not draw; for an extra, the ones the piece does not draw. */
  protected readonly choices = computed(() => {
    const p = this.piece();
    if (!p) return [];
    const k = this.extra();
    if (k !== undefined) return extraChoices(p, this.catalog(), p.with?.[k]?.part);
    const taken = new Set((p.with ?? []).map((w) => w.part));
    return this.catalog().parts.map((x) => x.name).filter((n) => n === p.part || !taken.has(n));
  });
  protected readonly supported = computed(() => (this.part() ? this.part()!.levels.includes(this.level()) : true));
  protected readonly extras = computed(() => this.piece()?.with ?? []);
  protected readonly addable = computed(() => (this.piece() ? extraChoices(this.piece()!, this.catalog()) : []));
  protected readonly full = computed(() => this.extras().length >= 3);
  protected readonly sectionMode = computed(() => {
    const p = this.piece();
    return modeFor(this.songDesign(), p?.section);
  });

  private at(): number {
    return this.index();
  }

  protected choose(name: string): void {
    const k = this.extra();
    const cat = this.catalog();
    this.edit.emit(onScript((s) => (k === undefined ? setPart(s, this.at(), name, cat) : setExtraPart(s, this.at(), k, name, cat))));
  }

  protected params(values: Record<string, unknown>, extra = this.extra()): void {
    this.edit.emit(onScript((s) => (extra === undefined ? setParams(s, this.at(), values) : setExtraParams(s, this.at(), extra, values)), `params-${this.pieceId()}-${extra ?? 'main'}`));
  }

  protected setMode(value: string): void {
    this.edit.emit(onScript((s) => setMode(s, this.at(), value === 'dark' || value === 'light' ? (value as Mode) : undefined)));
  }

  protected add(name: string): void {
    if (name === '') return;
    const cat = this.catalog();
    this.edit.emit(onScript((s) => addExtra(s, this.at(), name, cat)));
  }

  protected remove(k: number): void {
    this.edit.emit(onScript((s) => removeExtra(s, this.at(), k)));
  }

  protected stage(stage: Stage | null): void {
    this.edit.emit(onScript((s) => setStage(s, this.at(), stage), `stage-${this.pieceId()}`));
  }

  protected design(design: PieceDesign | null): void {
    this.edit.emit(onScript((s) => setPieceDesign(s, this.at(), design), `design-${this.pieceId()}`));
  }

  protected levelsOf(name: string): string {
    return this.catalog().parts.find((p) => p.name === name)?.levels.join(', ') ?? '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected partFor(name: string): Part | undefined {
    return this.catalog().parts.find((p) => p.name === name);
  }

  protected setTransition(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const i = this.index();
    this.edit.emit(onScript((script) => withPieceTransition(script, i, value), `piece-transition-${this.pieceId()}`));
  }

  /** Gives the crossfade back to the design's. */
  protected inheritTransition(): void {
    const i = this.index();
    this.edit.emit(onScript((script) => withPieceTransition(script, i, undefined)));
  }
}
