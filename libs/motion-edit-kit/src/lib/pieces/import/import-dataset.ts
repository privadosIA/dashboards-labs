import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Song } from '@lab/animation-core';
import {
  MAX_DATASET_BYTES,
  countPlan,
  countResults,
  planAnimationImport,
  readCurrentState,
  runAnimationImport,
  validateAnimationDataset,
  type AnimationDataset,
  type CurrentState,
  type ImportPlan,
  type ItemResult,
} from '@lab/animation-dataset';
import { ANIMATION } from '@lab/music-motion';

import { LanguageService } from '../../core/language';
import { MOTION_EDIT_BASE } from '../../core/options';
import { textsFor } from '../../core/texts';
import { ReportList } from './report-list/report-list';

type Phase = 'idle' | 'reading' | 'problems' | 'report' | 'running' | 'done';

/**
 * Imports the dataset of one animation from the pieces list: reads a file, checks it, shows what would happen to the song, the reference,
 * the style, the own parts and the animation, and only when the person confirms creates what can be created. A style that would need the
 * browser to keep it is not kept here (this dashboard has no browser styles). A file with problems creates nothing; cancelling the report
 * leaves everything as it was.
 */
@Component({
  selector: 'app-import-dataset',
  imports: [ReportList],
  templateUrl: './import-dataset.html',
  styleUrl: './import-dataset.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportDataset {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  private readonly base = inject(MOTION_EDIT_BASE);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).importer;
  private readonly texts = textsFor(this.lang);

  protected readonly phase = signal<Phase>('idle');
  protected readonly fileName = signal('');
  protected readonly problems = signal<readonly string[]>([]);
  protected readonly plan = signal<ImportPlan | null>(null);
  protected readonly results = signal<readonly ItemResult[]>([]);
  protected readonly songs = signal<readonly Song[]>([]);
  /** The key of the song picked instead of the file's; empty means the file's own. */
  protected readonly picked = signal('');
  protected readonly fileSong = signal<{ title: string; found: boolean }>({ title: '', found: false });

  private dataset: AnimationDataset | null = null;
  private current: CurrentState | null = null;
  private stopper: AbortController | null = null;

  protected readonly counts = computed(() => (this.plan() ? countPlan(this.plan()!) : null));
  /** The animation has keyframes and the server does not take them: the person says whether to make it without them. */
  protected readonly unsupported = computed(() => !!this.plan()?.items.some((i) => i.kind === 'animation' && (i.reason === 'animate-unsupported' || i.reason === 'layers-unsupported')));
  protected readonly dropAnimate = signal(false);
  protected readonly canConfirm = computed(() => (this.counts()?.create ?? 0) + (this.counts()?.['keep-local'] ?? 0) > 0);
  protected readonly resultCounts = computed(() => countResults(this.results()));
  /** The animation that was made, to open it. */
  protected readonly made = computed(() => this.results().find((r) => r.kind === 'animation' && r.state === 'created')?.pieceId);

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.plan.set(null);
    this.results.set([]);
    this.picked.set('');
    this.dropAnimate.set(false);
    if (file.size > MAX_DATASET_BYTES) return this.refuse([this.t.tooBig]);
    this.phase.set('reading');
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return this.refuse([this.t.unreadable]);
    }
    const checked = validateAnimationDataset(json, this.lang);
    if (!checked.ok) return this.refuse(checked.problems);
    try {
      this.dataset = checked.dataset;
      this.current = await readCurrentState(this.port, checked.dataset);
      this.songs.set(this.current.songs);
      const own = checked.dataset.animation.song;
      this.fileSong.set({ title: own.title, found: this.current.songs.some((s) => s.project === own.project && s.trackId === own.trackId && s.variant === own.variant) });
      this.replan();
      this.phase.set('report');
    } catch (e) {
      this.refuse([e instanceof Error && e.message ? e.message : this.texts.unknownError]);
    }
  }

  /** The plan again, for the song picked: a pure function of what was read, so picking asks the server for nothing. */
  private replan(): void {
    if (!this.dataset || !this.current) return;
    const picked = this.current.songs.find((s) => s.key === this.picked());
    this.plan.set(planAnimationImport(this.dataset, this.current, picked));
  }

  protected pickSong(event: Event): void {
    this.picked.set((event.target as HTMLSelectElement).value);
    this.replan();
  }

  private refuse(problems: readonly string[]): void {
    this.problems.set(problems);
    this.phase.set('problems');
  }

  protected async confirm(): Promise<void> {
    const plan = this.plan();
    const dataset = this.dataset;
    if (!plan || !dataset || !this.canConfirm()) return;
    this.stopper = new AbortController();
    this.results.set([]);
    this.phase.set('running');
    try {
      this.results.set(await runAnimationImport(dataset, plan, this.port, { signal: this.stopper.signal, keepLocal: () => false, onProgress: (r) => this.results.set(r), dropAnimate: this.dropAnimate() }));
    } finally {
      this.phase.set('done');
      this.stopper = null;
    }
  }

  protected stop(): void {
    this.stopper?.abort();
  }

  protected cancel(): void {
    this.dataset = null;
    this.current = null;
    this.plan.set(null);
    this.picked.set('');
    this.fileName.set('');
    this.phase.set('idle');
  }

  protected another(): void {
    this.cancel();
    this.results.set([]);
  }

  protected open(id: string): void {
    void this.router.navigate([`${this.base}/pieces`, id]);
  }
}
