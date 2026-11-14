import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewContainerRef, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { EnginesStore } from '../../core/engines.store';
import { EnvironmentStore } from '../../core/environment.store';
import { MixDialogComponent, MixDialogData } from '../mix/mix-dialog.component';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { PhaseStripComponent } from '../../runs/phase-strip/phase-strip.component';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { BUDGETS, imageEntryFor, machineOf } from '../../editor/auto-plan';
import { chosenModelEntry } from '../../editor/quality-tiers';
import { ModelsStore } from '../../core/models.store';
import { MusicAssistStore } from '../music-assist.store';
import { MusicAutoPlan, describeMusicPlan, durationText, planMusicAuto } from '../music-auto-plan';
import { MusicStore } from '../music.store';
import { adapterOptions, currentTier, languageModels, modelOptions, MUSIC_TIERS, MusicTierId, selectedModel, synthesisModels, tierSettings, VOCAL_STYLES } from '../music-options';
import { StyleTemplatesComponent } from '../style-templates/style-templates.component';
import { TrackFormComponent } from '../track-form/track-form.component';
import { TrackResultsComponent } from '../track-results/track-results.component';

/**
 * The music studio: the create view of a music project. Tracks are cards
 * (style, lyrics, metadata, variants) stacked over the songs they produced;
 * "Crear" runs the project — or one track — and the run's phases appear live
 * above them. A project that is not a music project is sent to the scene
 * editor, which is where its scenes live.
 */
@Component({
  selector: 'app-music-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    PanelComponent,
    EmptyStateComponent,
    PhaseStripComponent,
    AudioPlayerComponent,
    TrackFormComponent,
    StyleTemplatesComponent,
    TrackResultsComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
  ],
  providers: [MusicStore],
  templateUrl: './music-page.component.html',
  styleUrl: './music-page.component.scss',
})
export class MusicPageComponent implements OnInit {
  readonly id = input.required<string>();

  protected readonly store = inject(MusicStore);
  protected readonly env = inject(EnvironmentStore);
  private readonly models = inject(ModelsStore);
  protected readonly engines = inject(EnginesStore);
  /** The project makes its songs with HeartMuLa. */
  protected readonly heart = computed(() => this.store.settings().generator === 'heartmula');
  /** The project makes its songs with DiffRhythm2. */
  protected readonly dr2 = computed(() => this.store.settings().generator === 'diffrhythm2');
  /** Either generator that runs as a service: ACE-Step's own options do not apply. */
  protected readonly service = computed(() => this.heart() || this.dr2());
  /** The generator of the project is up in a container that is stopped (or starting): no song can be made until it is up. */
  protected readonly containerStopped = computed(
    () => (this.heart() && this.engines.heartmulaStopped()) || (this.dr2() && this.engines.diffrhythm2Stopped()),
  );
  /** The tracks DiffRhythm2 cannot make (Spanish lyrics, instrumental, tasks, a reference), by id, to say which. */
  protected readonly dr2Unmakeable = computed(() =>
    this.dr2()
      ? this.store
          .tracks()
          .filter((t) => t.task || t.reference || t.instrumental || (t.vocal_language && t.vocal_language !== 'en'))
          .map((t) => t.id)
      : [],
  );
  protected setGenerator(g: 'ace-step' | 'heartmula' | 'diffrhythm2'): void {
    this.store.updateSettings({ generator: g === 'ace-step' ? undefined : g });
  }
  protected readonly vocalStyles = VOCAL_STYLES;

  /** The quality levels, each with whether the model it needs is installed. */
  protected readonly tiers = computed(() =>
    MUSIC_TIERS.map((t) => ({ ...t, installed: this.files().some((f) => f.name === t.model) })),
  );
  /** The level the settings amount to; '' when they are a custom mix. */
  protected readonly tierValue = computed(() => currentTier(this.store.settings()) ?? '');
  protected setTier(id: MusicTierId): void {
    this.store.updateSettings(tierSettings(id));
  }
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly assist = inject(MusicAssistStore);
  private readonly vcr = inject(ViewContainerRef);

