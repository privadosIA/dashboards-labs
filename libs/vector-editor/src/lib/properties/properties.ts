import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';

import { BEAT_KINDS, PAINT_VARS, PULSE_DECAY, type BeatKind, type BeatLink, type ImageNode, type Node, type PaintVar, type Property, type TextAlign, type TextNode } from '../model/document';
import { editProperty, keyframeIndexAt, toggleKeyframe } from '../model/auto-key';
import { addParam, isParametrised, removeBeatLink, removeParam, setBeatLink, setPaint, setShape, setText, setTransform } from '../model/edits';
import { propertyAt } from '../model/evaluate';
import { suggestName, textOf } from '../model/param-text';
import { findNode } from '../model/tree';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import type { VectorStore } from '../store/vector-store';
import { vectorTexts } from '../texts';
import { ALIGN_MODES, DISTRIBUTE_MODES, type AlignMode, type DistributeMode } from '../tools/align';
import { FONT_STACKS } from '../runtime/fonts';

interface NumberField {
  property: Property;
  step: number;
}

type PaintMode = 'keep' | 'none' | 'color' | 'var';
type Target = 'text' | 'fill' | 'stroke' | 'width' | 'height' | 'fontSize';
const NUMBER_TARGETS: readonly Target[] = ['width', 'height', 'fontSize'];

interface Draft {
  target: Target;
  name: string;
  description: string;
  default: string;
  /** The limits of a number parameter. */
  min: string;
  max: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The selected node's transform, opacity, fill, stroke and stroke width, with a diamond beside each animatable property that adds or removes a
 * keyframe at the playhead. A field edits through `editProperty`, so a property with keyframes is changed at the playhead and one without is
 * changed for good. With several nodes selected, a change goes to all of them and the fields show the first one's values.
 */
@Component({
  selector: 'lab-vector-properties',
  templateUrl: './properties.html',
  styleUrl: './properties.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorProperties {
  readonly store = input.required<VectorStore>();
  /** Whether the host shows the beat (a piece's) and has a loudness curve: otherwise the Beat section says links are edited but heard inside a piece. */
  readonly hasBeat = input(false);
  readonly hasLoudness = input(false);

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  protected readonly transformFields: readonly NumberField[] = [
    { property: 'x', step: 1 },
    { property: 'y', step: 1 },
    { property: 'scaleX', step: 0.05 },
    { property: 'scaleY', step: 0.05 },
    { property: 'rotate', step: 1 },
  ];
  protected readonly paints: readonly ('fill' | 'stroke')[] = ['fill', 'stroke'];
  protected readonly vars = PAINT_VARS;
  protected readonly beatKinds = BEAT_KINDS;
  /** The form that makes a property a parameter is a modal dialog, open while there is a draft. */
  private readonly paramDialog = viewChild.required<ElementRef<HTMLDialogElement>>('paramDialog');

  constructor() {
    effect(() => {
      const el = this.paramDialog().nativeElement;
      const open = !!this.draft();
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
    });
  }

  /** A click on the dim background (not on the form) closes the dialog. It returns nothing: a handler that answers `false` would cancel the click's own action (the form's submit). */
  protected backdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.draft.set(undefined);
  }

  protected readonly alignModes = ALIGN_MODES;
  /** The drawings of the align and distribute buttons (16×16, drawn with a line): the buttons are icons, their names are the tooltips. */
  protected readonly alignIcons: Record<AlignMode | `distribute-${DistributeMode}`, string> = {
    left: 'M2 2v12M4.5 4.5h9M4.5 9.5h6',
    centre: 'M8 2v12M3 4.5h10M5 9.5h6',
    right: 'M14 2v12M2.5 4.5h9M5.5 9.5h6',
    top: 'M2 2h12M4.5 4.5v9M9.5 4.5v6',
    middle: 'M2 8h12M4.5 3v10M9.5 5v6',
    bottom: 'M2 14h12M4.5 2.5v9M9.5 5.5v6',
    'distribute-horizontal': 'M2 2v12M14 2v12M6 5h4v6H6z',
    'distribute-vertical': 'M2 2h12M2 14h12M5 6h6v4H5z',
  };
  protected readonly distributeModes = DISTRIBUTE_MODES;

  protected distributeIcon(mode: DistributeMode): string {
    return this.alignIcons[`distribute-${mode}`];
  }
  protected readonly fonts: readonly string[] = ['display', 'body', ...Object.keys(FONT_STACKS)];
  protected readonly textAligns: readonly TextAlign[] = ['start', 'middle', 'end'];
  protected readonly preserves: readonly ImageNode['preserve'][] = ['contain', 'cover', 'stretch'];
  /** Align to the artboard even with several nodes selected. */
  protected readonly toArtboard = signal(false);

  protected readonly node = computed<Node | undefined>(() => this.store().selectedNodes()[0]);
  protected readonly draft = signal<Draft | undefined>(undefined);
  protected readonly isText = computed(() => {
    const n = this.node();
    return n?.kind === 'text' || (n?.kind === 'import' && n.tag === 'text');
  });
  /** The size fields the node's kind has: what the drawn kinds add to the transform. */
  protected readonly shapeFields = computed<readonly NumberField[]>(() => {
    switch (this.node()?.kind) {
      case 'rect':
        return [{ property: 'width', step: 1 }, { property: 'height', step: 1 }, { property: 'rx', step: 1 }];
      case 'ellipse':
      case 'image':
        return [{ property: 'width', step: 1 }, { property: 'height', step: 1 }];
      case 'text':
        return [{ property: 'fontSize', step: 1 }];
      default:
        return [];
    }
  });
  protected readonly textNode = computed<TextNode | undefined>(() => {
    const n = this.node();
    return n?.kind === 'text' ? n : undefined;
  });
  protected readonly imageNode = computed<ImageNode | undefined>(() => {
    const n = this.node();
    return n?.kind === 'image' ? n : undefined;
  });
  protected readonly lineNode = computed(() => {
    const n = this.node();
    return n?.kind === 'line' ? n : undefined;
  });
  /** The properties of the node that can take a beat link, with the ones that already have one. */
  protected readonly linkable = computed<readonly Property[]>(() => {
    const n = this.node();
    if (!n) return [];
    const own: Property[] = ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'opacity', 'strokeWidth', 'fill', 'stroke'];
    return [...own, ...this.shapeFields().map((f) => f.property)].filter((p) => !n.beat?.[p]);
  });
  protected readonly links = computed(() => Object.entries(this.node()?.beat ?? {}) as Array<[Property, BeatLink]>);
  protected readonly decay = PULSE_DECAY;
  protected readonly many = computed(() => this.store().selection().length > 1);
  protected readonly canAlign = computed(() => this.store().selection().length > 0);
  protected readonly canDistribute = computed(() => this.store().topmostSelection().length > 2);
  /** Whether Align goes to the artboard: with one node there is nothing else to align to. */
  protected readonly alignToArtboard = computed(() => this.toArtboard() || !this.many());
  protected readonly textParam = computed(() => this.store().doc().params.find((p) => p.target.nodeId === this.node()?.id && p.target.what === 'text'));
  protected readonly problem = computed(() => {
    const p = this.store().problem();
    return p ? this.t.problems[p.code] : undefined;
  });

