import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DfCellDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom, map } from 'rxjs';

import { ImportResult, ProjectConfig, ProjectSummary, Scene } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { toYaml } from '../../shared/project-yaml';
import { easyConfigForNewProject, machineOf } from '../../editor/auto-plan';
import { applyEditEntry, applyStyleEntry, applyTier, loadOverrides, pickEditEntry, pickStyleEntry } from '../../editor/quality-tiers';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { schemaFor } from '../../shared/dynamic/schema-loader';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { StorageDialogComponent, StorageDialogData } from '../storage-dialog/storage-dialog.component';
import { ImportWizardComponent } from '../import-wizard/import-wizard.component';
import { PackageImportComponent, PackageImportResult } from '../package-import/package-import.component';
import {
  ProjectNameDialogComponent,
  NewProjectChoice,
  ProjectNameDialogData,
} from '../project-name-dialog/project-name-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { AvailabilityStore } from '../../core/availability.store';
import { PROJECT_MODES, ProjectMode, ModeFilterStore, hiddenModes, visibleProjects } from '../../core/mode-filter.store';
import { SimpleModeStore } from '../../core/simple-mode.store';
import { ModeSelectComponent } from '../../shared/mode-select/mode-select.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import tablesEn from './dynamic/tables.en.json';
import tablesEs from './dynamic/tables.es.json';
import { openSectionWindow } from '../../shell/open-section';
import { SectionLinksService } from '../../shell/section-links.service';

/**
 * The projects list IS the home (design plan: no KPI dashboard). Listing,
 * creation, duplication, deletion and the import wizard entry point.
 */
@Component({
  selector: 'app-projects-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ModeSelectComponent,
    PageHeaderComponent, AutoAnimateDirective, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, DynamicFormComponent, DfCellDirective, BytesPipe, RouterLink],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss',
})
export class ProjectsListComponent implements OnInit {
  protected readonly store = inject(ProjectsStore);
  protected readonly modes = inject(ModeFilterStore);

  protected readonly simple = inject(SimpleModeStore);
  private readonly route = inject(ActivatedRoute);

  /**
   * The one mode the address asks to show on its own (`?mode=music`, from the "Music projects" entry of the navigation); any other value is
   * ignored. It does not touch the modes the user chose: it only decides what this list shows while it lasts.
   */
  protected readonly only = toSignal(
    this.route.queryParamMap.pipe(
      map((q) => {
        const mode = q.get('mode');
        return PROJECT_MODES.includes(mode as ProjectMode) ? (mode as ProjectMode) : null;
      }),
    ),
    { initialValue: null },
  );
  /** The modes this list shows: the one the address asks for, or else the ones the user chose. */
  private readonly shown = computed<ReadonlySet<ProjectMode>>(() => {
    const only = this.only();
    return only ? new Set<ProjectMode>([only]) : this.modes.modes();
  });

  /** The projects of the modes shown (and those with no mode). */
  protected readonly visible = computed(() => visibleProjects(this.store.projects(), this.shown(), this.modes.origins()));
  /** The modes with projects that are not shown. */
  protected readonly hidden = computed(() => hiddenModes(this.store.projects(), this.shown(), this.modes.origins()));