  /** Tracks whose card is open. Adding one closes the others; moving or removing keeps each card's state. */
  protected readonly openTracks = signal<ReadonlySet<number>>(new Set());

  constructor() {
    // A request in flight belongs to the studio: leaving it cancels the request and drops its result.
    inject(DestroyRef).onDestroy(() => this.assist.reset());
  }

  private readonly files = computed(() => this.env.report()?.music ?? []);

  // --- I'm lazy: the plan for what is installed, this machine and the time the user gives ---------
  protected readonly budgets = BUDGETS;
  protected readonly budgetIndex = signal(0);
  protected readonly machine = computed(() => machineOf(this.env.gpus(), this.env.ram()));
  /** The image model that would make the covers: the project's own, or the best installed one that fits this machine. */
  protected readonly coverEntry = computed(() => {
    const cfg = this.store.config();
    if (!cfg) return null;
    const catalog = this.models.catalog();
    return chosenModelEntry(cfg, catalog) ?? imageEntryFor(cfg, catalog, this.machine());
  });
  /** Easy mode makes a cover for every song (default), when an image model can. */
  protected readonly autoCover = signal(true);
  protected readonly autoPlan = computed<MusicAutoPlan | null>(() => {
    const cfg = this.store.config();
    if (!cfg || cfg.tracks?.length === 0) return null;
    return planMusicAuto(cfg, this.files(), this.machine(), this.budgets[this.budgetIndex()] ?? null, this.autoCover() ? this.coverEntry() : null);
  });
  /** Writes the plan and creates the songs right away (the studio saves first and shows the run live). */
  protected async applyAndCreate(plan: MusicAutoPlan): Promise<void> {
    this.store.applyAuto(plan);
    await this.store.launch();
  }

  /** The select's value for the loudness setting: '' (untouched), or the level as text. */
  protected readonly loudnessValue = computed(() => {
    const v = this.store.settings().loudness_lufs;
    return v === undefined ? '' : String(v);
  });

  protected setCover(mode: 'auto' | 'off'): void {
    this.store.setCover(mode, this.coverEntry());
  }
  protected readonly hasImageModel = computed(() => {
    const d = this.store.config()?.defaults;
    return !!(d?.model || d?.model_set) || this.coverEntry() !== null;
  });
  protected readonly autoLines = computed(() => {
    const p = this.autoPlan();
    return p ? describeMusicPlan(p) : [];
  });
  protected readonly autoTime = (seconds: number): string => durationText(seconds);
  protected budgetLabel(seconds: number | null): string {
    if (seconds === null) return $localize`:@@auto.budgetAny:Whatever it takes (the best quality)`;
    const min = Math.round(seconds / 60);
    if (min < 60) return $localize`:@@auto.budgetMin:${min}:min: minutes`;
    const h = Math.round(min / 60);
    return h === 1 ? $localize`:@@auto.budgetHour:1 hour` : h >= 8 ? $localize`:@@auto.budgetNight:${h}:h: hours (all night)` : $localize`:@@auto.budgetHours:${h}:h: hours`;
  }
  private readonly lmInstalled = computed(() => languageModels(this.files()));
  private readonly synthInstalled = computed(() => synthesisModels(this.files()));

  protected readonly lmOptions = computed(() => modelOptions(this.lmInstalled(), this.store.settings().lm_model));
  protected readonly synthOptions = computed(() => modelOptions(this.synthInstalled(), this.store.settings().synth_model));
  protected readonly lmValue = computed(() => selectedModel(this.lmInstalled(), this.store.settings().lm_model));
  protected readonly synthValue = computed(() => selectedModel(this.synthInstalled(), this.store.settings().synth_model));

  /** Installed adapters (LoRAs), and the project's default among the options. */
  protected readonly adapterChoices = computed(() => adapterOptions(this.env.musicAdapters(), this.store.settings().adapter));
  /** The selectors show only when there is something to choose (or a name to keep visible). */
  protected readonly showAdapters = computed(() => this.adapterChoices().length > 0);

