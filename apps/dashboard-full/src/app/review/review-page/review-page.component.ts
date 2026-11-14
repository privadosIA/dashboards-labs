import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Finding, Fix, FixKind, Review, ReviewDetail, ReviewSummary, Scene } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PanelComponent } from '../../shared/panel/panel.component';
import { ProviderBadgeComponent } from '../../shared/provider-badge/provider-badge.component';
import { AvailabilityStore } from '../../core/availability.store';

const MODEL_KEY = 'mo.review.model';
const POLL_MS = 2500;

/** The parameter each kind of fix carries. */
const PARAM: Record<FixKind, string> = {
  trim: 'seconds',
  reseed: 'seed',
  motion_prompt: 'motion_prompt',
  prompt: 'prompt',
};

function remembered(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Review of a project's animated clips: analyse them, list what was found
 * with how each problem will be fixed, add one's own observations and apply
 * the fixes as tasks through the run queue.
 */
@Component({
  selector: 'app-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProviderBadgeComponent,
    PageHeaderComponent,
    PanelComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './review-page.component.html',
  styleUrl: './review-page.component.scss',
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  /** Which model tasks can run now: the assistant's suggestion is hidden when it cannot (no notice here: it would repeat for every finding). */
  protected readonly availability = inject(AvailabilityStore);
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly env = inject(EnvironmentStore);

  protected readonly fixKinds: FixKind[] = ['trim', 'reseed', 'motion_prompt', 'prompt'];
  protected readonly fixLabels: Record<FixKind, string> = {
    trim: $localize`:@@review.fixTrim:Trim the clip`,
    reseed: $localize`:@@review.fixReseed:Redo with another seed`,
    motion_prompt: $localize`:@@review.fixMotion:Change the motion prompt`,
    prompt: $localize`:@@review.fixPrompt:Change the image prompt`,
  };

  protected readonly statusLabels: Record<string, string> = {
    pending: $localize`:@@review.statusPending:pending`,
    running: $localize`:@@review.statusRunning:running`,
    done: $localize`:@@review.statusDone:done`,
    failed: $localize`:@@review.statusFailed:failed`,
    skipped: $localize`:@@review.statusSkipped:skipped`,
  };
  protected readonly kindLabels: Record<string, string> = {
    deformation: $localize`:@@review.kindDeformation:deformation`,
    color_drift: $localize`:@@review.kindColor:color`,
    blur: $localize`:@@review.kindBlur:sharpness`,
    observation: $localize`:@@review.kindObservation:observation`,
  };
  protected readonly stateLabels: Record<string, string> = {
    analyzing: $localize`:@@review.stateAnalyzing:analyzing`,
    ready: $localize`:@@review.stateReady:ready`,
    failed: $localize`:@@review.stateFailed:failed`,
  };
  protected readonly youLabel = $localize`:@@review.you:you`;

  /** What a finding says it is: the user's own, or the kind of problem found. */
  protected sourceLabel(f: Finding): string {
    return f.source === 'manual' ? this.youLabel : (this.kindLabels[f.kind] ?? f.kind);
  }

  protected readonly reviews = signal<ReviewSummary[]>([]);
  protected readonly detail = signal<ReviewDetail | null>(null);
  protected readonly models = signal<string[]>([]);
  protected readonly model = signal(remembered());
  protected readonly scenes = signal<Scene[]>([]);
  protected readonly gpu = signal('');
  protected readonly busy = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly checked = signal<ReadonlySet<string>>(new Set());

  // The user's own observation.
  protected readonly obsScene = signal('');
  protected readonly obsFrom = signal(0);
  protected readonly obsText = signal('');
  protected readonly obsSeverity = signal(7);

  protected readonly review = computed<Review | null>(() => this.detail()?.review ?? null);
  protected readonly findings = computed<Finding[]>(() => this.detail()?.findings ?? []);
  protected readonly analyzing = computed(() => this.review()?.state === 'analyzing');
  protected readonly running = computed(() => this.findings().some((f) => f.status === 'running'));
  protected readonly pendingCount = computed(() => this.findings().filter((f) => f.status === 'pending').length);
  protected readonly canObserve = computed(() => this.obsScene() !== '' && this.obsText().trim() !== '');

  private timer: ReturnType<typeof setInterval> | undefined;

  async ngOnInit(): Promise<void> {
    await this.env.ensureLoaded();
    void this.loadModels();
    void this.loadScenes();
    await this.loadReviews(true);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private async loadModels(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getVisionModels());
      this.models.set(res.models);
    } catch {
      this.models.set([]);
    }
  }

  private async loadScenes(): Promise<void> {
    try {
      const cfg = await firstValueFrom(this.api.getConfig(this.id()));
      this.scenes.set(cfg.parsed?.scenes ?? []);
    } catch {
      this.scenes.set([]);
    }
  }

  protected async loadReviews(openLatest = false): Promise<void> {
    const list = await firstValueFrom(this.api.listReviews(this.id()));
    this.reviews.set(list);
    if (openLatest && list.length > 0 && !this.detail()) {
      await this.open(list[0].id);
    }
  }

  protected async open(rid: string): Promise<void> {
    const d = await firstValueFrom(this.api.getReview(rid));
    this.detail.set(d);
    this.checked.set(new Set());
    this.syncPolling();
  }

  private syncPolling(): void {
    if ((this.analyzing() || this.running()) && !this.timer) {
      this.timer = setInterval(() => void this.refresh(), POLL_MS);
    } else if (!this.analyzing() && !this.running()) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async refresh(): Promise<void> {
    const r = this.review();
    if (!r) return;
    try {
      this.detail.set(await firstValueFrom(this.api.getReview(r.id)));
      this.reviews.set(await firstValueFrom(this.api.listReviews(this.id())));
    } catch {
      this.stopPolling();
      return;
    }
    this.syncPolling();
  }

  protected pickModel(m: string): void {
    this.model.set(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* the choice is only a convenience */
    }
  }

  protected async analyze(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.startReview(this.id(), { model: this.model() || undefined }));
      await this.loadReviews();
      await this.open(r.id);
    } finally {
      this.busy.set(false);
    }
  }

  /** A review without analysis, to write one's own observations on. */
  protected async startManual(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.startReview(this.id(), { analyze: false }));
      await this.loadReviews();
      await this.open(r.id);
    } finally {
      this.busy.set(false);
    }
  }

  // --- findings ---------------------------------------------------------------

  protected frameUrl(f: Finding): string {
    return this.api.findingFrameUrl(f.review_id, f.id);
  }

  protected paramOf(f: Finding): string {
    const v = f.fix?.params?.[PARAM[f.fix.kind]];
    return v === undefined ? '' : String(v);
  }

  protected isText(kind: FixKind): boolean {
    return kind === 'motion_prompt' || kind === 'prompt';
  }

  protected editable(f: Finding): boolean {
    return f.status === 'pending' || f.status === 'failed' || f.status === 'skipped';
  }

  private fixOf(kind: FixKind, value: string): Fix {
    const key = PARAM[kind];
    return { kind, params: { [key]: this.isText(kind) ? value : Number(value) } };
  }

  protected async setFixKind(f: Finding, kind: FixKind): Promise<void> {
    // Seeds start at a random one, a cut at what is left before the defect.
    const start =
      kind === 'trim' ? String(Math.max(0.8, Math.round(f.from_seconds * 10) / 10))
      : kind === 'reseed' ? String(Math.floor(Math.random() * 1_000_000))
      : '';
    await this.patch(f, { fix: this.fixOf(kind, start) });
  }

  protected async setParam(f: Finding, value: string): Promise<void> {
    if (value === this.paramOf(f)) return;
    await this.patch(f, { fix: this.fixOf(f.fix.kind, value) });
  }

  protected async skip(f: Finding, skipped: boolean): Promise<void> {
    await this.patch(f, { skipped });
  }

  private async patch(f: Finding, body: Parameters<ApiService['patchFinding']>[2]): Promise<void> {
    try {
      const upd = await firstValueFrom(this.api.patchFinding(f.review_id, f.id, body));
      this.replace(upd);
    } catch {
      // the error interceptor explains it; reload what the server holds
      await this.refresh();
    }
  }

  private replace(upd: Finding): void {
    const d = this.detail();
    if (!d) return;
    this.detail.set({ ...d, findings: d.findings.map((x) => (x.id === upd.id ? upd : x)) });
  }

  protected async suggest(f: Finding): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.suggestMotion(f.review_id, f.id));
      await this.patch(f, { fix: this.fixOf('motion_prompt', res.motion_prompt) });
    } catch {
      this.snack.open($localize`:@@review.suggestFailed:The assistant could not propose a motion.`, undefined, { duration: 5000 });
    }
  }

  // --- tasks --------------------------------------------------------------------

  protected isChecked(id: string): boolean {
    return this.checked().has(id);
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.checked());
    if (on) next.add(id);
    else next.delete(id);
    this.checked.set(next);
  }

  protected async runTasks(ids: string[]): Promise<void> {
    const r = this.review();
    if (!r || this.busy()) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.runReviewTasks(r.id, ids, this.gpu()));
      const msg = res.skipped.length
        ? $localize`:@@review.tasksSome:${res.started.length}:started: tasks in the queue, ${res.skipped.length}:skipped: not launched.`
        : $localize`:@@review.tasksAll:${res.started.length}:started: tasks in the queue.`;
      this.snack.open(msg, undefined, { duration: 5000 });
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  protected async runChecked(): Promise<void> {
    await this.runTasks([...this.checked()]);
  }

  // --- observation ----------------------------------------------------------------

  protected async addObservation(): Promise<void> {
    const r = this.review();
    if (!r || !this.canObserve()) return;
    const fix = this.fixOf('reseed', String(Math.floor(Math.random() * 1_000_000)));
    try {
      await firstValueFrom(
        this.api.createFinding(r.id, {
          scene: this.obsScene(),
          from_seconds: this.obsFrom(),
          severity: this.obsSeverity(),
          description: this.obsText().trim(),
          fix,
        }),
      );
      this.obsText.set('');
      await this.open(r.id);
    } catch {
      // explained by the interceptor
    }
  }

  // --- history ---------------------------------------------------------------------

  protected async deleteReview(r: ReviewSummary): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@review.deleteTitle:Delete the review`,
        message: $localize`:@@review.deleteMsg:Review ${r.id}:id: will be deleted with its findings and its frames. The clips and the video are not touched.`,
        confirmLabel: $localize`:@@review.deleteConfirm:Delete review`,
        destructive: true,
      }),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteReview(r.id));
    } catch {
      return;
    }
    if (this.review()?.id === r.id) this.detail.set(null);
    await this.loadReviews(true);
  }

  protected async deleteAll(): Promise<void> {
    const n = this.reviews().filter((r) => r.state !== 'analyzing').length;
    if (n === 0) return;
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@review.deleteAllTitle:Delete the reviews`,
        message: $localize`:@@review.deleteAllMsg:${n}:n: reviews of this project will be deleted with their findings and frames.`,
        confirmLabel: $localize`:@@review.deleteAllConfirm:Delete all`,
        destructive: true,
      }),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteReviews({ project: this.id() }));
    } catch {
      return;
    }
    this.detail.set(null);
    await this.loadReviews(true);
  }
}
