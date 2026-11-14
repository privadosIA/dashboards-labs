import { AutoAnimateDirective } from '@lab/motion-ui';
import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import {
  ApiErrorBody,
  AssetKind,
  CatalogEntry,
  CivitaiFile,
  CivitaiResolve,
  DownloadRecord,
  DownloadRequest,
  DownloadState,
  TokenService,
} from '../../core/api.models';
import { catalogCommercialNote, catalogDescription, catalogName } from '../../core/catalog-text';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { ModelsStore } from '../../core/models.store';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { MiddleEllipsisPipe } from '../../shared/pipes/middle-ellipsis.pipe';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

type SourceMode = 'url' | 'hf' | 'civitai';

interface ModelGroup {
  id: 'image' | 'edit' | 'lora' | 'video' | 'music' | 'voice';
  label: string;
  kinds: AssetKind[];
  /** The catalog kinds listed in the tab. */
  catalogKinds: AssetKind[];
  /** The tab lists the retouch models (catalog entries flagged `edit`) and their files; the image tab leaves them out. */
  edit?: boolean;
  defaultKind: AssetKind;
  note: string;
}

/** civitai.com and its subdomains (the server's own strict rule); look-alikes do not match. */
export function isCivitaiUrl(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return host === 'civitai.com' || host.endsWith('.civitai.com');
  } catch {
    return false;
  }
}

/** Kind a Civitai file type is installed as; unknown types keep the user's choice. */
export function kindForCivitaiType(type?: string): AssetKind | null {
  switch ((type ?? '').toLowerCase()) {
    case 'model':
    case 'checkpoint':
    case 'diffusion model':
    case 'vae':
    case 'textencoder':
    case 'text encoder':
      return 'model';
    case 'lora':
    case 'locon':
      return 'lora';
    default:
      return null;
  }
}

const URL_PATTERN = /^https?:\/\/\S+$/i;
const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Pattern check on the trimmed value (submit() trims before sending). */
function trimmedPattern(re: RegExp) {
  return (c: AbstractControl): ValidationErrors | null =>
    !c.value || re.test(String(c.value).trim()) ? null : { pattern: true };
}

/**
 * "Modelos": what is installed (per kind), one-click install from the
 * built-in catalog, a custom download by URL or Hugging Face repo+file,
 * and the live download list. All policy (names, extensions, network
 * targets) is the server's; this only collects input and shows progress.
 */
@Component({
  selector: 'app-models-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutoAnimateDirective,
    PageHeaderComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    NgTemplateOutlet,
    BytesPipe,
    MiddleEllipsisPipe,
  ],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.scss',
})
export class ModelsPageComponent implements OnInit {
  /** The catalog's name and description in the UI language. */
  protected readonly text = { name: catalogName, description: catalogDescription, commercialNote: catalogCommercialNote };

  protected readonly store = inject(ModelsStore);
  protected readonly env = inject(EnvironmentStore);
  private readonly dialog = inject(MatDialog);
  private readonly api = inject(ApiService);

  // The guide starts folded and remembers when it is opened
  // (a per-browser convenience: if storage is unreadable it is simply folded).
  private static readonly GUIDE_KEY = 'mo.models.guide';
  protected readonly guideOpen = signal(ModelsPageComponent.readGuide());

  private static readGuide(): boolean {
    try {
      return localStorage.getItem(ModelsPageComponent.GUIDE_KEY) === 'open';
    } catch {
      return false;
    }
  }

  protected onGuideToggle(ev: Event): void {
    const open = (ev.target as HTMLDetailsElement).open;
    this.guideOpen.set(open);
    try {
      localStorage.setItem(ModelsPageComponent.GUIDE_KEY, open ? 'open' : 'closed');
    } catch {
      // storage unavailable: nothing to remember
    }
  }

  // The installed list and the recommended catalog fold too, each remembered on its own. They start
  // folded: the page opens short, and what the user opened is remembered.
  private static readonly SECTION_KEYS = { installed: 'mo.models.installed', catalog: 'mo.models.catalog' } as const;
  protected readonly installedOpen = signal(ModelsPageComponent.readSection('installed'));
  protected readonly catalogOpen = signal(ModelsPageComponent.readSection('catalog'));

