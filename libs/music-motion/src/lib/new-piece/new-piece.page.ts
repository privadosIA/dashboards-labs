import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { Observable, Subscription, catchError, defer, forkJoin, interval, map, of, switchMap, take, tap } from 'rxjs';

import { injectLink } from '../core/links';
import { LocalStyles, type LocalStyle } from '../animation/local-styles';
import { scriptFromStyle } from '../animation/script-from-style';
import { ANIMATION } from '../animation/tokens';
import type { Catalog, Choices, Level, PieceDetail, Song, Style } from '@lab/animation-core';
import { defaultChoices, defaultFps, validateChoices } from '../animation/validate';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { failureText } from '../shared/failure-text';
import { formatClock } from '../shared/format';
import { NO_LOOK, lookName, type Look } from './look';
import { LookStep } from './look-step/look-step';
import { PromptStep } from './prompt-step/prompt-step';
import { SongStep } from './song-step/song-step';
import en from './dynamic/new-piece.en.json';
import es from './dynamic/new-piece.es.json';
import { withCatalog } from './with-catalog';
import type { Assistant } from '@lab/assist-kit';

type FormModel = Record<string, unknown>;

/** The choices the form holds. The frame rate is a text in the form (its options are texts) and a number in the choices. */
export const toChoices = (m: FormModel): Choices => ({ style: String(m['style']) as Style, level: String(m['level']) as Level, fps: Number(m['fps']), resolution: String(m['resolution'] ?? '').trim(), ...(m['hearWords'] === true ? { hearWords: true } : {}), ...(typeof m['preset'] === 'string' && m['preset'] ? { presetId: m['preset'] } : {}) });

/** How often the seconds shown while the animation is being made go up, in milliseconds. */
export const PROGRESS_TICK_MS = new InjectionToken<number>('PROGRESS_TICK_MS', { providedIn: 'root', factory: () => 1000 });

type StepIndex = 0 | 1 | 2;

/** What became of the prompt, for the piece's page to say once: why the assistant could not be asked for the design and the script. */
export type PromptNote = { readonly kind: 'failed'; readonly reason: string };

/**
 * A new animation, in three steps: the idea (the prompt, which is on the first screen so it is not missed) and the look (a reference that is there
 * or one added from a YouTube address, a style, or none), the song and the options. An address that names a song (`?project=&track=&variant=`, as the Animate button of Songs makes it) starts at the options.
 */
