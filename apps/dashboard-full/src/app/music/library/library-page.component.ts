import { AutoAnimateDirective } from '@lab/motion-ui';
import { ChangeDetectionStrategy, Component, ElementRef, LOCALE_ID, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { PagedList } from '@lab/paged-list';
import { firstValueFrom } from 'rxjs';

import { LibrarySong, RescanResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { clock } from '../music-options';
import { LibrarySort, LibraryStore, VIEW_ALL, VIEW_FAVORITES, VIEW_RATED } from './library.store';

/**
 * The song library: every song of every music project in one place, read a page at a time, with a search, stars,
 * playlists, a rescan and a "play all" that goes through every song that matches.
 */
@Component({
  selector: 'app-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LibraryStore],
  imports: [
    AutoAnimateDirective,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    AudioPlayerComponent,
    EmptyStateComponent,
    PagedList,
    PageHeaderComponent,
  ],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.scss',
})
export class LibraryPageComponent implements OnInit {
  protected readonly store = inject(LibraryStore);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  /** The language of the paginator of the list. */
  protected readonly lang = inject(LOCALE_ID).startsWith('es') ? 'es' : 'en';
  /** The songs are a list, not a table: it pages 5, 10, 20 or 100 at a time. */
  protected readonly pageSizes = [5, 10, 20, 100];
  protected readonly VIEW_ALL = VIEW_ALL;
  protected readonly VIEW_FAVORITES = VIEW_FAVORITES;
  protected readonly VIEW_RATED = VIEW_RATED;
  /** What made a song: named on its card and offered as a filter (the server filters by `generator`). */
  protected readonly generators: { value: string; label: string }[] = [
    { value: 'ace-step', label: 'ACE-Step' },
    { value: 'heartmula', label: 'HeartMuLa' },
    { value: 'diffrhythm2', label: 'DiffRhythm2' },
  ];
  protected readonly starValues = [1, 2, 3, 4, 5];
  protected readonly sorts: { value: LibrarySort; label: string }[] = [
    { value: 'recent', label: $localize`:@@library.sortRecent:Most recent` },
    { value: 'rating', label: $localize`:@@library.sortRating:Best rated` },
    { value: 'title', label: $localize`:@@library.sortTitle:By title` },
  ];

  // --- creating and renaming playlists -----------------------------------------
  protected readonly newName = signal('');
  /** The name form of a new playlist is open. */
  protected readonly creating = signal(false);
  /** A song to put in the playlist being created (when it was started from the song's menu). */
  protected readonly newFor = signal<string | null>(null);
  protected readonly renaming = signal(false);
  protected readonly renameValue = signal('');
  private readonly newInput = viewChild<ElementRef<HTMLInputElement>>('newInput');

  // --- the queue ("play all") --------------------------------------------------
  /** The songs queued: the ones that match the filters, read in blocks while the first one already plays. */
  protected readonly queue = signal<LibrarySong[]>([]);
  protected readonly queuePos = signal(0);
  protected readonly nowPlaying = computed<LibrarySong | null>(() => this.queue()[this.queuePos()] ?? null);
  private readonly nowPlayer = viewChild<AudioPlayerComponent>('nowPlayer');
  /** A new "play all" makes the blocks of the previous one stop being read. */
  private queueRun = 0;

  /** Files that failed to load (the song was deleted from disk after the list was read). */
  protected readonly missing = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    void this.store.load();
  }

  protected url(s: LibrarySong): string {
    return this.api.artifactUrl(s.project, s.file);
  }
  protected coverUrl(s: LibrarySong): string {
    return this.api.artifactUrl(s.project, s.cover ?? '');
  }
  protected length(s: LibrarySong): string {
    return clock(s.audio_seconds);
  }
  protected generatorName(s: LibrarySong): string {
    return this.generators.find((g) => g.value === (s.generator ?? 'ace-step'))?.label ?? '';
  }
  protected async deleteSong(s: LibrarySong): Promise<void> {
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@library.deleteSongTitle:Delete the song “${s.title}:title:”`,
        message: $localize`:@@library.deleteSongMessage:The audio of variant ${s.variant + 1}:variant: is deleted from the project “${s.project}:project:”. The track stays: you can create it again. This cannot be undone.`,
        confirmLabel: $localize`:@@library.deleteSongAction:Delete song`,
        destructive: true,
      }),
    );
    if (!ok) return;
    if (this.nowPlaying()?.key === s.key) this.stopQueue();
    await this.store.deleteSong(s);
  }
  /** Reads the projects again for audio put or removed by hand, and says what it found. */
  protected async rescan(): Promise<void> {
    const found = await this.store.rescan();
    if (found) this.snack.open(this.rescanText(found), $localize`:@@library.close:Close`, { duration: 6000 });
  }
  private rescanText(r: RescanResult): string {
    return $localize`:@@library.rescanDone:${r.added}:added: added, ${r.updated}:updated: updated, ${r.removed}:removed: removed`;
  }
  protected markMissing(key: string): void {
    this.missing.update((m) => new Set([...m, key]));
  }

  /** How many songs a view holds: the counts of the library for the special views, the playlist's own for a playlist. */
  protected viewCount(view: string): number {
    const c = this.store.counts();
    if (view === VIEW_ALL) return c.all;
    if (view === VIEW_FAVORITES) return c.favorites;
    if (view === VIEW_RATED) return c.rated;
    return this.store.playlists().find((p) => p.id === view)?.songs ?? 0;
  }

  // --- playlists -----------------------------------------------------------------
  protected startNewList(forSong: string | null = null): void {
    this.newFor.set(forSong);
    this.newName.set('');
    this.creating.set(true);
    setTimeout(() => this.newInput()?.nativeElement.focus());
  }
  protected async createList(): Promise<void> {
    const forSong = this.newFor();
    const id = await this.store.createPlaylist(this.newName(), forSong ?? undefined);
    if (!id) return; // the reason is on screen and the form stays, so the name can be changed
    this.newName.set('');
    this.newFor.set(null);
    this.creating.set(false);
    // started from a song's menu, the list is made for that song and the view stays; otherwise it opens
    if (forSong === null) this.store.setView(id);
  }
  protected cancelNewList(): void {
    this.creating.set(false);
    this.newFor.set(null);
    this.newName.set('');
  }
  protected startRename(): void {
    this.renameValue.set(this.store.activePlaylist()?.name ?? '');
    this.renaming.set(true);
  }
  protected async applyRename(): Promise<void> {
    const p = this.store.activePlaylist();
    if (p && (await this.store.renamePlaylist(p.id, this.renameValue()))) this.renaming.set(false);
  }
  protected async deleteList(): Promise<void> {
    const p = this.store.activePlaylist();
    if (!p) return;
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@library.deleteTitle:Delete the playlist “${p.name}:name:”`,
        message: $localize`:@@library.deleteMessage:The songs are not deleted, only the playlist.`,
        confirmLabel: $localize`:@@library.delete:Delete`,
        destructive: true,
      }),
    );
    if (ok) await this.store.deletePlaylist(p.id);
  }

  // --- playing -------------------------------------------------------------------
  /**
   * Plays every song that matches the filters, from the first one or from the given one. The matching songs are read in blocks of
   * 500 and the queue starts as soon as the song to start at is in hand; the rest is added behind it while it plays.
   */
  protected async playAll(from?: string): Promise<void> {
    const run = ++this.queueRun;
    const queue: LibrarySong[] = [];
    let offset = 0;
    let started = false;
    let total = 0;
    do {
      const block = await this.store.readMatching(offset);
      if (run !== this.queueRun) return;
      total = block.total;
      offset += block.items.length;
      queue.push(...block.items);
      if (!started) {
        let at = from === undefined ? 0 : queue.findIndex((s) => s.key === from);
        // starting from the top, a song whose file is gone is not where it starts
        while (from === undefined && at >= 0 && at < queue.length && this.missing().has(queue[at].key)) at++;
        if (queue.length > 0 && at >= 0 && at < queue.length) {
          started = true;
          this.queue.set([...queue]);
          this.queuePos.set(at);
          this.startNow();
        }
      } else {
        this.queue.set([...queue]);
      }
      if (block.items.length === 0) break;
    } while (offset < total);
    // the song to start at is gone (deleted since the page was read): start at the first
    if (!started && queue.length > 0) {
      this.queue.set(queue);
      this.queuePos.set(0);
      this.startNow();
    }
  }
  protected next(): void {
    let at = this.queuePos() + 1;
    while (at < this.queue().length && this.missing().has(this.queue()[at].key)) at++; // a file that is gone is skipped
    if (at < this.queue().length) {
      this.queuePos.set(at);
      this.startNow();
    } else {
      this.stopQueue();
    }
  }
  protected previous(): void {
    if (this.queuePos() > 0) {
      this.queuePos.update((n) => n - 1);
      this.startNow();
    }
  }
  protected stopQueue(): void {
    this.queueRun++;
    this.queue.set([]);
    this.queuePos.set(0);
  }
  private startNow(): void {
    // the player of the bar exists after the next render; the browser lets it play because the click started this
    setTimeout(() => this.nowPlayer()?.play());
  }
}