  private static readSection(section: 'installed' | 'catalog'): boolean {
    try {
      return localStorage.getItem(ModelsPageComponent.SECTION_KEYS[section]) === 'open';
    } catch {
      return false;
    }
  }

  protected onSectionToggle(section: 'installed' | 'catalog', ev: Event): void {
    const open = (ev.target as HTMLDetailsElement).open;
    (section === 'installed' ? this.installedOpen : this.catalogOpen).set(open);
    try {
      localStorage.setItem(ModelsPageComponent.SECTION_KEYS[section], open ? 'open' : 'closed');
    } catch {
      // storage unavailable: nothing to remember
    }
  }

  /** How many files are installed in a group, for the header of its folded list. */
  protected installedCount(g: ModelGroup): number {
    return this.kindsOf(g).reduce((n, k) => n + k.assets.length, 0);
  }

  /** Services whose key fields the user opened although the key is configured. */
  protected readonly openKeys = signal<ReadonlySet<TokenService>>(new Set());

  protected toggleKey(svc: TokenService): void {
    this.openKeys.update((s) => {
      const next = new Set(s);
      if (next.has(svc)) next.delete(svc);
      else next.add(svc);
      return next;
    });
  }

  /** Where a configured key comes from, in a few words (the full note is in the expanded view). */
  protected keySourceText(svc: TokenService): string {
    return this.env.tokenSources()[svc] === 'env'
      ? $localize`:@@models.keys.srcEnv:from the environment variable ${this.envVar[svc]}:var:`
      : $localize`:@@models.keys.srcFile:saved on the server`;
  }

  /** The services that can need an account key, in the order they are shown. */
  protected get services(): readonly TokenService[] {
    return this.env.isPublic() ? ['huggingface'] : ['huggingface', 'civitai'];
  }
  protected readonly serviceLabel: Record<TokenService, string> = {
    huggingface: 'Hugging Face',
    civitai: 'Civitai',
  };
  protected readonly howTo: Record<TokenService, string> = {
    huggingface: $localize`:@@models.keys.howHf:Create a read token (Settings → Access Tokens), accept the model license on huggingface.co and paste it below.`,
    civitai: $localize`:@@models.keys.howCivitai:Create an API key on civitai.com (Account settings → API Keys) and paste it below.`,
  };
  /** The environment variable each service also reads (it wins over a saved key). */
  protected readonly envVar: Record<TokenService, string> = {
    huggingface: 'HF_TOKEN',
    civitai: 'CIVITAI_TOKEN',
  };

  /** One masked field per service: the typed key lives only here and is emptied after saving. */
  protected readonly keyControls: Record<TokenService, FormControl<string>> = {
    huggingface: new FormControl('', { nonNullable: true }),
    civitai: new FormControl('', { nonNullable: true }),
  };
  protected readonly keyBusy = signal<Record<TokenService, boolean>>({ huggingface: false, civitai: false });
  protected readonly keyError = signal<Record<TokenService, string | null>>({ huggingface: null, civitai: null });

  /** Catalog file names that are support pieces (text encoder, VAE), not checkpoints. */
  protected readonly supportFiles = computed(() => {
    const names = new Set<string>();
    for (const e of this.store.catalog()) {
      for (const f of e.files) {
        if (f.role === 'text_encoder' || f.role === 'clip_l' || f.role === 't5xxl' || f.role === 'llm' || f.role === 'llm_vision' || f.role === 'vae') names.add(f.name);
      }
    }
    return names;
  });

