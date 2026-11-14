import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PagedList } from '@lab/paged-list';

import { countPlan, countResults, MAX_DATASET_BYTES, planAnimationImport, readCurrentState, runAnimationImport, validateAnimationDataset, type AnimationDataset, type CurrentState, type ImportPlan, type ItemResult, type PlanItem } from '@lab/animation-dataset';
import { LocalStyles } from '../../animation/local-styles';
import type { Song } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { injectLink } from '../../core/links';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';

type Phase = 'idle' | 'reading' | 'problems' | 'report' | 'running' | 'done';

/** The key of an item in the file: what a result is matched to. */
const keyOf = (i: { kind: string; index: number }): string => `${i.kind}:${i.index}`;

/**
 * Imports the dataset of one animation: reads a file, checks it, shows what would happen to the song, the reference, the style, the own
 * parts and the animation, and only then, when the person confirms, creates what can be created. The animation can go on any song of the
 * library, and its script is then fitted to it. A file with problems creates nothing; cancelling the report leaves everything as it was.
 */
@Component({
  selector: 'app-import-report',
  imports: [PagedList, RouterLink],
  templateUrl: './import-report.html',
  styleUrl: './import-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportReport {
  private readonly port = inject(ANIMATION);
  private readonly local = inject(LocalStyles);
  protected readonly link = injectLink();
  protected readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.datasets.import;

  protected readonly phase = signal<Phase>('idle');
  protected readonly fileName = signal('');
  protected readonly problems = signal<readonly string[]>([]);
  protected readonly plan = signal<ImportPlan | null>(null);
  protected readonly results = signal<readonly ItemResult[]>([]);
  /** The parts of the file that were asked of the assistant from the report. */
  protected readonly asked = signal<ReadonlySet<number>>(new Set());
  protected readonly askRefused = signal('');
  protected readonly durable = this.local.durable;
  /** The songs of the library, to pick another one for the animation. */
  protected readonly songs = signal<readonly Song[]>([]);
  /** The key of the song picked instead of the file's; empty means the file's own. */
  protected readonly picked = signal('');
  /** The title of the song the file's animation follows, and whether the library has it. */
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
  protected readonly byKey = computed(() => new Map(this.results().map((r) => [keyOf(r), r])));
  protected readonly keptHere = computed(() => this.resultCounts()['kept-local'] > 0);
  /** The animation that was made, to open it. */
  protected readonly made = computed(() => this.results().find((r) => r.kind === 'animation' && r.state === 'created')?.pieceId);

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.plan.set(null);
    this.dropAnimate.set(false);
    this.results.set([]);
    this.asked.set(new Set());
    this.askRefused.set('');
    this.picked.set('');
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
      this.current = await readCurrentState(this.port, checked.dataset, this.local.styles());
      this.songs.set(this.current.songs);
      const own = checked.dataset.animation.song;
      this.fileSong.set({ title: own.title, found: this.current.songs.some((s) => s.project === own.project && s.trackId === own.trackId && s.variant === own.variant) });
      this.replan();
      this.phase.set('report');
    } catch (e) {
      this.refuse([failureText(e, this.texts)]);
    }
  }

  /** The plan again, for the song picked: it is a pure function of what was read, so picking asks the server for nothing. */
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

  protected kindText(item: PlanItem): string {
    return this.t.kinds[item.kind];
  }

  protected actionText(item: PlanItem): string {
    return this.t.actions[item.action];
  }

  protected reason(item: PlanItem): string {
    return item.reason ? this.t.reasons[item.reason](item.detail?.join(', ') ?? '') : '';
  }

  /** What the item came to while importing: its state, and the server's words or the planned reason. */
  protected outcome(item: PlanItem): { state: string; why: string; failed: boolean } {
    const r = this.byKey().get(keyOf(item));
    if (!r) return { state: this.t.pending, why: '', failed: false };
    return { state: this.t.states[r.state], why: r.reason ?? (r.code ? this.t.reasons[r.code](item.detail?.join(', ') ?? '') : ''), failed: r.state === 'failed' };
  }

  protected async confirm(): Promise<void> {
    const plan = this.plan();
    const dataset = this.dataset;
    if (!plan || !dataset || !this.canConfirm()) return;
    this.stopper = new AbortController();
    this.results.set([]);
    this.phase.set('running');
    try {
      const results = await runAnimationImport(dataset, plan, this.port, {
        signal: this.stopper.signal,
        startedFromLocal: (pieceId, name) => this.local.noteStart(pieceId, name),
        keepLocal: (s) => this.local.add({ name: s.name, design: s.design, rhythm: s.rhythm, parts: s.parts, ...(s.reference ? { reference: s.reference } : {}) }) !== null,
        onProgress: (r) => this.results.set(r),
        dropAnimate: this.dropAnimate(),
      });
      this.results.set(results);
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
    this.dropAnimate.set(false);
    this.picked.set('');
    this.fileName.set('');
    this.phase.set('idle');
  }

  protected another(): void {
    this.cancel();
    this.results.set([]);
  }

  /** Asks the assistant for a part the file named but brought no text for, as the Parts screen does from a phrase. */
  protected askAssistant(item: PlanItem): void {
    const part = this.dataset?.animation.parts?.[item.index];
    if (!part) return;
    this.askRefused.set('');
    this.port.askDraft({ request: part.description.slice(0, 500) }).subscribe({
      next: () => this.asked.set(new Set([...this.asked(), item.index])),
      error: (e) => this.askRefused.set(`${this.t.askFailed} ${failureText(e, this.texts)}`),
    });
  }
}