  private get playhead(): number {
    return this.store().playhead();
  }

  /** Whether the selected nodes have different values of a property: the field shows "—" and a typed value goes to all of them. */
  protected mixed(property: Property): boolean {
    const nodes = this.store().selectedNodes();
    if (nodes.length < 2) return false;
    const values = nodes.map((n) => propertyAt(n, property, this.playhead));
    return values.some((v) => v !== values[0]);
  }

  protected value(property: Property): number | string {
    const n = this.node();
    if (this.mixed(property)) return '';
    const v = n ? propertyAt(n, property, this.playhead) : undefined;
    return typeof v === 'number' ? round3(v) : (v ?? '');
  }

  protected anchor(axis: 'anchorX' | 'anchorY'): number {
    return round3(this.node()?.transform[axis] ?? 0);
  }

  protected animated(property: Property): boolean {
    return (this.node()?.tracks[property]?.length ?? 0) > 0;
  }

  protected keyed(property: Property): boolean {
    const n = this.node();
    return !!n && keyframeIndexAt(n, property, this.playhead) >= 0;
  }

  protected parametrised(property: Property): boolean {
    const n = this.node();
    return !!n && isParametrised(this.store().doc(), n.id, property);
  }

  private each(fn: (doc: ReturnType<VectorStore['doc']>, id: string) => ReturnType<VectorStore['doc']>, label?: string): void {
    const ids = this.store().selection();
    this.store().apply((doc) => ids.reduce(fn, doc), label);
  }

  protected setNumber(property: Property, e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    this.each((doc, id) => editProperty(doc, id, property, this.playhead, v), `prop:${property}`);
  }

