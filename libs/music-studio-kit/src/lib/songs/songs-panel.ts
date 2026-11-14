import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { PagedList } from '@lab/paged-list';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ConfirmDialog } from '../shared/confirm-dialog/confirm.dialog';
import type { Song } from '../song/model';
import { requestOf } from '../song/request';
import { SONGS } from '../song/tokens';
import { SongCard } from './song-card/song-card';

/** The right side of the page: the songs this dashboard made, newest first, and what can be done with each. */
@Component({
  selector: 'app-songs-panel',
  templateUrl: './songs-panel.html',
  styleUrl: './songs-panel.scss',
  imports: [SongCard, PagedList],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongsPanel {
  private readonly port = inject(SONGS);
  private readonly dialog = inject(MatDialog);
  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly lang = inject(LanguageService).lang;
  /** `null` until the history has been read. */
  protected readonly songs = toSignal(this.port.songs(), { initialValue: null });
  protected readonly failed = signal(false);

  protected async cancel(song: Song): Promise<void> {
    await this.attempt(firstValueFrom(this.port.cancel(song.id)));
  }

  protected async retry(song: Song): Promise<void> {
    await this.attempt(firstValueFrom(this.port.generate(requestOf(song))));
  }

  protected async remove(song: Song): Promise<void> {
    const sure = await firstValueFrom(this.dialog.open<ConfirmDialog, void, boolean>(ConfirmDialog).afterClosed());
    if (sure) await this.attempt(firstValueFrom(this.port.remove(song.id)));
  }

  private async attempt(work: Promise<unknown>): Promise<void> {
    this.failed.set(false);
    try {
      await work;
    } catch {
      this.failed.set(true);
    }
  }
}