  /** Selected GPU indexes as the select needs them. */
  protected readonly gpuPicked = computed(() => this.store.gpu().split(',').filter((g) => g !== ''));

  /** Server rejections that name no track (a missing model, scenes left in the file). */
  protected readonly projectErrors = computed(() => this.store.serverErrors().filter((e) => e.trackId === null));

  protected readonly state = computed(() => this.store.stream()?.state()?.state ?? this.store.activeRun()?.state ?? 'queued');

  async ngOnInit(): Promise<void> {
    void this.env.ensureLoaded();
    void this.models.refresh();
    void this.engines.refresh();
    await this.store.load(this.id());
    this.resetOpen();
    if (this.store.config() && !this.store.isMusic()) {
      await this.router.navigate(['/projects', this.id(), 'editor'], { replaceUrl: true });
    }
  }

  protected async save(): Promise<void> {
    await this.store.save();
  }

  protected async discard(): Promise<void> {
    await this.store.load(this.id());
    this.resetOpen();
  }

  /** A single track opens by itself; with several, every card starts closed. */
  private resetOpen(): void {
    this.openTracks.set(this.store.tracks().length === 1 ? new Set([0]) : new Set());
  }

  protected setOpen(index: number, open: boolean): void {
    const next = new Set(this.openTracks());
    if (open) next.add(index);
    else next.delete(index);
    this.openTracks.set(next);
  }

  /** Adds a track and opens it, closing the others so the new one is what is in front. */
  protected addTrack(): void {
    this.store.addTrack();
    this.openTracks.set(new Set([this.store.tracks().length - 1]));
  }

  /** Opens the card of a track that was added from a song (its index), the only one open. */
  protected showTrack(index: number): void {
    this.openTracks.set(new Set([index]));
  }

  protected moveTrack(from: number, to: number): void {
    this.store.moveTrack(from, to);
    const open = this.openTracks();
    const next = new Set(open);
    next.delete(from);
    next.delete(to);
    if (open.has(from)) next.add(to);
    if (open.has(to)) next.add(from);
    this.openTracks.set(next);
  }

  /** The first words of a track's style, for its closed card. */
  protected excerpt(text: string | undefined): string {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }

  /** A closed card still shows that something in it needs attention. */
  protected trackInvalid(index: number): boolean {
    return Object.values(this.store.validation().tracks[index] ?? {}).some(Boolean);
  }

  protected openMix(index: number): void {
    // Anchored by its top-left corner, so that resizing from the opposite corner grows it under the pointer.
    const width = Math.min(1200, Math.round(window.innerWidth * 0.96));
    const left = Math.round((window.innerWidth - width) / 2);
    const top = Math.round(window.innerHeight * 0.06);
    this.dialog.open<MixDialogComponent, MixDialogData>(MixDialogComponent, {
      data: { index },
      viewContainerRef: this.vcr, // the dialog sees this page's MusicStore
      panelClass: 'mo-resizable-dialog',
      backdropClass: 'mo-dialog-backdrop',
      width: `${width}px`,
      height: 'min(82vh, 860px)',
      maxWidth: '100vw', // resizing is limited by the screen, not by this
      maxHeight: '100vh',
      position: { top: `${top}px`, left: `${left}px` },
      autoFocus: false,
    });
  }

  /** The mix whose rendered song plays under its row, and the one being renamed (by id: positions move). */
  protected readonly listening = signal<string | null>(null);
  protected readonly renaming = signal<string | null>(null);

  /** The rendered song of a mix, if the last run produced it and it is still on disk. */
  protected mixSong(id: string): { url: string; seconds: number } | null {
    const r = this.store.mixResult(id);
    if (!r || this.store.missing().has(r.file)) return null;
    return { url: this.api.artifactUrl(this.store.projectId(), r.file), seconds: r.audio_seconds };
  }

  protected toggleListen(id: string): void {
    this.listening.set(this.listening() === id ? null : id);
  }