  protected readonly kindLabels: Record<AssetKind, string> = {
    model: $localize`:@@models.kind.model:Models`,
    voice: $localize`:@@models.kind.voice:Voices`,
    lora: $localize`:@@models.kind.lora:LoRAs`,
    video: $localize`:@@models.kind.video:Video models`,
    music: $localize`:@@models.kind.music:Music models`,
    adapter: $localize`:@@models.kind.adapter:Adapters (LoRA)`,
    heartmula: $localize`:@@models.kind.heartmula:HeartMuLa (optional generator)`,
    diffrhythm2: $localize`:@@models.kind.diffrhythm2:DiffRhythm2 (optional generator)`,
    transcription: $localize`:@@models.kind.transcription:Lyrics reader (Whisper)`,
  };
  protected readonly kindSingular: Record<AssetKind, string> = {
    model: $localize`:@@models.kindOne.model:Model`,
    voice: $localize`:@@models.kindOne.voice:Voice`,
    lora: $localize`:@@models.kindOne.lora:LoRA`,
    video: $localize`:@@models.kindOne.video:Video model`,
    music: $localize`:@@models.kindOne.music:Music model`,
    adapter: $localize`:@@models.kindOne.adapter:Adapter (LoRA)`,
    heartmula: $localize`:@@models.kindOne.heartmula:HeartMuLa weights`,
    diffrhythm2: $localize`:@@models.kindOne.diffrhythm2:DiffRhythm2 weights`,
    transcription: $localize`:@@models.kindOne.transcription:Whisper model`,
  };
  protected readonly stateLabels: Record<DownloadState, string> = {
    queued: $localize`:@@models.state.queued:queued`,
    running: $localize`:@@models.state.running:downloading`,
    succeeded: $localize`:@@models.state.succeeded:completed`,
    failed: $localize`:@@models.state.failed:failed`,
    cancelled: $localize`:@@models.state.cancelled:cancelled`,
  };

  /**
   * The two tabs. Image checkpoints serve both pipeline modes (video mode
   * renders one image per scene with the same model); voices only matter
   * for video narration. LoRAs live with the image models.
   */
  protected readonly groups: ModelGroup[] = [
    {
      id: 'image',
      label: $localize`:@@models.tab.image:Image`,
      kinds: ['model'],
      catalogKinds: ['model'],
      defaultKind: 'model',
      note: $localize`:@@models.tab.imageNote:These models work the same in video mode and in image mode: video generates one image per scene with the same model.`,
    },
    {
      id: 'edit',
      label: $localize`:@@models.tab.edit:Retouch`,
      kinds: ['model'],
      catalogKinds: ['model'],
      edit: true,
      defaultKind: 'model',
      note: $localize`:@@models.tab.editNote:Retouch models change a picture you give them from an instruction ("put a red cap on him"). There are two engines: Fast (FLUX.1 Kontext, about 40 s, non-commercial licence) and Precise (Qwen-Image-Edit, about 2 min, commercial use allowed). Each is several files installed together from the catalog; they are not downloaded one by one.`,
    },
    {
      id: 'lora',
      label: $localize`:@@models.tab.lora:LoRA`,
      kinds: ['lora'],
      catalogKinds: ['lora'],
      defaultKind: 'lora',
      note: $localize`:@@models.tab.loraNote:LoRAs tweak the style or subject of an image model.`,
    },
    {
      id: 'video',
      label: $localize`:@@models.tab.video:Video`,
      kinds: ['video'],
      catalogKinds: ['video'],
      defaultKind: 'video',
      note: $localize`:@@models.tab.videoNote:Video models animate an image (or start from text) to create clips with real motion. Each model is several files — the model, a text encoder and a VAE — installed together.`,
    },
    {
      id: 'music',
      label: $localize`:@@models.tab.music:Music`,
      kinds: ['music', 'adapter', 'heartmula', 'diffrhythm2', 'transcription'],
      catalogKinds: ['music', 'adapter', 'heartmula', 'diffrhythm2', 'transcription'],
      defaultKind: 'music',
      note: $localize`:@@models.tab.musicNote:Music models create full songs from a style and, if you want, your lyrics. Each package is four files — language model, text encoder, synthesis model and VAE — installed together; the last three are shared between packages. The engine is also required (bash scripts/build-acestep.sh). Adapters (LoRA) change the sound of all songs without changing the model: they are installed here and chosen in the studio; an adapter is a file or a folder with two files.`,
    },
    {
      id: 'voice',
      label: $localize`:@@models.tab.voice:Voice`,
      kinds: ['voice'],
      catalogKinds: ['voice'],
      defaultKind: 'voice',
      note: $localize`:@@models.tab.voiceNote:Voices are only used in video mode (narration). Image mode does not need them.`,
    },
  ];
  protected readonly tab = signal(0);