  protected setAnchor(axis: 'anchorX' | 'anchorY', e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    this.each((doc, id) => setTransform(doc, id, { [axis]: v }), `prop:${axis}`);
  }

  protected setLine(axis: 'x2' | 'y2', e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'line' ? setShape(doc, id, { [axis]: v }) : doc), `prop:${axis}`);
  }

  protected setContent(e: Event): void {
    const content = (e.target as HTMLInputElement).value;
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'text' ? setText(doc, id, { content }) : doc), 'prop:content');
  }

  protected setFont(e: Event): void {
    const font = (e.target as HTMLSelectElement).value;
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'text' ? setText(doc, id, { font }) : doc));
  }

  protected setWeight(e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    const fontWeight = Math.min(900, Math.max(100, Math.round(v / 100) * 100));
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'text' ? setText(doc, id, { fontWeight }) : doc), 'prop:weight');
  }

  protected setTextAlign(e: Event): void {
    const align = (e.target as HTMLSelectElement).value as TextAlign;
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'text' ? setText(doc, id, { align }) : doc));
  }

  protected setPreserve(e: Event): void {
    const preserve = (e.target as HTMLSelectElement).value;
    this.each((doc, id) => (findNode(doc.nodes, id)?.kind === 'image' ? setShape(doc, id, { preserve }) : doc));
  }

  // — beat —

  private isPaint(property: Property): boolean {
    return property === 'fill' || property === 'stroke';
  }

  /** What a first link of a property does: a pulse a person can see, or two colours to alternate between. */
  private startLink(property: Property): BeatLink {
    if (this.isPaint(property)) return { kind: 'alternate', values: [this.colour(property as 'fill' | 'stroke'), '#ffffff'] };
    const amounts: Partial<Record<Property, number>> = { scaleX: 0.2, scaleY: 0.2, opacity: 0.3, rotate: 10, x: 30, y: 30, strokeWidth: 2, width: 30, height: 30, rx: 5, fontSize: 10 };
    return { kind: 'pulse', amount: amounts[property] ?? 1, decay: PULSE_DECAY.default };
  }

  protected addLink(e: Event): void {
    e.preventDefault();
    const select = (e.target as HTMLFormElement).elements.namedItem('property') as HTMLSelectElement;
    const property = select.value as Property;
    if (!property) return;
    this.each((doc, id) => setBeatLink(doc, id, property, this.startLink(property)));
  }

  protected dropLink(property: Property): void {
    this.each((doc, id) => removeBeatLink(doc, id, property));
  }

  /** Changes the kind of a link, starting the new kind from a sensible value (a paint can only alternate). */
  protected setKind(property: Property, e: Event): void {
    const kind = (e.target as HTMLSelectElement).value as BeatKind;
    const link: BeatLink =
      kind === 'alternate'
        ? this.isPaint(property)
          ? { kind, values: [this.colour(property as 'fill' | 'stroke'), '#ffffff'] }
          : { kind, values: [Number(this.value(property)) || 0, (Number(this.value(property)) || 0) + 1] }
        : kind === 'loudness'
          ? { kind, amount: this.startAmount(property) }
          : { kind, amount: this.startAmount(property), decay: PULSE_DECAY.default };
    this.each((doc, id) => setBeatLink(doc, id, property, link));
  }

  private startAmount(property: Property): number {
    const s = this.startLink(property);
    return s.kind === 'pulse' ? s.amount : 1;
  }

  protected setLinkNumber(property: Property, field: 'amount' | 'decay', e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    const link = this.node()?.beat?.[property];
    if (!Number.isFinite(v) || !link || link.kind === 'alternate') return;
    const next: BeatLink = field === 'decay' && link.kind === 'pulse' ? { ...link, decay: Math.min(PULSE_DECAY.max, Math.max(PULSE_DECAY.min, v)) } : { ...link, amount: v };
    this.each((doc, id) => setBeatLink(doc, id, property, next), `beat:${property}:${field}`);
  }

  protected setLinkValue(property: Property, which: 0 | 1, e: Event): void {
    const link = this.node()?.beat?.[property];
    if (!link || link.kind !== 'alternate') return;
    const raw = (e.target as HTMLInputElement).value;
    const value = this.isPaint(property) ? raw : parseFloat(raw);
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    const values: [number | string, number | string] = [...link.values];
    values[which] = value;
    this.each((doc, id) => setBeatLink(doc, id, property, { kind: 'alternate', values }), `beat:${property}:${which}`);
  }

  protected linkColour(value: number | string): string {
    return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : '#808080';
  }

  protected hasLoudnessLink(): boolean {
    return this.links().some(([, l]) => l.kind === 'loudness');
  }

  // — align —

  protected align(mode: AlignMode): void {
    this.store().canvasActions()?.align(mode, this.alignToArtboard());
  }

  protected distribute(mode: DistributeMode): void {
    this.store().canvasActions()?.distribute(mode);
  }

  protected setToArtboard(e: Event): void {
    this.toArtboard.set((e.target as HTMLInputElement).checked);
  }

  protected toggle(property: Property): void {
    this.each((doc, id) => toggleKeyframe(doc, id, property, this.playhead));
  }

  // — paints —

  protected mode(property: 'fill' | 'stroke'): PaintMode {
    const n = this.node();
    if (!n) return 'keep';
    if (this.animated(property)) return 'color';
    return n[property]?.kind ?? 'keep';
  }

  protected colour(property: 'fill' | 'stroke'): string {
    const n = this.node();
    const v = n ? propertyAt(n, property, this.playhead) : undefined;
    return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : '#808080';
  }

  protected varOf(property: 'fill' | 'stroke'): PaintVar {
    const paint = this.node()?.[property];
    return paint?.kind === 'var' ? paint.name : 'accent';
  }

  protected setMode(property: 'fill' | 'stroke', e: Event): void {
    const mode = (e.target as HTMLSelectElement).value as PaintMode;
    const colour = this.colour(property);
    this.each((doc, id) =>
      setPaint(doc, id, property, mode === 'none' ? { kind: 'none' } : mode === 'color' ? { kind: 'color', value: colour } : mode === 'var' ? { kind: 'var', name: 'accent' } : { kind: 'keep' }),
    );
  }

  protected setColour(property: 'fill' | 'stroke', e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.each((doc, id) => editProperty(doc, id, property, this.playhead, value), `prop:${property}`);
  }

  protected setVar(property: 'fill' | 'stroke', e: Event): void {
    const name = (e.target as HTMLSelectElement).value as PaintVar;
    this.each((doc, id) => setPaint(doc, id, property, { kind: 'var', name }));
  }

  // — parameters —

  protected openParam(target: Target): void {
    const n = this.node();
    if (!n) return;
    const doc = this.store().doc();
    const number = NUMBER_TARGETS.includes(target);
    const now = number ? Number(propertyAt(n, target as Property, this.playhead) ?? 0) : 0;
    const current = target === 'text' ? textOf(doc, n.id) : number ? String(round3(now)) : this.colour(target as 'fill' | 'stroke');
    this.draft.set({
      target,
      name: suggestName(`${n.name}_${target === 'text' ? '' : target}`.replace(/_$/, ''), doc.params.map((p) => p.name)),
      description: '',
      default: current,
      min: '0',
      max: String(Math.max(100, Math.ceil(now * 4))),
    });
    this.store().problem.set(undefined);
  }

  protected isNumberDraft(d: Draft): boolean {
    return NUMBER_TARGETS.includes(d.target);
  }

  protected setDraft(field: 'name' | 'description' | 'default' | 'min' | 'max', e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.draft.update((d) => (d ? { ...d, [field]: value } : d));
  }

  protected createParam(e: Event): void {
    e.preventDefault();
    const d = this.draft();
    const n = this.node();
    if (!d || !n) return;
    const number = this.isNumberDraft(d);
    this.store().apply((doc) =>
      addParam(doc, {
        name: d.name,
        type: number ? 'number' : 'string',
        description: d.description,
        default: d.default,
        ...(d.target === 'text' ? { max_length: Math.max(40, d.default.length) } : {}),
        ...(number ? { min: Number(d.min) || 0, max: Number(d.max) || 100 } : {}),
        target: { nodeId: n.id, what: d.target },
      }),
    );
    if (!this.store().problem()) this.draft.set(undefined);
  }

  protected removeParam(property: 'fill' | 'stroke' | 'width' | 'height' | 'fontSize'): void {
    const n = this.node();
    const param = this.store().doc().params.find((p) => p.target.nodeId === n?.id && p.target.what === property);
    if (param) this.removeTextParam(param.name);
  }

  protected removeTextParam(name: string): void {
    this.store().apply((doc) => removeParam(doc, name));
  }
}