@Component({
  selector: 'app-new-piece-page',
  imports: [DynamicFormComponent, RouterLink, LookStep, SongStep, PromptStep],
  templateUrl: './new-piece.page.html',
  styleUrl: './new-piece.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPiecePage implements OnInit {
  private readonly port = inject(ANIMATION);
  private readonly local = inject(LocalStyles);
  private readonly router = inject(Router);
  protected readonly link = injectLink();
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.newPiece;
  protected readonly n = this.texts.newAnimation;
  protected readonly common = this.texts;
  protected readonly clock = formatClock;
  protected readonly lookName = lookName;
  private readonly baseSchema = pickSchema('new-piece', { en, es }, this.lang);

  protected readonly steps = [this.n.steps.look, this.n.steps.song, this.n.steps.options] as const;
  protected readonly step = signal<StepIndex>(0);
  protected readonly look = signal<Look>(NO_LOOK);
  /** What the animation should be like, in the person's words; empty makes it as always. */
  protected readonly prompt = signal('');
  protected readonly promptValid = signal(true);
  /** The assistant's model chosen on the first step; empty is the server's own. */
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly isOwn = computed(() => this.look().kind === 'own');
  /** The library's songs; `null` while they are read. */
  protected readonly songs = signal<readonly Song[] | null>(null);
  protected readonly songsError = signal('');
  protected readonly song = signal<Song | null>(null);
  /** `undefined` while the page loads; true when the address names a song that is not in the library. */
  protected readonly loaded = signal(false);
  protected readonly missing = signal(false);
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly schema = computed(() => withCatalog(this.baseSchema, this.catalog(), this.t));
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(false);
  /** What is being done while the animation is made: each stage is shown, with the seconds that have passed, so it never looks stuck. */
  protected readonly phase = signal<'idle' | 'making' | 'creating' | 'design'>('idle');
  protected readonly elapsed = signal(0);
  private ticker: Subscription | null = null;
  private readonly tick = inject(PROGRESS_TICK_MS);
  protected readonly stage = computed(() => {
    switch (this.phase()) {
      case 'making':
        return this.n.making;
      case 'design':
        return this.n.progress.design;
      default:
        return this.n.progress.creating;
    }
  });
  /** The server's reason for refusing the piece, shown beside the choices. */
  protected readonly refused = signal('');
  protected readonly working = computed(() => this.phase() !== 'idle');
  protected readonly slow = computed(() => toChoices(this.model()).level === 'advanced' && toChoices(this.model()).fps === 60);

  constructor() {
    // The illustrated style is drawn at 24 fps: the frame rate follows the style while the person has not chosen another.
    // The form only writes its defaults into the model when the person touches it, so the style before the first change is the default one.
    let style: Style = defaultChoices().style;
    effect(() => {
      const current = this.model();
      const next = current['style'] as Style | undefined;
      if (!next || next === style) return;
      const before = style;
      style = next;
      if (String(current['fps']) === String(defaultFps(before))) untracked(() => this.model.set({ ...current, fps: String(defaultFps(next)) }));
    });
  }

  ngOnInit(): void {
    const project = this.query.get('project');
    const track = this.query.get('track');
    const variant = Number(this.query.get('variant') ?? 0);
    forkJoin({
      songs: this.port.songs().pipe(
        take(1),
        catchError((e) => {
          this.songsError.set(failureText(e, this.texts));
          return of([] as readonly Song[]);
        }),
      ),
      catalog: this.port.catalog(),
    })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: ({ songs, catalog }) => {
          this.catalog.set(catalog);
          this.songs.set(songs);
          if (project && track) {
            const found = songs.find((s) => s.project === project && s.trackId === track && s.variant === variant) ?? null;
            this.song.set(found);
            if (found) this.step.set(2);
            else this.missing.set(true);
          }
          this.loaded.set(true);
        },
        error: (e) => {
          this.refused.set(failureText(e, this.texts));
          this.songs.set([]);
          this.missing.set(!!(project && track));
          this.loaded.set(true);
        },
      });
  }

  protected canGo(to: StepIndex): boolean {
    return to <= this.step() || to === 1 || (to === 2 && this.song() !== null);
  }

  protected go(to: StepIndex): void {
    if (this.canGo(to)) this.step.set(to);
  }

  protected pick(song: Song): void {
    this.song.set(song);
    this.step.set(2);
  }

  protected create(): void {
    const song = this.song();
    const prompt = this.prompt().trim();
    const choices: Choices = { ...toChoices(this.model()), ...(prompt ? { prompt } : {}) };
    if (!song || this.working() || validateChoices(choices).length) return;
    this.refused.set('');
    this.phase.set('creating');
    this.startClock();
    const made$ = this.request(song, choices);
    // The prompt is kept with the piece. The assistant is asked for the design and the script in the background, unless the look is an own style: its script comes from its parts.
    const done$ = prompt && !this.isOwn() ? made$.pipe(switchMap((piece) => this.startProposal(piece))) : made$.pipe(map((piece) => ({ piece }) as { piece: PieceDetail; note?: PromptNote }));
    done$.pipe(takeUntilDestroyed(this.destroyed)).subscribe({
      // The server says why it could not hear the words only in the answer that creates the piece, so the page of the piece is given it.
      next: ({ piece, note }) => {
        const state = { ...(piece.notice ? { notice: piece.notice } : {}), ...(note ? { promptNote: note } : {}) };
        void (Object.keys(state).length ? this.router.navigate([this.link('pieces', piece.id)], { state }) : this.router.navigate([this.link('pieces', piece.id)]));
      },
      error: (e) => {
        this.stopClock();
        this.phase.set('idle');
        this.refused.set(failureText(e, this.texts));
      },
    });
  }

  private startClock(): void {
    this.stopClock();
    this.elapsed.set(0);
    this.ticker = interval(this.tick).subscribe(() => this.elapsed.update((n) => n + 1));
    this.destroyed.onDestroy(() => this.stopClock());
  }

  private stopClock(): void {
    this.ticker?.unsubscribe();
    this.ticker = null;
  }

  /**
   * Asks the assistant for the design and the script from the prompt the piece keeps, with the model chosen, and answers at once: it is written in the
   * background and the page of the piece follows it. A failure here does not undo the piece: the page says why the assistant was not asked.
   */
  private startProposal(made: PieceDetail): Observable<{ piece: PieceDetail; note?: PromptNote }> {
    const keepNotice = (piece: PieceDetail): PieceDetail => ({ ...piece, ...(made.notice ? { notice: made.notice } : {}) });
    return this.port.proposeAll(made.id, { ...(this.assistant().provider ? { provider: this.assistant().provider } : {}), ...(this.assistant().model ? { model: this.assistant().model } : {}) }).pipe(
      map((piece) => ({ piece: keepNotice(piece) })),
      catchError((e) => of({ piece: made, note: { kind: 'failed', reason: failureText(e, this.texts) } as PromptNote })),
    );
  }

  /** Makes the piece from what was chosen: from the look (an own style, a reference's style, a style of the server) or from none. */
  private request(song: Song, choices: Choices): Observable<PieceDetail> {
    const look = this.look();
    switch (look.kind) {
      case 'own': {
        const own = this.local.styles().find((s) => s.id === look.id);
        return own ? this.createFromOwn(song, choices, own) : this.port.create(song, choices);
      }
      case 'style':
        return this.port.create(song, { ...choices, presetId: look.presetId });
      case 'reference':
        return this.styleOf(look.reference.id).pipe(switchMap((presetId) => this.port.create(song, { ...choices, presetId })));
      default:
        return this.port.create(song, choices);
    }
  }

  /** The style already made from a reference, or a new one made from it: a reference gives one style, not one for each animation. */
  private styleOf(referenceId: string): Observable<string> {
    return this.port.presets().pipe(
      take(1),
      switchMap((list) => {
        const have = list.find((p) => p.referenceId === referenceId);
        if (have) return of(have.id);
        this.phase.set('making');
        return this.port.makePreset(referenceId).pipe(
          map((made) => {
            this.phase.set('creating');
            return made.id;
          }),
        );
      }),
    );
  }

  /**
   * A piece that starts from an own style, which the server does not know: it is made with no style, then given the style's design and a
   * script that goes through the style's parts at its rhythm over the song's own length (the piece's song map, which the server checks the
   * script against: the library's length is rounded). The person edits that script like any other.
   */
  private createFromOwn(song: Song, choices: Choices, own: LocalStyle): Observable<PieceDetail> {
    const { presetId: _own, ...plain } = choices;
    return this.port.create(song, plain).pipe(
      tap(() => this.phase.set('design')),
      switchMap((made) =>
        this.port.saveDesign(made.id, own.design).pipe(
          switchMap((withDesign) => this.port.saveScript(made.id, scriptFromStyle(own, withDesign.songMap.duration, this.catalog()!, choices.level, withDesign.songMap.sections).script)),
          map((saved) => {
            this.local.noteStart(saved.id, own.name);
            return { ...saved, ...(made.notice ? { notice: made.notice } : {}) };
          }),
        ),
      ),
    );
  }
}