  /** Server message for the last rejected custom download (input is kept). */
  protected readonly formError = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /** The URL typed in the form is on civitai.com (its URLs carry no file name). */
  protected readonly civitaiUrl = signal(false);

  /** Civitai mode: what the last search found, the chosen file and the search state. */
  protected readonly civitaiResult = signal<CivitaiResolve | null>(null);
  protected readonly civitaiFileId = signal<number | null>(null);
  protected readonly civitaiSearching = signal(false);
  protected readonly civitaiError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    kind: new FormControl<AssetKind>('model', { nonNullable: true, validators: [Validators.required] }),
    source: new FormControl<SourceMode>('url', { nonNullable: true }),
    ref: new FormControl('', { nonNullable: true, validators: [this.whenMode('civitai', Validators.required), this.whenMode('civitai', trimmedPattern(URL_PATTERN))] }),
    url: new FormControl('', { nonNullable: true, validators: [this.whenMode('url', Validators.required), this.whenMode('url', trimmedPattern(URL_PATTERN))] }),
    repo: new FormControl('', { nonNullable: true, validators: [this.whenMode('hf', Validators.required), this.whenMode('hf', trimmedPattern(REPO_PATTERN))] }),
    file: new FormControl('', { nonNullable: true, validators: [this.whenMode('hf', Validators.required)] }),
    revision: new FormControl('', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [this.civitaiNeedsName()] }),
  });

  ngOnInit(): void {
    this.form.controls.source.valueChanges.subscribe(() => {
      for (const c of [this.form.controls.url, this.form.controls.ref, this.form.controls.repo, this.form.controls.file]) {
        c.updateValueAndValidity();
      }
      this.syncCivitai();
    });
    this.form.controls.url.valueChanges.subscribe(() => this.syncCivitai());
    // A different reference invalidates what was found for the previous one.
    this.form.controls.ref.valueChanges.subscribe(() => this.clearCivitaiResult());
    void this.store.refresh();
    this.refreshKeys();
  }

  /** Recomputes the Civitai hint and re-validates the name, which a Civitai URL makes mandatory. */
  private syncCivitai(): void {
    const v = this.form.getRawValue();
    this.civitaiUrl.set(v.source === 'url' && isCivitaiUrl(v.url));
    this.form.controls.name.updateValueAndValidity();
  }

  /** Civitai URLs carry no file name (the server answers 422 without one): require it here. */
  private civitaiNeedsName() {
    return (c: AbstractControl): ValidationErrors | null => {
      const parent = c.parent;
      if (parent?.get('source')?.value === 'civitai') return String(c.value ?? '').trim() ? null : { required: true };
      if (!parent || parent.get('source')?.value !== 'url') return null;
      return isCivitaiUrl(String(parent.get('url')?.value ?? '')) && !String(c.value ?? '').trim()
        ? { required: true }
        : null;
    };
  }

  private clearCivitaiResult(): void {
    this.civitaiResult.set(null);
    this.civitaiFileId.set(null);
    this.civitaiError.set(null);
    this.form.patchValue({ name: '' });
  }

  protected async searchCivitai(): Promise<void> {
    this.form.controls.ref.markAsTouched();
    if (this.form.controls.ref.invalid) return;
    this.clearCivitaiResult();
    this.civitaiSearching.set(true);
    try {
      const res = await firstValueFrom(this.api.resolveCivitai(this.form.controls.ref.value.trim()));
      this.civitaiResult.set(res);
      if (res.files.length === 1) this.chooseCivitaiFile(res.files[0]);
    } catch (err) {
      const body = err instanceof HttpErrorResponse ? (err.error as ApiErrorBody | undefined) : undefined;
      this.civitaiError.set(body?.error?.message ?? $localize`:@@models.civitai.searchFailed:Could not query Civitai.`);
    } finally {
      this.civitaiSearching.set(false);
    }
  }

  /** Picking a file fills its name and the kind Civitai's file type maps to. */
  protected chooseCivitaiFile(f: CivitaiFile): void {
    this.civitaiFileId.set(f.id);
    const kind = kindForCivitaiType(f.type);
    this.form.patchValue({ name: f.name, ...(kind ? { kind } : {}) });
  }

  protected fileById(r: CivitaiResolve, id: number): CivitaiFile {
    return r.files.find((f) => f.id === id) as CivitaiFile;
  }

  protected civitaiFileDetail(f: CivitaiFile): string {
    return [f.type, f.fp, f.format].filter(Boolean).join(' · ');
  }

  private setKey<T>(sig: { update(f: (v: Record<TokenService, T>) => Record<TokenService, T>): void }, svc: TokenService, v: T): void {
    sig.update((m) => ({ ...m, [svc]: v }));
  }

  private keyFailure(err: unknown): string {
    const body = err instanceof HttpErrorResponse ? (err.error as ApiErrorBody | undefined) : undefined;
    return body?.error?.message ?? $localize`:@@models.keys.failed:Could not complete the operation with the key.`;
  }

  protected async saveKey(svc: TokenService): Promise<void> {
    const key = this.keyControls[svc].value.trim();
    if (!key || this.keyBusy()[svc]) return;
    this.setKey(this.keyError, svc, null);
    this.setKey(this.keyBusy, svc, true);
    try {
      await firstValueFrom(this.api.saveToken(svc, key));
      this.keyControls[svc].reset('');
      this.refreshKeys();
    } catch (err) {
      // Keep what was typed; the server's reason shows next to the field.
      this.setKey(this.keyError, svc, this.keyFailure(err));
    } finally {
      this.setKey(this.keyBusy, svc, false);
    }
  }

  protected async removeKey(svc: TokenService): Promise<void> {
    const label = this.serviceLabel[svc];
    const shared =
      svc === 'huggingface'
        ? ' ' + $localize`:@@models.keys.removeShared:Other Hugging Face tools use the same file and will also lose it.`
        : '';
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@models.keys.removeTitle:Remove the ${label}:service: key`,
        message: $localize`:@@models.keys.removeMessage:The key saved on the server will be deleted; ${label}:service: downloads that need it will stop working until you save another one.` + shared,
        confirmLabel: $localize`:@@models.keys.removeAction:Remove key`,
        destructive: true,
      }),
    );
    if (!ok) return;
    this.setKey(this.keyError, svc, null);
    this.setKey(this.keyBusy, svc, true);
    try {
      await firstValueFrom(this.api.removeToken(svc));
      this.refreshKeys();
    } catch (err) {
      this.setKey(this.keyError, svc, this.keyFailure(err));
    } finally {
      this.setKey(this.keyBusy, svc, false);
    }
  }

  private refreshKeys(): void {
    // The key status is informative: a failed report must not break the screen.
    void this.env.refresh().catch(() => undefined);
  }

  /** Applies a validator only while the form is in the given source mode. */
  private whenMode(mode: SourceMode, v: (c: AbstractControl) => ValidationErrors | null) {
    return (c: AbstractControl): ValidationErrors | null =>
      c.parent?.get('source')?.value === mode ? v(c) : null;
  }

  protected selectTab(index: number): void {
    this.tab.set(index);
    this.form.patchValue({ kind: this.groups[index].defaultKind });
  }

  protected kindName(k: AssetKind): string {
    return this.kindSingular[k];
  }

  /** The files that belong to retouch models only: not shared with an image model, so they are listed in the Retoque tab. */
  protected readonly editFiles = computed(() => {
    const mine = new Set<string>();
    const others = new Set<string>();
    for (const e of this.store.catalog()) for (const f of e.files) (e.edit ? mine : others).add(f.name);
    return new Set([...mine].filter((n) => !others.has(n)));
  });

  protected kindsOf(g: ModelGroup) {
    const edit = this.editFiles();
    return this.store
      .kinds()
      .filter((k) => g.kinds.includes(k.kind))
      .map((k) => (k.kind === 'model' ? { ...k, assets: k.assets.filter((a) => edit.has(a.name) === !!g.edit) } : k));
  }

  protected catalogOf(g: ModelGroup): CatalogEntry[] {
    return this.store.catalog().filter((e) => g.catalogKinds.includes(e.kind) && (g.id === 'edit' || g.id === 'image' ? !!e.edit === !!g.edit : true));
  }

  /** "3 archivos: modelo · codificador de texto · VAE" for multi-file bundles with roles. */
  protected bundleLabel(e: CatalogEntry): string | null {
    const roles = e.files.map((f) => f.role).filter((r): r is string => !!r);
    if (e.files.length < 2 || roles.length === 0) return null;
    const names: Record<string, string> = {
      model: $localize`:@@models.role.model:model`,
      high_noise_model: $localize`:@@models.role.highNoise:high-noise expert`,
      lm: $localize`:@@models.role.lm:language model`,
      dit: $localize`:@@models.role.dit:synthesis model`,
      text_encoder: $localize`:@@models.role.textEncoder:text encoder`,
      vae: $localize`:@@models.role.vae:VAE`,
      clip_l: $localize`:@@models.role.clipL:CLIP-L encoder`,
      t5xxl: $localize`:@@models.role.t5xxl:T5-XXL encoder`,
      llm: $localize`:@@models.role.llm:text model`,
      llm_vision: $localize`:@@models.role.llmVision:vision projector`,
      audio_vae: $localize`:@@models.role.audioVae:audio VAE`,
      connectors: $localize`:@@models.role.connectors:embeddings connectors`,
    };
    const list = roles.map((r) => names[r] ?? r).join(' · ');
    const n = e.files.length;
    return $localize`:@@models.bundle:${n}:n: files: ${list}:list:`;
  }

  /** The commercial-use label of an entry: "Uso comercial: sí / con condiciones / no / sin confirmar". */
  protected commercialLabel(e: CatalogEntry): string | null {
    switch (e.commercial) {
      case 'yes':
        return $localize`:@@models.commercial.yes:Commercial use: yes`;
      case 'conditions':
        return $localize`:@@models.commercial.conditions:Commercial use: with conditions`;
      case 'no':
        return $localize`:@@models.commercial.no:Commercial use: no`;
      case 'unknown':
        return $localize`:@@models.commercial.unknown:Commercial use: not confirmed`;
      default:
        return null;
    }
  }

  /** "≈ 4 GB de VRAM" — an estimate, labeled as such. */
  protected vramLabel(e: CatalogEntry): string | null {
    if (!e.vram_mb) return null;
    const gb = Math.round(e.vram_mb / 1024);
    return $localize`:@@models.vram:VRAM approx. ${gb}:gb: GB`;
  }

  /** "Necesita 64 GB de RAM" — a hard requirement of the bundle, shown as a warning. */
  protected ramLabel(e: CatalogEntry): string | null {
    if (!e.min_ram_gb) return null;
    const gb = e.min_ram_gb;
    return $localize`:@@models.minRam:Needs ${gb}:gb: GB of system RAM`;
  }

  protected refresh(): void {
    void this.store.refresh();
    this.refreshKeys();
  }

  /** The entry's recommended settings, e.g. "8 pasos · cfg 1 · 1024x576"; empty when it declares none. */
  protected presetLabel(e: CatalogEntry): string {
    const p = e.preset;
    if (!p) return '';
    const parts: string[] = [];
    if (p.steps !== undefined) parts.push($localize`:@@models.presetSteps:${p.steps}:steps: steps`);
    if (p.cfg_scale !== undefined) parts.push(`cfg ${p.cfg_scale}`);
    if (p.resolution) parts.push(p.resolution);
    return parts.join(' · ');
  }

  /** The key a catalog entry needs and whether the server has it (null: unknown or not needed). */
  protected requiresKey(e: CatalogEntry): { service: TokenService; text: string; configured: boolean | null } | null {
    const svc = e.requires_token as TokenService | undefined;
    if (!svc || !this.services.includes(svc)) return null;
    const label = this.serviceLabel[svc];
    const t = this.env.tokens();
    const configured = t ? t[svc] : null;
    const text =
      configured === true
        ? $localize`:@@models.requires.ok:Needs a ${label}:service: key: configured on the server`
        : $localize`:@@models.requires.missing:Needs a ${label}:service: key and it is not configured`;
    return { service: svc, text, configured };
  }

  /** "Civitai needs your key (…) and its URLs carry no file name": shown for a civitai.com URL. */
  protected civitaiHint(): string {
    const t = this.env.tokens();
    const state = t?.civitai
      ? $localize`:@@models.civitai.keyOk:your key is configured`
      : $localize`:@@models.civitai.keyMissing:no key configured yet`;
    return $localize`:@@models.civitai.hint:Civitai requires an account key (${state}:state:) and its download URLs do not include a file name: type one below, for example model.safetensors.`;
  }

  /** Shown in Civitai mode: the key note, with whether a key is configured. */
  protected civitaiKeyNote(): string {
    const t = this.env.tokens();
    const state = t?.civitai
      ? $localize`:@@models.civitai.keyOk:your key is configured`
      : $localize`:@@models.civitai.keyMissing:no key configured yet`;
    return $localize`:@@models.civitai.modeNote:Civitai requires an account key to download (${state}:state:). Searching does not need it.`;
  }

  protected isSupportFile(name: string): boolean {
    return this.supportFiles().has(name);
  }

  protected deleteLabel(name: string): string {
    return $localize`:@@models.deleteLabel:Delete ${name}:name:`;
  }

  protected isActive(d: DownloadRecord): boolean {
    return d.state === 'queued' || d.state === 'running';
  }

  /** 0–100 when the total size is known, null → indeterminate. */
  protected percent(d: DownloadRecord): number | null {
    return d.total && d.total > 0 ? Math.min(100, Math.round((d.bytes / d.total) * 100)) : null;
  }

  protected async install(e: CatalogEntry): Promise<void> {
    try {
      await this.store.start({ id: e.id });
    } catch {
      // the error interceptor already told the user what failed
    }
  }

  protected async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.controls.source.value === 'civitai' && !this.civitaiFileId()) {
      this.form.controls.ref.markAsTouched();
      this.formError.set(
        this.civitaiResult()
          ? $localize`:@@models.civitai.pickFile:Pick one of the files in the list.`
          : $localize`:@@models.civitai.searchFirst:Search for the model first: paste its URL and click Search.`,
      );
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const req: DownloadRequest = { kind: v.kind };
    if (v.source === 'civitai') {
      const file = this.civitaiResult()?.files.find((f) => f.id === this.civitaiFileId());
      if (!file) return;
      req.url = file.download_url;
    } else if (v.source === 'url') {
      req.url = v.url.trim();
    } else {
      req.repo = v.repo.trim();
      req.file = v.file.trim();
      if (v.revision.trim()) req.revision = v.revision.trim();
    }
    if (v.name.trim()) req.name = v.name.trim();

    this.submitting.set(true);
    try {
      await this.store.start(req);
      this.form.patchValue({ url: '', ref: '', repo: '', file: '', revision: '', name: '' });
      this.form.markAsUntouched();
    } catch (err) {
      // Keep every field; show the server's reason next to the form.
      const body = err instanceof HttpErrorResponse ? (err.error as ApiErrorBody | undefined) : undefined;
      this.formError.set(body?.error?.message ?? $localize`:@@models.form.failed:Could not start the download.`);
    } finally {
      this.submitting.set(false);
    }
  }

  protected async cancel(d: DownloadRecord): Promise<void> {
    try {
      await this.store.cancel(d.id);
    } catch {
      // surfaced by the interceptor (e.g. already finished)
    }
  }

  protected async remove(kind: AssetKind, name: string): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@models.deleteTitle:Delete ${name}:name:`,
        message: $localize`:@@models.deleteMessage:The file “${name}:name:” will be removed from disk. Projects that use it will stop running until you pick another one.`,
        confirmLabel: $localize`:@@models.deleteAction:Delete file`,
        destructive: true,
      }),
    );
    if (!ok) return;
    try {
      await this.store.remove(kind, name);
    } catch {
      // A refusal (e.g. a run is active) is shown by the interceptor with
      // the server's reason; the asset stays listed.
    }
  }
}
