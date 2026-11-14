import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { EASES, addItemKeyframe, addKeyframe, clearAnimate, editItemKeyframe, editKeyframe, evaluateKeyframes, hasAnimateFeature, layerOf, moveItemKeyframe, moveKeyframe, removeItemKeyframe, removeKeyframe, setItemKeyframes, setKeyframes, type Catalog, type Ease, type Keyframe, type Script, type ScriptPiece } from '@lab/animation-core';
import { readDefault, type Part, type PartParam } from '@lab/motion-parts';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { onScript, type EditRequest } from '../edit';

/** One parameter of the part as the panel shows it. */
interface Row {
  readonly def: PartParam;
  /** Its keyframes, or `null` while it does not animate. */
  readonly frames: readonly Keyframe[] | null;
  /** What the part receives at the playhead (its keyframes' value there), for an animated parameter. */
  readonly shown: string;
}

/**
 * Animation of the parameters of the selected part (or extra): Animate on each parameter the catalog marks `animatable` (only when the server
 * says it takes keyframes), the keyframes of an animated one with the value the part gets at the playhead, the value, time and ease of the
 * selected keyframe, and the way to take one, a parameter's or all of them away. With `layer` set it is the animation of an item of a layer instead, over the
 * item's own length. Each change is a request for the page.
 */
