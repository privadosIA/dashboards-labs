import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { THEME_ASSETS_MAX, THEME_ASSET_BYTES, THEME_CSS_MAX, TRANSITION_MAX, type Catalog, type Design, type Script } from '@lab/animation-core';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../../../core/language';
import { sceneTextsFor } from '../../scenes/texts';
import type { EditRequest } from '../edit';
import { CssBox } from './css-box/css-box';
import { assetNameOf, assetProblem, framePreset, hudText, thumbnailOf, withTheme, withTransition, type AssetProblem } from './theme-edit';
import en from './dynamic/hud.en.json';
import es from './dynamic/hud.es.json';

/** The words the design's server gives a refusal about the theme start with: they are shown where they belong. */
const PREFIX = { css: /^design\.theme\.css\b/, assets: /^design\.theme\.assets\b/, hud: /^design\.theme\.hud\b/, transition: /^design\.transition_seconds\b/ } as const;

/**
 * What every page of the piece shares, edited with the design: the stylesheet, the small drawings (SVG, up to 50 KB each), the four corner texts, the typefaces the server carries with their
 * licence, the crossfade between the pieces, and the Frame preset. Each change is a request for the page, which owns the document and its history.
 */
@Component({
  selector: 'app-theme-panel',
  imports: [CssBox, DynamicFormComponent],
  templateUrl: './theme-panel.html',
  styleUrl: './theme-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePanel {
  readonly design = input.required<Design>();
  readonly script = input.required<Script>();
  readonly catalog = input.required<Catalog>();
  readonly locked = input(false);
  /** Why the server refused the design, in its own words. */
  readonly refused = input('');
  readonly edit = output<EditRequest>();

  private readonly lang = inject(LanguageService).lang;
  protected readonly t = sceneTextsFor(this.lang).theme;
  protected readonly hudSchema = pickSchema('motion-edit-theme-hud', { en, es }, this.lang);
  protected readonly max = TRANSITION_MAX;
  protected readonly assetMax = THEME_ASSETS_MAX;
  protected readonly cssMax = THEME_CSS_MAX;

  protected readonly css = computed(() => this.design().theme?.css ?? '');
  protected readonly assets = computed(() => Object.entries(this.design().theme?.assets ?? {}).map(([name, svg]) => ({ name, svg, src: thumbnailOf(svg) })));
  protected readonly seconds = computed(() => this.design().transitionSeconds ?? 0);
  protected readonly fonts = computed(() =>
    Object.values(this.catalog().fontFiles ?? {}).map((f) => this.t.fontLicence(f.family, f.licence, f.weights.join(', '))),
  );
  protected readonly cssProblem = computed(() => (PREFIX.css.test(this.refused()) ? this.refused() : ''));
  protected readonly assetsProblem = computed(() => (PREFIX.assets.test(this.refused()) ? this.refused() : ''));
  protected readonly hudProblem = computed(() => (PREFIX.hud.test(this.refused()) ? this.refused() : ''));
  protected readonly transitionProblem = computed(() => (PREFIX.transition.test(this.refused()) ? this.refused() : ''));

  protected readonly hud = signal<Record<string, unknown>>({});
  /** A drawing chosen and waiting for its name. */
  protected readonly pending = signal<{ readonly name: string; readonly svg: string } | null>(null);
  protected readonly pendingSrc = computed(() => (this.pending() ? thumbnailOf(this.pending()!.svg) : ''));
  protected readonly assetError = signal('');
  protected readonly frameNote = signal('');

  constructor() {
    // The corner texts follow the design (an undo, a reload).
    effect(() => {
      const hud = this.design().theme?.hud ?? {};
      untracked(() => this.hud.set({ tl: hud.tl ?? '', tr: hud.tr ?? '', bl: hud.bl ?? '', br: hud.br ?? '' }));
    });
  }

  protected setCss(css: string): void {
    this.edit.emit({ fn: (d) => ({ ...d, design: withTheme(d.design, { css }) }), label: 'theme-css' });
  }

  protected hudChanged(model: Record<string, unknown>): void {
    const text = (k: string): string => hudText(String(model[k] ?? ''));
    const next = { tl: text('tl'), tr: text('tr'), bl: text('bl'), br: text('br') };
    const now = this.design().theme?.hud ?? {};
    if ((['tl', 'tr', 'bl', 'br'] as const).every((k) => (now[k] ?? '') === next[k])) return;
    this.edit.emit({ fn: (d) => ({ ...d, design: withTheme(d.design, { hud: next }) }), label: 'theme-hud' });
  }

  protected setTransition(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.edit.emit({ fn: (d) => ({ ...d, design: withTransition(d.design, value) }), label: 'transition' });
  }

  /** A file was chosen: its text is read and waits for a name (the file's own, in the letters the server takes). */
  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.assetError.set('');
    if (file.size > THEME_ASSET_BYTES * 4) return this.assetError.set(this.t.assetTooBig(Math.round(THEME_ASSET_BYTES / 1024)));
    const svg = await file.text();
    const problem = assetProblem('x', svg);
    if (problem === 'svg') return this.assetError.set(this.t.assetNotSvg);
    if (problem === 'size') return this.assetError.set(this.t.assetTooBig(Math.round(THEME_ASSET_BYTES / 1024)));
    this.pending.set({ name: assetNameOf(file.name), svg });
  }

  protected rename(event: Event): void {
    const pending = this.pending();
    if (pending) this.pending.set({ ...pending, name: (event.target as HTMLInputElement).value });
  }

  private assetText(problem: AssetProblem): string {
    return { name: this.t.assetName_bad, size: this.t.assetTooBig(Math.round(THEME_ASSET_BYTES / 1024)), svg: this.t.assetNotSvg, full: this.t.assetFull(THEME_ASSETS_MAX), duplicate: this.t.assetDuplicate }[problem];
  }

  protected addAsset(): void {
    const pending = this.pending();
    if (!pending) return;
    const problem = assetProblem(pending.name, pending.svg, this.design().theme?.assets ?? {});
    if (problem) return this.assetError.set(this.assetText(problem));
    this.assetError.set('');
    this.pending.set(null);
    this.edit.emit({ fn: (d) => ({ ...d, design: withTheme(d.design, { assets: { ...d.design.theme?.assets, [pending.name]: pending.svg } }) }) });
  }

  protected removeAsset(name: string): void {
    this.edit.emit({
      fn: (d) => {
        const { [name]: _gone, ...rest } = d.design.theme?.assets ?? {};
        return { ...d, design: withTheme(d.design, { assets: rest }) };
      },
    });
  }

  /** Frame preset: a layer with the HUD and another with the grain over the song, as one change that undo takes back at once. */
  protected frame(): void {
    const made = framePreset(this.script(), this.catalog());
    const note = made.result === 'added' ? this.t.framePresetDone : made.result === 'has' ? this.t.framePresetHas : (made.reason ?? '');
    this.frameNote.set(note);
    if (made.result === 'added') this.edit.emit({ fn: (d) => ({ ...d, script: framePreset(d.script, this.catalog()).script }) });
  }
}
