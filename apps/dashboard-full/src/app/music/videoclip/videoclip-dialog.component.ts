import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { MusicManifestEntry, Scene, VideoclipPlan } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { ModelsStore } from '../../core/models.store';
import { AutoPlan, BUDGETS, describePlan, durationText, machineOf, planAuto } from '../../editor/auto-plan';
import { selectableVoices } from '../../editor/asset-options';
import { toYaml } from '../../shared/project-yaml';
import { PROJECT_ID_PATTERN } from '../../projects/project-name-dialog/project-name-dialog.component';
import { isChorusSection, songSourceName, suggestVideoclipId, videoclipConfig } from './videoclip-config';
import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';
import { AvailabilityStore } from '../../core/availability.store';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';

export interface VideoclipDialogData {
  projectId: string;
  entry: MusicManifestEntry;
}

/** What the dialog answers: the project it created and whether to start generating it. */
export interface VideoclipResult {
  id: string;
  run: string | null;
}

/**
 * The music video of a song: it asks how long the user will wait and how long each shot lasts, has the server cut the
 * song into shots (with the assistant writing the pictures when asked), lets Easy mode choose the models for that
 * time, and creates the video project with the song as its soundtrack, ready to generate.
 */
@Component({
  selector: 'app-videoclip-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModelNoticeComponent,
    ProviderBadgeComponent,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './videoclip-dialog.component.html',
  styleUrl: './videoclip-dialog.component.scss',
})
export class VideoclipDialogComponent {
  protected readonly data = inject<VideoclipDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<VideoclipDialogComponent, VideoclipResult>);
  private readonly api = inject(ApiService);
  private readonly env = inject(EnvironmentStore);
  private readonly models = inject(ModelsStore);

  /** The length of the song in whole seconds. */
  protected readonly length = Math.round(this.data.entry.audio_seconds ?? this.data.entry.duration_seconds ?? 0);
  protected readonly seconds = (n: number): number => Math.round(n);
  protected readonly shotChoices = [4, 6, 8, 10];
  protected readonly shotSeconds = signal(6);
  protected readonly useAi = signal(true);
  private readonly availability = inject(AvailabilityStore);
  /** The assistant can run now; otherwise the plan is made from the style and the lyrics, with no error. */
  protected readonly aiAvailable = computed(() => this.availability.available('assistant'));
  /** Which shots move: none, only those of the chorus, or all of them. */
  protected readonly animateMode = signal<'none' | 'chorus' | 'all'>('none');
  protected readonly budgets = BUDGETS;
  protected readonly budgetIndex = signal(0);

  protected readonly projectId = new FormControl(suggestVideoclipId(this.data.projectId, this.data.entry.track_id), {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(PROJECT_ID_PATTERN)],
  });

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly plan = signal<VideoclipPlan | null>(null);
  protected readonly machine = computed(() => machineOf(this.env.gpus(), this.env.ram()));

  /** What Easy mode chooses for the shots and the time to wait; recomputed when either changes. */
  protected readonly autoPlan = computed<AutoPlan | null>(() => {
    const p = this.plan();
    if (!p) return null;
    const voice = selectableVoices(this.env.voices().map((v) => v.name))[0];
    const cfg = videoclipConfig(p, this.projectId.value || 'videoclip', voice ? `voices/${voice}` : '', songSourceName(p.audio_file));
    const mode = this.animateMode();
    const chorus = new Set(p.shots.filter((sh) => isChorusSection(sh.section)).map((sh) => sh.id));
    const animate = mode === 'all' ? true : mode === 'chorus' ? (s: Scene) => chorus.has(s.id) : false;
    return planAuto(cfg, this.models.catalog(), this.machine(), this.budgets[this.budgetIndex()] ?? null, animate);
  });
  protected readonly lines = computed(() => {
    const a = this.autoPlan();
    return a ? describePlan(a) : [];
  });
  /** The plan has shots of a chorus, so animating only those makes sense. */
  protected readonly hasChorus = computed(() => !!this.plan()?.shots.some((sh) => isChorusSection(sh.section)));
  protected readonly timeText = (seconds: number): string => durationText(seconds);

  constructor() {
    void this.models.refresh();
    void this.env.ensureLoaded();
  }

  protected budgetLabel(seconds: number | null): string {
    if (seconds === null) return $localize`:@@auto.budgetAny:Whatever it takes (the best quality)`;
    const min = Math.round(seconds / 60);
    if (min < 60) return $localize`:@@auto.budgetMin:${min}:min: minutes`;
    const h = Math.round(min / 60);
    return h === 1 ? $localize`:@@auto.budgetHour:1 hour` : h >= 8 ? $localize`:@@auto.budgetNight:${h}:h: hours (all night)` : $localize`:@@auto.budgetHours:${h}:h: hours`;
  }

  protected async prepare(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.plan.set(null);
    try {
      this.plan.set(
        await firstValueFrom(
          this.api.videoclipPlan(this.data.projectId, {
            track_id: this.data.entry.track_id,
            variant: this.data.entry.variant,
            shot_seconds: this.shotSeconds(),
            ai: this.useAi() && this.aiAvailable(),
          }),
        ),
      );
      if (this.animateMode() === 'chorus' && !this.hasChorus()) this.animateMode.set('none');
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Creates the project; with `generate`, also launches its run. */
  protected async create(generate: boolean): Promise<void> {
    const p = this.plan();
    const a = this.autoPlan();
    if (!p || !a || this.projectId.invalid) {
      this.projectId.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const id = this.projectId.value;
      const cfg = { ...a.config, project: id, output: { ...a.config.output, file: `out/${id}.mp4` } };
      await firstValueFrom(
        this.api.videoclipCreate(this.data.projectId, {
          track_id: this.data.entry.track_id,
          variant: this.data.entry.variant,
          id,
          yaml: toYaml(cfg),
        }),
      );
      let run: string | null = null;
      if (generate) {
        run = (await firstValueFrom(this.api.launchRun(id, {}))).run.id;
      }
      this.ref.close({ id, run });
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function messageOf(e: unknown): string {
  const body = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
  return body ?? (e instanceof Error ? e.message : String(e));
}
