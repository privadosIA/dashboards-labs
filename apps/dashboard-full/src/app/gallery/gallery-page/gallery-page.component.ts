import { AutoAnimateDirective } from '@lab/motion-ui';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { ImagesManifest, KeptClip, ManifestImage, MusicManifest, MusicManifestEntry } from '../../core/api.models';
import { ShareService } from '../../core/share.service';
import { ApiService } from '../../core/api.service';
import { ModeFilterStore, PROJECT_MODES, ProjectMode, ProjectOrigin, hiddenModes, visibleProjects } from '../../core/mode-filter.store';
import { ProjectsStore } from '../../core/projects.store';
import { SimpleModeStore } from '../../core/simple-mode.store';
import { ModeSelectComponent } from '../../shared/mode-select/mode-select.component';
import { toYaml } from '../../shared/project-yaml';
import { RunStreamService } from '../../core/run-stream.service';
import { GalleryLightboxComponent } from '../gallery-lightbox/gallery-lightbox.component';
import { PhoneViewerComponent } from '../phone-viewer/phone-viewer.component';
import { PhoneService } from '../../core/phone.service';
import { ActionSheetService } from '../../shared/action-sheet/action-sheet.service';
import { SheetAction } from '../../shared/action-sheet/action-sheet.component';
import { GestureHandlers } from '../../shared/gestures/gestures';
import { GesturesDirective } from '../../shared/gestures/gestures.directive';
import { PullToRefreshDirective } from '../../shared/gestures/pull-to-refresh.directive';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { RouterLink } from '@angular/router';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { clock, lyricsDiffer } from '../../music/music-options';

/**
 * Gallery: for an images project, a manifest-driven grid of prints on the lightbox
 * (never a directory listing), grouped by scene with mono reproducibility
 * captions, plus the pin-seed and re-render actions; for a music project, the
 * songs of its manifest with a player per variant (spec image-gallery).
 */
