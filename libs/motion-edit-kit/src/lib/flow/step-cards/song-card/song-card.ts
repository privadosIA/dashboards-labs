import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import type { Song as LibrarySong } from '@lab/animation-core';
import { pickSchema } from '@lab/forms-kit';
import { ANIMATION, IN_MEMORY_ANIMATION } from '@lab/music-motion';
import { type GeneratorName, SONGS } from '@lab/music-studio-kit';
import { TicketService } from '@lab/server-connection';
import { type Subscription, catchError, of } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { execute, failureOf } from '../../execute';
import { FlowStore } from '../../flow.store';
import en from '../../dynamic/song-texts.en.json';
import es from '../../dynamic/song-texts.es.json';
import { reasonText } from '../../shared/reason-text';
import { type EnginesCheck, LibraryLag, canStart, checkEngines, followSong, makeSong, startEngine, waitForLibrary } from '../../steps/song';

/**
 * The Song step: it checks the generators (and offers to start a stopped one or to use another), makes the song and follows it; the review plays it and offers Regenerate,
 * Edit texts and regenerate, Pick an existing song and Continue, which waits until the animation library lists the song.
 */
@Component({
  selector: 'app-song-card',
  imports: [DynamicFormComponent],
  templateUrl: './song-card.html',
  styleUrl: './song-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongCard implements OnInit {
  private readonly store = inject(FlowStore);
  private readonly songs = inject(SONGS);
  private readonly animation = inject(ANIMATION);
  private readonly memory = inject(IN_MEMORY_ANIMATION, { optional: true });
  private readonly tickets = inject(TicketService);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).flow.song;
  protected readonly retryLabel = this.t.retry;
  protected readonly schema = pickSchema('flow-song-texts', { en, es }, this.lang);

  protected readonly flow = this.store.flow;
  protected readonly step = computed(() => this.flow()?.steps.song);
  protected readonly song = computed(() => this.flow()?.plan.song);
  protected readonly result = computed(() => this.step()?.result as { songId?: string; title?: string; url?: string; seconds?: number; picked?: boolean } | undefined);
  /** The song's address with the server's ticket: an audio element cannot send the Authorization header. */
  protected readonly audio = computed(() => (this.result()?.url ? this.tickets.withTicket(this.result()!.url!) : ''));
  protected readonly progress = signal<Record<string, unknown>>({});
  protected readonly engines = signal<EnginesCheck | null>(null);
  protected readonly starting = signal(false);
  protected readonly engineError = signal('');
  protected readonly editing = signal(false);
  protected readonly model = signal<Record<string, unknown>>({});
  protected readonly valid = signal(false);
  protected readonly picking = signal(false);
  protected readonly library = signal<readonly LibrarySong[]>([]);
  /** Seconds left of the wait for the library, `null` when it is not waiting. */
  protected readonly waiting = signal<number | null>(null);
  protected readonly lag = signal(false);
  protected readonly generators = ['ace-step', 'heartmula', 'diffrhythm2'] as const;
  private running: Subscription | undefined;

  protected readonly sent = computed(() => {
    const s = this.song();
    return s ? this.t.sent(s.generator, s.title, s.style) : '';
  });

  ngOnInit(): void {
    const status = this.step()?.status;
    if (status === 'pending') this.check();
    else if (status === 'running') this.attach();
  }

  /** Looks at the generators and, when the chosen one can be used, makes the song. */
  protected check(): void {
    const song = this.song();
    if (!song) return;
    this.engineError.set('');
    checkEngines(this.songs, song.generator)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe((check) => {
        this.engines.set(check);
        if (check.ok) this.make();
      });
  }

  protected start(generator: GeneratorName): void {
    this.starting.set(true);
    this.engineError.set('');
    startEngine(this.songs, generator)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => this.starting.set(false),
        error: (e: unknown) => {
          this.starting.set(false);
          this.engineError.set(failureOf(e).reason);
        },
      });
  }

  protected useOther(generator: GeneratorName): void {
    const flow = this.flow();
    if (!flow) return;
    this.store.setPlan({ ...flow.plan, song: { ...flow.plan.song, generator } });
    this.check();
  }

  /** Makes the song from the plan's texts: what was current stops being so and is listed as an earlier attempt. */
  protected make(): void {
    const song = this.song();
    if (!song) return;
    this.store.retireSong();
    this.progress.set({});
    this.editing.set(false);
    this.lag.set(false);
    this.running?.unsubscribe();
    this.running = execute(this.store, 'song', () => makeSong(this.songs, song), { onProgress: (i) => this.progress.set(i) });
  }

  /** The tab was closed while the song was being made: it is followed again from where the server has it. */
  private attach(): void {
    const id = this.flow()?.refs.songId;
    if (!id) return;
    this.running = execute(this.store, 'song', () => followSong(this.songs, id), { onProgress: (i) => this.progress.set(i) });
  }

  protected openEdit(): void {
    const song = this.song();
    if (!song) return;
    this.model.set({ title: song.title, lyrics: song.lyrics, style: song.style });
    this.editing.set(true);
  }

  protected applyAndRegenerate(): void {
    const flow = this.flow();
    if (!flow || !this.valid()) return;
    const m = this.model();
    this.store.setPlan({ ...flow.plan, song: { ...flow.plan.song, title: String(m['title'] ?? '').trim(), lyrics: String(m['lyrics'] ?? ''), style: String(m['style'] ?? '').trim() } });
    this.make();
  }

  protected openPick(): void {
    this.picking.set(true);
    this.animation
      .songs()
      .pipe(
        catchError(() => of([] as readonly LibrarySong[])),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((list) => this.library.set(list));
  }

  /** Uses a song the animation library already has: it replaces the one made, which is listed as an earlier attempt. */
  protected pick(song: LibrarySong): void {
    this.store.retireSong();
    this.store.setRefs({ songId: song.project, libraryKey: song.key });
    this.store.run('song');
    this.store.complete('song', { songId: song.project, title: song.title, url: song.audio ?? '', seconds: song.seconds, picked: true });
    this.picking.set(false);
  }

  /** Waits until the animation library lists the song, counting down; then the flow goes on. */
  protected continue(): void {
    const result = this.result();
    const song = this.song();
    if (!result?.songId || !song) return;
    this.lag.set(false);
    this.waiting.set(60);
    waitForLibrary(
      this.animation,
      { projectId: result.songId, title: result.title ?? song.title, seconds: result.seconds ?? 0, instrumental: song.instrumental, lyrics: song.lyrics },
      this.memory && !result.picked ? { memory: this.memory } : {},
    )
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (e) => {
          if ('waiting' in e) this.waiting.set(e.waiting);
          else {
            this.waiting.set(null);
            this.store.setRefs({ libraryKey: e.found.key });
            this.store.continue();
          }
        },
        error: (e: unknown) => {
          this.waiting.set(null);
          if (e instanceof LibraryLag) this.lag.set(true);
          else this.store.fail('song', failureOf(e).reason);
        },
      });
  }

  protected canStart = canStart;
  protected readonly stopped = computed(() => {
    const e = this.engines();
    return e !== null && !e.ok;
  });
  protected readonly failedReason = computed(() => reasonText(this.lang, this.step()?.reason));
  protected readonly phaseText = computed(() => {
    const p = this.progress();
    return p['phase'] === 'queued' ? this.t.queued(p['position'] as number | undefined) : this.t.running;
  });
}
