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
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { PagedList } from '@lab/paged-list';
import { firstValueFrom } from 'rxjs';

import { LibrarySong } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { ModeSelectComponent } from '../../shared/mode-select/mode-select.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { clock } from '../music-options';
import { LibrarySort, LibraryStore, VIEW_ALL, VIEW_FAVORITES, VIEW_RATED } from './library.store';

/**
 * The song library: every song of every music project in one place, with a search, stars,
 * playlists and a "play all" that goes through the list song after song.
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
    ModeSelectComponent,
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

  /** The language of the paginator of the list. */
  protected readonly lang = inject(LOCALE_ID).startsWith('es') ? 'es' : 'en';
  /** The songs are a list, not a table: it pages 5, 10, 20 or 100 at a time. */
  protected readonly pageSizes = [5, 10, 20, 100];
  protected readonly VIEW_ALL = VIEW_ALL;
  protected readonly VIEW_FAVORITES = VIEW_FAVORITES;
  protected readonly VIEW_RATED = VIEW_RATED;
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
  protected readonly queue = signal<string[]>([]);
  protected readonly queuePos = signal(0);
  protected readonly nowPlaying = computed<LibrarySong | null>(() => {
    const key = this.queue()[this.queuePos()];
    return key ? (this.store.byKey().get(key) ?? null) : null;
  });
  private readonly nowPlayer = viewChild<AudioPlayerComponent>('nowPlayer');

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
  protected markMissing(key: string): void {
    this.missing.update((m) => new Set([...m, key]));
  }

  protected viewCount(view: string): number {
    const ratings = this.store.ratings();
    const songs = this.store.scoped();
    if (view === VIEW_ALL) return songs.length;
    if (view === VIEW_FAVORITES) return songs.filter((s) => s.favorite).length;
    if (view === VIEW_RATED) return songs.filter((s) => ratings[s.key]).length;
    const inScope = new Set(songs.map((s) => s.key));
    return this.store.playlists().find((p) => p.id === view)?.songs.filter((k) => inScope.has(k)).length ?? 0;
  }

  // --- playlists -----------------------------------------------------------------
  protected startNewList(forSong: string | null = null): void {
    this.newFor.set(forSong);
    this.newName.set('');
    this.creating.set(true);
    setTimeout(() => this.newInput()?.nativeElement.focus());
  }
  protected createList(): void {
    const forSong = this.newFor();
    const id = this.store.createPlaylist(this.newName(), forSong ?? undefined);
    if (!id) return;
    this.newName.set('');
    this.newFor.set(null);
    this.creating.set(false);
    // started from a song's menu, the list is made for that song and the view stays; otherwise it opens
    if (forSong === null) this.store.view.set(id);
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
  protected applyRename(): void {
    const p = this.store.activePlaylist();
    if (p) this.store.renamePlaylist(p.id, this.renameValue());
    this.renaming.set(false);
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
    if (ok) this.store.deletePlaylist(p.id);
  }

  // --- playing -------------------------------------------------------------------
  /** Plays what the list shows, from the first song (or from the given one). */
  protected playAll(from?: string): void {
    const keys = this.store.visible().filter((s) => !this.missing().has(s.key)).map((s) => s.key);
    if (keys.length === 0) return;
    this.queue.set(keys);
    this.queuePos.set(Math.max(0, from ? keys.indexOf(from) : 0));
    this.startNow();
  }
  protected next(): void {
    if (this.queuePos() + 1 < this.queue().length) {
      this.queuePos.update((n) => n + 1);
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
    this.queue.set([]);
    this.queuePos.set(0);
  }
  private startNow(): void {
    // the player of the bar exists after the next render; the browser lets it play because the click started this
    setTimeout(() => this.nowPlayer()?.play());
  }
}