@Component({
  selector: 'app-gallery-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutoAnimateDirective,
    PageHeaderComponent,
    EmptyStateComponent,
    RouterLink,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    ModeSelectComponent,
    AudioPlayerComponent,
    BytesPipe,
    GesturesDirective,
  ],
  templateUrl: './gallery-page.component.html',
  styleUrl: './gallery-page.component.scss',
  hostDirectives: [PullToRefreshDirective],
})
export class GalleryPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly sharer = inject(ShareService);
  private readonly dialog = inject(MatDialog);
  protected readonly phone = inject(PhoneService).phone;
  private readonly sheet = inject(ActionSheetService);
  private readonly router = inject(Router);
  private readonly streams = inject(RunStreamService);
  private readonly injector = inject(Injector);
  protected readonly projects = inject(ProjectsStore);
  protected readonly modes = inject(ModeFilterStore);

  /** The projects of the modes the user chose (and those with no mode): the selector lists only these. */
  protected readonly simpleMode = inject(SimpleModeStore);
  /** The simple version shows every mode of what Create made, whatever the saved preference says; that preference is left alone. */
  private readonly shownModes = computed<ReadonlySet<ProjectMode>>(() => (this.simpleMode.simple() ? new Set(PROJECT_MODES) : this.modes.modes()));
  private readonly shownOrigins = computed<ReadonlySet<ProjectOrigin>>(() => (this.simpleMode.simple() ? new Set<ProjectOrigin>(['mobile']) : this.modes.origins()));
  protected readonly listed = computed(() => visibleProjects(this.projects.projects(), this.shownModes(), this.shownOrigins()));
  protected readonly hidden = computed(() => hiddenModes(this.projects.projects(), this.shownModes(), this.shownOrigins()));

  protected modeLabel(mode: string): string {
    return mode === 'video' ? $localize`:@@modes.video:Video` : mode === 'images' ? $localize`:@@modes.images:Images` : $localize`:@@modes.music:Music`;
  }

  /** Optional project preselection (?project=), e.g. from a run's result link. */
  readonly project = input<string>();

  protected readonly selected = signal('');
  protected readonly manifest = signal<ImagesManifest | null>(null);
  protected readonly musicManifest = signal<MusicManifest | null>(null);
  /** Songs whose file turned out to be gone (the player failed to load them). */
  protected readonly missing = signal<ReadonlySet<string>>(new Set());
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly pinned = signal<string | null>(null);

  protected readonly scenes = computed(() => {
    const m = this.manifest();
    if (!m) return [];
    const groups = new Map<string, ManifestImage[]>();
    for (const img of m.images) {
      if (!groups.has(img.scene_id)) groups.set(img.scene_id, []);
      groups.get(img.scene_id)!.push(img);
    }
    return Array.from(groups.entries()).map(([sceneId, images]) => ({ sceneId, images }));
  });

  /** A video project shows its final video and the clip of each scene, and reads no manifest. */
  protected readonly isVideo = computed(() => this.projects.projects().find((p) => p.id === this.selected())?.mode === 'video');
  protected readonly finalVideo = signal<string | null>(null);
  protected readonly finalVideoMissing = signal(false);
  protected readonly sceneClips = signal<KeptClip[]>([]);
  protected readonly clipsMissing = signal<ReadonlySet<string>>(new Set());

  protected clipUrl(c: KeptClip): string {
    return this.api.artifactUrl(this.selected(), `out/clips/${c.scene}.mp4`);
  }

  /** A music project shows songs instead of images. */
  protected readonly isMusic = computed(() => this.projects.projects().find((p) => p.id === this.selected())?.mode === 'music');

  /** The songs of the music manifest, grouped by track. */
  protected readonly tracks = computed(() => {
    const m = this.musicManifest();
    if (!m) return [];
    const groups = new Map<string, MusicManifestEntry[]>();
    for (const e of m.tracks ?? []) {
      if (!groups.has(e.track_id)) groups.set(e.track_id, []);
      groups.get(e.track_id)!.push(e);
    }
    return Array.from(groups.entries()).map(([trackId, songs]) => ({ trackId, songs }));
  });

  protected readonly contactSheetUrl = computed(() => {
    const m = this.manifest();
    return m ? this.api.artifactUrl(this.selected(), `out/${m.project}/contact_sheet.png`) : null;
  });

  protected readonly pull = inject(PullToRefreshDirective);

  constructor() {
    // Pulling the page down from the top refreshes it, like the button.
    this.pull.refresh.subscribe(() => {
      if (this.selected() && !this.busy()) void this.reloadManifest();
    });
    // The selected project leaves the list when its mode is unchecked: the first one listed takes its place, or none.
    effect(() => {
      const listed = this.listed();
      const current = this.selected();
      if (!current || listed.some((p) => p.id === current)) return;
      untracked(() => void this.selectProject(listed[0]?.id ?? ''));
    });
  }

  async ngOnInit(): Promise<void> {
    await this.projects.load();
    const pre = this.project();
    const project = pre ? this.projects.projects().find((p) => p.id === pre) : undefined;
    if (project) {
      this.modes.add(project.mode); // asked for by address: its mode is shown even when it was hidden
      await this.selectProject(project.id);
    }
  }

  protected songUrl(e: MusicManifestEntry): string {
    return this.api.artifactUrl(this.selected(), e.file);
  }

  protected fileName(e: MusicManifestEntry): string {
    return e.file.split('/').pop() ?? e.file;
  }

  protected length(e: MusicManifestEntry): string {
    return clock(e.audio_seconds ?? e.duration_seconds);
  }

  protected isMissing(e: MusicManifestEntry): boolean {
    return this.missing().has(e.file);
  }

  protected markMissing(e: MusicManifestEntry): void {
    this.missing.update((s) => new Set(s).add(e.file));
  }

  protected differs(e: MusicManifestEntry): boolean {
    return lyricsDiffer(e.lyrics_requested, e.lyrics_sung);
  }

  protected imageUrl(img: ManifestImage): string {
    return this.api.artifactUrl(this.selected(), img.file);
  }

  protected async selectProject(id: string): Promise<void> {
    this.selected.set(id);
    this.pinned.set(null);
    await this.reloadManifest();
  }

  protected async reloadManifest(): Promise<void> {
    const id = this.selected();
    this.loaded.set(false);
    this.manifest.set(null);
    this.musicManifest.set(null);
    this.missing.set(new Set());
    this.finalVideo.set(null);
    this.finalVideoMissing.set(false);
    this.sceneClips.set([]);
    this.clipsMissing.set(new Set());
    if (!id) return;
    if (this.isVideo()) {
      await this.loadVideo(id);
      this.loaded.set(true);
      return;
    }
    const name = this.projects.projects().find((p) => p.id === id)?.name || id;
    try {
      if (this.isMusic()) {
        this.musicManifest.set(await firstValueFrom(this.api.getMusicManifest(id, name)));
      } else {
        this.manifest.set(await firstValueFrom(this.api.getManifest(id, name)));
      }
    } catch {
      this.manifest.set(null); // not produced yet: the empty state explains
      this.musicManifest.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  /** The final video and the kept clips of a video project, the clips in the order of its scenes. */
  private async loadVideo(id: string): Promise<void> {
    const [cfg, clips] = await Promise.all([
      firstValueFrom(this.api.getConfig(id)).catch(() => null),
      firstValueFrom(this.api.listKeptClips(undefined, id)).catch(() => ({ clips: [] as KeptClip[] })),
    ]);
    const file = cfg?.parsed?.output?.file;
    this.finalVideo.set(file ? this.api.artifactUrl(id, file) : null);
    const order = (cfg?.parsed?.scenes ?? []).map((s) => s.id);
    const rank = (c: KeptClip) => {
      const i = order.indexOf(c.scene);
      return i < 0 ? order.length : i;
    };
    // A kept animation is a different file of the same scene: the gallery shows the finished clips.
    this.sceneClips.set(clips.clips.filter((c) => (c.kind ?? 'clip') === 'clip').sort((a, b) => rank(a) - rank(b)));
  }

  protected clipGone(c: KeptClip): boolean {
    return this.clipsMissing().has(c.scene);
  }

  protected markClipGone(c: KeptClip): void {
    this.clipsMissing.update((s) => new Set(s).add(c.scene));
  }

  /** Nothing to show for a video project: no final video and no kept clips. */
  protected readonly videoEmpty = computed(() => this.isVideo() && this.loaded() && (this.finalVideo() === null || this.finalVideoMissing()) && this.sceneClips().length === 0);

  protected openLightbox(sceneId: string, index: number): void {
    const group = this.scenes().find((g) => g.sceneId === sceneId);
    if (!group) return;
    const data = { images: group.images, index, urlOf: (img: ManifestImage) => this.imageUrl(img) };
    if (this.phone()) {
      // A phone gets the whole screen, with swipe and zoom.
      this.dialog.open(PhoneViewerComponent, { data, panelClass: 'mo-phone-viewer', autoFocus: false, enterAnimationDuration: 0, exitAnimationDuration: 0 });
      return;
    }
    this.dialog.open(GalleryLightboxComponent, { data, maxWidth: '95vw' });
  }

  /** The actions of an image, as the rows of the bottom sheet a phone opens (the ⋮ button or a long press). */
  protected imageActions(img: ManifestImage): SheetAction[] {
    const url = this.imageUrl(img);
    const actions: SheetAction[] = [
      { icon: 'share', label: $localize`:@@gallery.share:Share`, disabled: this.sharer.busy() === url, run: () => void this.sharer.share(url) },
      { icon: 'download', label: $localize`:@@gallery.download:Download`, run: () => this.sharer.download(url, img.scene_id) },
      { icon: 'push_pin', label: $localize`:@@gallery.pinSeedShort:Pin seed ${img.effective_seed}:seed: in the scene`, disabled: this.busy(), run: () => void this.pinSeed(img) },
      { icon: 'replay', label: $localize`:@@gallery.rerender:Re-render this scene`, disabled: this.busy(), run: () => void this.rerender(img) },
    ];
    return this.withProject(actions);
  }

  /** The songs and clips offer the same two actions on a phone. */
  protected fileActions(url: string, name: string, studio = false): SheetAction[] {
    const actions: SheetAction[] = [
      { icon: 'share', label: $localize`:@@gallery.share:Share`, disabled: this.sharer.busy() === url, run: () => void this.sharer.share(url, name) },
      { icon: 'download', label: $localize`:@@gallery.download:Download`, run: () => this.sharer.download(url, name) },
    ];
    return studio ? this.withProject(actions, '/music') : actions;
  }

  /** The simple version has no editor to open the project in: the row is offered in the advanced one only. */
  private withProject(actions: SheetAction[], area = '/editor'): SheetAction[] {
    if (this.simpleMode.simple() || !this.selected()) return actions;
    const label = area === '/music' ? $localize`:@@gallery.openStudio:Open in the music studio` : $localize`:@@gallery.openProject:Open the project`;
    return [...actions, { icon: 'open_in_new', label, run: () => void this.router.navigate(['/projects', this.selected(), area.slice(1)]) }];
  }

  protected openImageSheet(img: ManifestImage): void {
    this.sheet.open(`${img.scene_id} · v${img.variant + 1}`, this.imageActions(img));
  }

  protected openFileSheet(title: string, url: string, name: string, studio = false): void {
    this.sheet.open(title, this.fileActions(url, name, studio));
  }

  private readonly pressHandlers = new WeakMap<ManifestImage, GestureHandlers>();
  private pressed = false;

  /** A long press on an image opens its actions instead of the image. */
  protected pressOf(img: ManifestImage): GestureHandlers {
    let h = this.pressHandlers.get(img);
    if (!h) {
      h = {
        longPress: () => {
          this.pressed = true;
          this.openImageSheet(img);
        },
      };
      this.pressHandlers.set(img, h);
    }
    return h;
  }

  /** The tap that ends a long press is not a request to open the image. */
  protected openImage(sceneId: string, index: number): void {
    if (this.pressed) {
      this.pressed = false;
      return;
    }
    this.openLightbox(sceneId, index);
  }

  /** Writes the variant's effective seed into its scene via the normal save flow. */
  protected async pinSeed(img: ManifestImage): Promise<void> {
    const id = this.selected();
    this.busy.set(true);
    try {
      const cfg = await firstValueFrom(this.api.getConfig(id));
      if (!cfg.parsed) return;
      const scene = cfg.parsed.scenes.find((s) => s.id === img.scene_id);
      if (!scene) return;
      scene.seed = img.effective_seed;
      await firstValueFrom(this.api.saveConfig(id, toYaml(cfg.parsed)));
      this.pinned.set(`${img.scene_id} ← seed ${img.effective_seed}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Launches an images-mode run restricted to the scene; refreshes on finish. */
  protected async rerender(img: ManifestImage): Promise<void> {
    const id = this.selected();
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.api.launchRun(id, { only: img.scene_id, mode: 'images', keep_tmp: true }),
      );
      const stream = this.streams.connect(res.run.id);
      const watcher = effect(
        () => {
          if (stream.ended()) {
            watcher.destroy();
            this.busy.set(false);
            void this.reloadManifest();
          }
        },
        { injector: this.injector },
      );
    } catch (err) {
      this.busy.set(false);
      throw err;
    }
  }
}