@Component({
  selector: 'app-animate-panel',
  templateUrl: './animate-panel.html',
  styleUrl: './animate-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatePanel {
  readonly script = input.required<Script>();
  /** The place of the piece in the script. */
  readonly index = input(0);
  /** The item of a layer this panel is about (and then `index` and `extra` mean nothing). */
  readonly layer = input<{ readonly id: string; readonly item: number } | undefined>(undefined);
  /** The place in `with` of the extra part, or none for the piece's own part. */
  readonly extra = input<number | undefined>(undefined);
  readonly part = input.required<Part>();
  readonly catalog = input.required<Catalog>();
  /** Where the playhead is, in song seconds. */
  readonly playhead = input(0);
  /** The keyframe selected on the timeline or here: its parameter and its place in that parameter's list. */
  readonly selected = input<{ readonly param: string; readonly keyframe: number } | null>(null);
  readonly locked = input(false);
  readonly edit = output<EditRequest>();
  readonly pick = output<{ readonly param: string; readonly keyframe: number }>();

  protected readonly t = textsFor(inject(LanguageService).lang).inspector.animate;
  protected readonly eases = EASES;

  /**
   * The keyframe being edited. It follows the `selected` input (the timeline chose it) and is also set at once by what the person does here, so
   * that an edit made right after a click is made on the keyframe that was clicked, not on the one the page had not yet told this panel about.
   */
  private readonly chosen = signal<{ readonly param: string; readonly keyframe: number } | null>(null);

  constructor() {
    effect(() => this.chosen.set(this.selected()));
  }

  private readonly piece = computed<ScriptPiece | undefined>(() => this.script().pieces[this.index()]);
  /** What the keyframes are over: an item of a layer, or the piece. */
  private readonly span = computed<{ readonly start: number; readonly end: number } | undefined>(() => {
    const l = this.layer();
    return l ? layerOf(this.script(), l.id)?.items[l.item] : this.piece();
  });
  protected readonly feature = computed(() => hasAnimateFeature(this.catalog()));
  private readonly animate = computed(() => {
    const l = this.layer();
    if (l) return layerOf(this.script(), l.id)?.items[l.item]?.animate ?? {};
    const p = this.piece();
    const k = this.extra();
    return (k === undefined ? p?.animate : p?.with?.[k]?.animate) ?? {};
  });
  private readonly params = computed<Readonly<Record<string, unknown>>>(() => {
    const l = this.layer();
    if (l) return layerOf(this.script(), l.id)?.items[l.item]?.params ?? {};
    const p = this.piece();
    const k = this.extra();
    return (k === undefined ? p?.params : p?.with?.[k]?.params) ?? {};
  });
  /** The length of the piece (or the item), where its keyframes may be. */
  protected readonly length = computed(() => {
    const p = this.span();
    return p ? Math.round((p.end - p.start) * 1000) / 1000 : 0;
  });
  /** The playhead as a second of the piece (or the item), held inside it. */
  private readonly now = computed(() => {
    const p = this.span();
    return p ? Math.min(Math.max(this.playhead() - p.start, 0), this.length()) : 0;
  });
  /** The part of a label that tells this panel's keyframes from every other's. */
  private readonly owner = computed(() => {
    const l = this.layer();
    return l ? `${l.id}-${l.item}` : `${this.index()}-${this.extra() ?? 'main'}`;
  });

  /** The parameters shown: the animatable ones (when the server takes keyframes) and any that already has keyframes. */
  protected readonly rows = computed<Row[]>(() =>
    this.part()
      .params.filter((d) => (this.feature() && d.animatable) || (this.animate()[d.name]?.length ?? 0) > 0)
      .map((def) => {
        const frames = this.animate()[def.name] ?? null;
        const value = frames && frames.length > 0 ? evaluateKeyframes(frames, this.now(), def.type === 'int') : undefined;
        return { def, frames: frames && frames.length > 0 ? frames : null, shown: value === undefined ? '' : this.say(def, value) };
      }),
  );
  /** Some parameter of the part cannot be animated: the help says why. */
  protected readonly someFixed = computed(() => this.feature() && this.part().params.some((d) => !d.animatable));
  /** The piece, or its extra, has keyframes with a server that does not take them. */
  protected readonly hasAny = computed(() => {
    if (this.layer()) return Object.keys(this.animate()).length > 0;
    const p = this.piece();
    return !!p && (Object.keys(p.animate ?? {}).length > 0 || (p.with ?? []).some((w) => Object.keys(w.animate ?? {}).length > 0));
  });
  protected readonly unsupported = computed(() => this.hasAny() && !this.feature());

  protected say(def: PartParam, value: string | number | boolean): string {
    if (typeof value === 'boolean') return value ? this.t.on : this.t.off;
    return def.type === 'number' && typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);
  }

  protected isPicked(param: string, n: number): boolean {
    const s = this.chosen();
    return s?.param === param && s.keyframe === n;
  }

  /** The person chose a keyframe here. */
  protected choose(param: string, keyframe: number): void {
    this.chosen.set({ param, keyframe });
    this.pick.emit({ param, keyframe });
  }

  protected picked(row: Row): { frame: Keyframe; n: number } | null {
    const s = this.chosen();
    const frame = s && s.param === row.def.name ? row.frames?.[s.keyframe] : undefined;
    return frame && s ? { frame, n: s.keyframe } : null;
  }

  /** Starts animating a parameter: its value now at the start of the piece and at its end, both linear. */
  protected animateParam(def: PartParam): void {
    const stored = this.params()[def.name];
    const value = (stored ?? readDefault(def) ?? (def.type === 'bool' ? false : def.type === 'string' || def.type === 'enum' ? '' : 0)) as Keyframe['value'];
    const frames: Keyframe[] = [{ t: 0, value, ease: 'linear' }, { t: this.length(), value, ease: 'linear' }];
    this.apply((s) => this.setFrames(s, def.name, frames));
    this.choose(def.name, 0);
  }

  protected stopParam(def: PartParam): void {
    this.apply((s) => this.setFrames(s, def.name, []));
  }

  protected removeAll(): void {
    const l = this.layer();
    this.apply((s) => (l ? Object.keys(this.animate()).reduce((acc, param) => setItemKeyframes(acc, l.id, l.item, param, []), s) : clearAnimate(s, this.index())));
  }

  /** The place of the selected keyframe of a parameter, read when the person acts (not when the view was last drawn): a quick hand must not edit the one before. */
  private current(def: PartParam): number | null {
    const s = this.chosen();
    return s && s.param === def.name ? s.keyframe : null;
  }

  protected removeFrame(def: PartParam): void {
    const n = this.current(def);
    if (n === null) return;
    const l = this.layer();
    this.apply((s) => (l ? removeItemKeyframe(s, l.id, l.item, def.name, n) : removeKeyframe(s, this.index(), def.name, n, this.extra())));
  }

  protected setValue(def: PartParam, raw: string | boolean): void {
    const n = this.current(def);
    if (n === null) return;
    let value: Keyframe['value'];
    if (def.type === 'int' || def.type === 'number') {
      const num = Number(raw);
      if (raw === '' || !Number.isFinite(num)) return;
      value = def.type === 'int' ? Math.round(num) : num;
    } else value = raw as string | boolean;
    this.apply((s) => this.editFrame(s, def.name, n, { value }), `keyframe-value-${this.owner()}-${def.name}-${n}`);
  }

  protected setTime(def: PartParam, raw: string): void {
    const n = this.current(def);
    const t = Number(raw);
    if (n === null) return;
    if (raw === '' || !Number.isFinite(t)) return;
    const l = this.layer();
    this.apply((s) => (l ? moveItemKeyframe(s, l.id, l.item, def.name, n, t) : moveKeyframe(s, this.index(), def.name, n, t, this.extra())), `keyframe-time-${this.owner()}-${def.name}-${n}`);
  }

  protected setEase(def: PartParam, ease: string): void {
    const n = this.current(def);
    if (n === null) return;
    this.apply((s) => this.editFrame(s, def.name, n, { ease: ease as Ease }));
  }

  protected add(def: PartParam, row: Row): void {
    if (!row.frames) return;
    const t = Math.round(this.now() * 1000) / 1000;
    const value = evaluateKeyframes(row.frames, t, def.type === 'int');
    if (value === undefined) return;
    const l = this.layer();
    this.apply((s) => (l ? addItemKeyframe(s, l.id, l.item, def.name, { t, value, ease: 'linear' }) : addKeyframe(s, this.index(), def.name, { t, value, ease: 'linear' }, this.extra())));
    this.choose(def.name, row.frames.filter((f) => f.t < t - 0.005).length);
  }

  protected frameText(row: Row, n: number): string {
    const f = row.frames![n];
    return this.t.keyframe(n + 1, `${f.t.toFixed(2)} s`, this.say(row.def, f.value));
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private setFrames(s: Script, param: string, frames: readonly Keyframe[]): Script {
    const l = this.layer();
    return l ? setItemKeyframes(s, l.id, l.item, param, frames) : setKeyframes(s, this.index(), param, frames, this.extra());
  }

  private editFrame(s: Script, param: string, n: number, change: Partial<Pick<Keyframe, 'value' | 'ease'>>): Script {
    const l = this.layer();
    return l ? editItemKeyframe(s, l.id, l.item, param, n, change) : editKeyframe(s, this.index(), param, n, change, this.extra());
  }

  private apply(fn: (script: Script) => Script, label?: string): void {
    this.edit.emit(onScript(fn, label));
  }
}