  protected finishRename(index: number, value: string): void {
    const id = value.trim();
    this.renaming.set(null);
    if (id && id !== this.store.mixes()[index]?.id) {
      this.listening.set(null);
      this.store.renameMix(index, id);
    }
  }

  protected duplicateMix(index: number): void {
    this.store.duplicateMix(index);
  }

  protected async removeMix(index: number): Promise<void> {
    const mix = this.store.mixes()[index];
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@mix.removeTitle:Remove the mix`,
        message: $localize`:@@mix.removeMessage:“${mix.id}:mix:” will be removed from the project on save. The file it already exported is not deleted.`,
        confirmLabel: $localize`:@@mix.removeAction:Remove mix`,
        destructive: true,
      }),
    );
    if (ok) {
      if (this.listening() === mix.id) this.listening.set(null);
      this.store.removeMix(index);
    }
  }

  /** Only the tracks with a favorite song are listed. */
  protected readonly onlyFavorites = signal(false);
  /** The songs on disk that are marked, and how many tracks have one. */
  protected readonly favoriteTotal = computed(() => this.store.results().filter((e) => this.store.isFavorite(e)).length);
  protected readonly favoriteTracks = computed(() => new Set(this.store.results().filter((e) => this.store.isFavorite(e)).map((e) => e.track_id)).size);

  /** Tracks ticked to become a mix (by id: positions move). */
  protected readonly emptyPick: ReadonlySet<string> = new Set();
  protected readonly picked = signal<ReadonlySet<string>>(this.emptyPick);

  protected togglePick(id: string): void {
    const next = new Set(this.picked());
    if (!next.delete(id)) next.add(id);
    this.picked.set(next);
  }

  /** A mix with the ticked tracks, in the order of the list, and the mixer opened on it. */
  protected mixPicked(): void {
    const ids = this.store.tracks().map((t) => t.id).filter((id) => this.picked().has(id));
    if (ids.length === 0) return;
    const index = this.store.mixFromTracks(ids);
    this.picked.set(this.emptyPick);
    this.openMix(index);
  }

  protected addMix(): void {
    this.store.addMix();
    this.openMix(this.store.mixes().length - 1);
  }

  protected setGpu(picked: string[]): void {
    this.store.gpu.set(picked.map(Number).filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b).join(','));
  }

  protected setNumber(field: 'inference_steps' | 'adapter_scale', raw: string): void {
    const text = raw.trim();
    const value = text === '' ? undefined : Number(text);
    this.store.updateSettings({ [field]: value === undefined || Number.isNaN(value) ? undefined : value });
  }

  protected async cancel(): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@music.cancelTitle:Cancel creation`,
        message: $localize`:@@music.cancelMessage:The engine processes will be stopped. What is already in the cache is kept.`,
        confirmLabel: $localize`:@@music.cancelAction:Cancel`,
        destructive: true,
      }),
    );
    if (ok) await this.store.cancel();
  }

  protected async removeTrack(index: number): Promise<void> {
    const track = this.store.tracks()[index];
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@music.removeTitle:Remove the track`,
        message: $localize`:@@music.removeMessage:“${track.id}:track:” will be removed from the project on save. The files it already exported are not deleted.`,
        confirmLabel: $localize`:@@music.removeAction:Remove track`,
        destructive: true,
      }),
    );
    if (ok) {
      this.store.removeTrack(index);
      if (this.picked().has(track.id)) this.togglePick(track.id);
      this.openTracks.set(new Set([...this.openTracks()].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))));
    }
  }

  /** "1 pista" / "3 pistas". */
  protected tracksLabel(n: number): string {
    return n === 1 ? $localize`:@@music.oneTrack:1 track` : $localize`:@@music.manyTracks:${n}:count: tracks`;
  }

  protected pickedLabel(n: number): string {
    return n === 1 ? $localize`:@@music.onePicked:1 track chosen` : $localize`:@@music.manyPicked:${n}:count: tracks chosen`;
  }
}
