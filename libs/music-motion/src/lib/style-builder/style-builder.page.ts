import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { catchError, forkJoin, of, switchMap, take } from 'rxjs';

import { LocalStyles, type LocalStyle } from '../animation/local-styles';
import type { Catalog, Preset, PresetInput, Reference } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { injectLink } from '../core/links';
import { textsFor } from '../core/texts';
import { failureText } from '../shared/failure-text';
import { fromModel, toModel } from '../presets/preset-model';
import { withPresetCatalog } from '../presets/with-preset-catalog';
import presetEn from '../presets/dynamic/preset.en.json';
import presetEs from '../presets/dynamic/preset.es.json';
import keepEn from './dynamic/keep.en.json';
import keepEs from './dynamic/keep.es.json';
import { PartPicker } from './part-picker/part-picker';
import { withPickerSlot } from './with-picker-slot';

type FormModel = Record<string, unknown>;

/** What a style starts as when it is made from scratch: the usual colours and the catalog's first typeface, no parts yet. */
export function blankStyle(catalog: Catalog | null): Preset {
  const font = catalog?.fonts[0] ?? 'Inter';
  return { id: '', name: '', createdAt: 0, design: { dark: '#14101b', light: '#e9e2d6', accent: '#6e58db', display: font, body: font, defaultMode: 'dark', modes: {}, concept: '' }, rhythm: 6, parts: [], adjustments: [] };
}

const asPreset = (s: LocalStyle): Preset => ({ id: s.id, name: s.name, createdAt: s.createdAt, design: s.design, rhythm: s.rhythm, parts: [...s.parts], adjustments: [] });

/**
 * Makes a style from scratch, or edits one kept in the browser: the design and rhythm in the same form as a style of the server, and the
 * parts picked from the catalog. It is kept in the browser unless a ready reference is chosen to start it from, in which case it is saved on the
 * server (and, if it was kept here, the copy here is removed once the server has it).
 */
@Component({
  selector: 'app-style-builder-page',
  imports: [DynamicFormComponent, DfSlotDirective, RouterLink, PartPicker],
  templateUrl: './style-builder.page.html',
  styleUrl: './style-builder.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleBuilderPage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly local = inject(LocalStyles);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly destroyed = inject(DestroyRef);
  protected readonly link = injectLink();
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.styleBuilder;
  protected readonly common = this.texts;
  private readonly presetBase = pickSchema('preset', { en: presetEn, es: presetEs }, this.lang);
  private readonly keepBase = pickSchema('keep', { en: keepEn, es: keepEs }, this.lang);

  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly ready = signal<readonly Reference[]>([]);
  /** The style being edited, when it is one kept in the browser. */
  protected readonly editing = signal<LocalStyle | null>(null);
  protected readonly schema = computed(() => withPickerSlot(withPresetCatalog(this.presetBase, this.catalog(), this.texts)));
  protected readonly keepSchema = computed(() => ({
    ...this.keepBase,
    fields: this.keepBase.fields.map((f) => ('key' in f && f.key === 'keep' ? { ...f, options: [{ value: 'browser', label: this.t.keepBrowser }, ...this.ready().map((r) => ({ value: r.id, label: this.t.keepServer(r.title) }))] } : f)),
  }));
  protected readonly model = signal<FormModel>({});
  protected readonly keepModel = signal<FormModel>({ keep: 'browser' });
  protected readonly parts = signal<readonly string[]>([]);
  protected readonly valid = signal(false);
  protected readonly working = signal(false);
  protected readonly refused = signal('');
  protected readonly durable = this.local.durable;
  /** The reference the style would start from on the server; `browser` keeps it here. */
  protected readonly keep = computed(() => String(this.keepModel()['keep'] ?? 'browser'));
  private base: Preset = blankStyle(null);

  ngOnInit(): void {
    forkJoin({ catalog: this.port.catalog(), references: this.port.references().pipe(take(1), catchError(() => of([] as readonly Reference[]))) })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: ({ catalog, references }) => {
          this.catalog.set(catalog);
          this.ready.set(references.filter((r) => r.state === 'ready'));
          const own = this.id ? this.local.styles().find((s) => s.id === this.id) : undefined;
          if (this.id && !own) return this.state.set('missing');
          this.editing.set(own ?? null);
          this.base = own ? asPreset(own) : blankStyle(catalog);
          this.model.set(toModel(this.base));
          this.parts.set([...this.base.parts]);
          this.state.set('ready');
        },
        error: (e) => {
          this.refused.set(failureText(e, this.texts));
          this.state.set('missing');
        },
      });
  }

  /** What the form and the picker hold, as the style to save. */
  private input(): PresetInput {
    return fromModel({ ...this.model(), parts: [...this.parts()] }, this.base);
  }

  protected save(): void {
    if (this.working() || !this.valid() || this.state() !== 'ready') return;
    const input = this.input();
    const keep = this.keep();
    this.refused.set('');
    if (keep === 'browser') {
      const own = this.editing();
      if (own) this.local.update(own.id, { ...input, ...(own.reference ? { reference: own.reference } : {}) });
      else if (!this.local.add(input)) return void this.refused.set(this.t.refused);
      return void this.router.navigate([this.link('presets')]);
    }
    this.working.set(true);
    this.port
      .makePreset(keep, input.name)
      .pipe(
        switchMap((made) => this.port.savePreset(made.id, input)),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe({
        next: () => {
          // The copy kept here goes only once the server has the style.
          const own = this.editing();
          if (own) this.local.remove(own.id);
          this.working.set(false);
          void this.router.navigate([this.link('presets')]);
        },
        error: (e) => {
          this.working.set(false);
          this.refused.set(`${this.t.refused} ${failureText(e, this.texts)}`);
        },
      });
  }
}