  protected modeLabel(mode: string): string {
    return mode === 'video' ? $localize`:@@modes.video:Video` : mode === 'images' ? $localize`:@@modes.images:Images` : $localize`:@@modes.music:Music`;
  }
  /** Goes back to the modes the user chose: the address stops asking for one. */
  protected clearOnly(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mode: null }, queryParamsHandling: 'merge' });
  }

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);
  protected readonly availability = inject(AvailabilityStore);

  /** The projects table: columns and paging live in `dynamic/tables.<lang>.json`. */
  protected readonly tables = schemaFor({ es: tablesEs, en: tablesEn });
  protected readonly tableModel = computed(() => ({
    projects: this.visible().map((p) => ({ ...p, count: this.countOf(p), sizeBytes: this.sizeOf(p) })),
  }));

  /** What each project takes on disk, and the free space of the disk that holds them (unknown until loaded). */
  protected readonly sizes = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly freeBytes = signal<number | null>(null);
  /** The disk is below the warning threshold. */
  protected readonly diskLow = signal(false);
  /** Where the server keeps the projects, when it has a media directory (its disk is the one that counts). */
  protected readonly mediaDir = signal<string | null>(null);

  /** What the mode selector held the last time it was looked at: a change in it is the user choosing, which ends a mode asked for by the address. */
  private chosen = this.modes.modes();

  /** A section opens in a tab of its own that keeps its opener, so that it can close itself (see `openSectionWindow`). */
  protected readonly openSection = openSectionWindow;

  /** Which section buttons the deployment shows (`sections` of its config.json). */
  protected readonly links = inject(SectionLinksService);

  constructor() {
    effect(() => {
      const now = this.modes.modes();
      if (now === this.chosen) return;
      this.chosen = now;
      if (this.only()) this.clearOnly();
    });
  }

  ngOnInit(): void {
    void this.store.load();
    void this.loadSizes();
  }

  private async loadSizes(): Promise<void> {
    try {
      const s = await firstValueFrom(this.api.getStorage());
      this.sizes.set(new Map(s.projects.map((p) => [p.id, p.total_bytes])));
      // With a media directory the projects live on its disk, not on the server's own.
      const disk = s.media?.disk ?? s.disk;
      this.freeBytes.set(disk.free_bytes ?? null);
      this.diskLow.set(disk.low === true);
      this.mediaDir.set(s.media?.dir ?? null);
    } catch {
      // the sizes are a convenience: the list works without them
    }
  }

  protected sizeOf(p: ProjectSummary): number | null {
    return this.sizes().get(p.id) ?? null;
  }

  protected openStorage(p: ProjectSummary): void {
    this.dialog
      .open<StorageDialogComponent, StorageDialogData>(StorageDialogComponent, {
        data: { projectId: p.id, freeBytes: this.freeBytes() ?? undefined, mediaDir: this.mediaDir() ?? undefined },
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(() => void this.loadSizes());
  }

  protected async createProject(): Promise<void> {
    const choice: NewProjectChoice = {};
    const id = await firstValueFrom(
      this.dialog
        .open<ProjectNameDialogComponent, ProjectNameDialogData, string>(
          ProjectNameDialogComponent,
          {
            data: {
              title: $localize`:@@projects.createTitle:New project`,
              confirmLabel: $localize`:@@projects.createAction:Create project`,
              choice,
            },
          },
        )
        .afterClosed(),
    );
    if (id) {
      await this.store.create(id);
      // Style and quality are applied before the editor opens; if that fails the
      // project exists with the server's defaults and the editor says so.
      let notice: string | undefined;
      if (choice.style || choice.tier || choice.auto || choice.adult !== undefined) {
        notice = (await this.applyChoice(id, choice)) ? undefined : 'choice-not-applied';
      }
      const target = ['/projects', id, 'editor'];
      if (notice) await this.router.navigate(target, { state: { notice } });
      else await this.router.navigate(target);
    }
  }

  /** Writes the chosen style and quality into the new project's configuration. */
  private async applyChoice(id: string, choice: NewProjectChoice): Promise<boolean> {
    try {
      const [res, catalog] = await Promise.all([
        firstValueFrom(this.api.getConfig(id)),
        firstValueFrom(this.api.getCatalog()),
      ]);
      let cfg = res.parsed;
      if (!cfg) return false;
      if (choice.auto) {
        const env = await firstValueFrom(this.api.getEnvironment());
        const planned = easyConfigForNewProject(cfg, catalog.entries, machineOf(env.gpus, env.ram));
        if (!planned) return false;
        await firstValueFrom(this.api.saveConfig(id, toYaml(choice.adult === undefined ? planned : { ...planned, adult: choice.adult })));
        return true;
      }
      if (choice.style === 'edit') {
        const entry = pickEditEntry(catalog.entries, choice.editEngine);
        if (!entry) return false;
        cfg = applyEditEntry(cfg, entry);
      } else if (choice.style) {
        const entry = pickStyleEntry(catalog.entries, choice.style);
        if (!entry) return false;
        cfg = applyStyleEntry(cfg, entry);
      }
      if (choice.tier) cfg = applyTier(cfg, choice.tier, catalog.entries, loadOverrides()).config;
      if (choice.adult !== undefined) cfg = { ...cfg, adult: choice.adult };
      await firstValueFrom(this.api.saveConfig(id, toYaml(cfg)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A project that makes songs. The server creates every project as a video
   * starter, so this switches it to music right away; if the server refuses
   * (the music models are not installed yet) the half-made project is removed
   * again and the server's explanation reaches the user.
   */
  protected async createMusicProject(): Promise<void> {
    const id = await firstValueFrom(
      this.dialog
        .open<ProjectNameDialogComponent, ProjectNameDialogData, string>(
          ProjectNameDialogComponent,
          {
            data: {
              title: $localize`:@@projects.createMusicTitle:New music project`,
              confirmLabel: $localize`:@@projects.createMusicAction:Create music project`,
            },
          },
        )
        .afterClosed(),
    );
    if (!id) return;
    await this.store.create(id);
    try {
      await firstValueFrom(this.api.saveConfig(id, musicStarterYaml(id)));
    } catch (err) {
      await this.store.remove(id);
      throw err;
    }
    await this.store.load();
    await this.router.navigate(['/projects', id, 'music']);
  }

  /**
   * A video made only of motion graphics: three animated pages (a title, a list, the credits) to
   * start from. The server creates every project as a video starter, so this swaps its scenes and
   * joins them with a short fade; if the server refuses (no Chrome or Chromium to draw them) the
   * half-made project is removed again and the server's explanation reaches the user.
   */
  protected async createMotionProject(): Promise<void> {
    const id = await firstValueFrom(
      this.dialog
        .open<ProjectNameDialogComponent, ProjectNameDialogData, string>(
          ProjectNameDialogComponent,
          {
            data: {
              title: $localize`:@@projects.createMotionTitle:New motion graphics project`,
              confirmLabel: $localize`:@@projects.createMotionAction:Create project`,
            },
          },
        )
        .afterClosed(),
    );
    if (!id) return;
    await this.store.create(id);
    try {
      const res = await firstValueFrom(this.api.getConfig(id));
      if (!res.parsed) throw new Error('the new project has no configuration');
      await firstValueFrom(this.api.saveConfig(id, toYaml(motionStarterConfig(res.parsed))));
    } catch (err) {
      await this.store.remove(id);
      throw err;
    }
    await this.store.load();
    await this.router.navigate(['/projects', id, 'editor']);
  }

  /** Where "edit" leads: the music studio for a music project, the scene editor otherwise. */
  protected editLink(p: ProjectSummary): string[] {
    return ['/projects', p.id, p.mode === 'music' ? 'music' : 'editor'];
  }

  protected countOf(p: ProjectSummary): number {
    return p.mode === 'music' ? (p.track_count ?? 0) : p.scene_count;
  }

  protected async duplicateProject(p: ProjectSummary): Promise<void> {
    const id = await firstValueFrom(
      this.dialog
        .open<ProjectNameDialogComponent, ProjectNameDialogData, string>(
          ProjectNameDialogComponent,
          {
            data: {
              title: $localize`:@@projects.duplicateTitle:Duplicate “${p.id}:source:”`,
              confirmLabel: $localize`:@@projects.duplicateAction:Duplicate project`,
              initial: `${p.id}-copia`,
            },
          },
        )
        .afterClosed(),
    );
    if (id) {
      await this.store.duplicate(p.id, id);
    }
  }

  /**
   * Downloads the project: as a dataset (the scenes or songs, in the format the import reads, to run it
   * in another installation) or as a package (scenes.yaml and its sources). The dataset cannot carry
   * everything, and the answer says what stayed out.
   */
  protected async exportProject(p: ProjectSummary, format: 'dataset' | 'zip'): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.exportProject(p.id, format));
      const blob = res.body;
      if (!blob) return;
      const name = format === 'zip' ? `${p.id}.zip` : `${p.id}.dataset.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      let notes: string[] = [];
      try {
        notes = JSON.parse(decodeURIComponent(res.headers.get('X-Export-Notes') ?? '[]')) as string[];
      } catch {
        notes = [];
      }
      const count = res.headers.get('X-Export-Count');
      const head = format === 'zip' ? $localize`:@@projects.exported:Exported “${name}:file:” with all its settings and the recipe of what it uses (RECIPE.md)` : $localize`:@@projects.exportedCount:Exported “${name}:file:” (${count}:count: entries, scenes only: to take the settings and the models too, export the full project)`;
      this.snack.open(notes.length > 0 ? `${head}. ${notes.join(' · ')}` : head, $localize`:@@projects.exportClose:Close`, { duration: notes.length > 0 ? 20000 : 6000 });
    } catch (err) {
      const e = err as { error?: Blob; message?: string };
      let message = e.message ?? '';
      if (e.error instanceof Blob) {
        try {
          message = (JSON.parse(await e.error.text()) as { error?: { message?: string } }).error?.message ?? message;
        } catch {
          // keep the generic message
        }
      }
      this.snack.open($localize`:@@projects.exportFailed:Could not export: ${message}:reason:`, $localize`:@@projects.exportClose:Close`, { duration: 10000 });
    }
  }

  protected async deleteProject(p: ProjectSummary): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@projects.deleteTitle:Delete “${p.id}:project:”`,
        message: $localize`:@@projects.deleteMessage:The project “${p.id}:project:” will be deleted with its scenes.yaml and its tmp/ (cache and intermediates) and out/ (results and the clips kept for each scene) folders. This cannot be undone.`,
        confirmLabel: $localize`:@@projects.deleteAction:Delete project`,
        destructive: true,
      }),
    );
    if (ok) {
      await this.store.remove(p.id);
    }
  }

  protected async openPackageImport(): Promise<void> {
    const created = await firstValueFrom(
      this.dialog
        .open<PackageImportComponent, void, PackageImportResult>(PackageImportComponent, {
          width: '820px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (created) {
      await this.store.load();
      await this.router.navigate(['/projects', created.id, created.mode === 'music' ? 'music' : 'editor']);
    }
  }

  protected async openImport(): Promise<void> {
    const created = await firstValueFrom(
      this.dialog
        .open<ImportWizardComponent, void, ImportResult>(ImportWizardComponent, {
          width: '720px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (created) {
      await this.store.load();
      // Songs are written in the studio, not in the scene editor.
      await this.router.navigate(['/projects', created.id, created.mode === 'music' ? 'music' : 'editor']);
    }
  }
}

/** scenes.yaml of a new music project: one track to start from, nothing else. */
export function musicStarterYaml(id: string): string {
  return `project: ${id}
output:
  mode: music
tracks:
  - id: ${$localize`:@@music.starterId:track_1`}
    prompt: ${$localize`:@@music.starterPrompt:Pop ballad with piano and a warm voice`}
`;
}

/**
 * The starter scenes of a project made of motion graphics: silent pages of a few seconds each, joined
 * with a fade, that the model writes the first time a run needs them. Everything else of the project
 * (models, voice, size) stays as the server created it.
 */
export function motionStarterConfig(base: ProjectConfig): ProjectConfig {
  const scene = (id: string, motion_graphic: string, silence_seconds: number): Scene => ({
    id, motion_graphic, silence_seconds, prompt: '', negative_prompt: '', tts_text: '', speed: 1, lora: '',
  });
  return {
    ...base,
    defaults: { ...base.defaults, resolution: '1280x720', fps: 30, transition_seconds: 0.4 },
    scenes: [
      scene(
        $localize`:@@motion.starterTitleId:title`,
        $localize`:@@motion.starterTitle:A big title in the center, “My video”, with a thin golden line under it that draws from left to right, on a dark blue background`,
        4,
      ),
      scene(
        $localize`:@@motion.starterListId:ideas`,
        $localize`:@@motion.starterList:Three ideas that appear one by one with a soft animation, each with a big number on the left, on the same dark blue background`,
        7,
      ),
      scene(
        $localize`:@@motion.starterCreditsId:closing`,
        $localize`:@@motion.starterCredits:Closing credits that rise slowly: “Thanks for watching”, and below it the author's name, on the same dark blue background`,
        4,
      ),
    ],
  };
}
