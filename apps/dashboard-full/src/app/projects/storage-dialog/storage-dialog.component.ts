import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ProjectStorage, StoragePart, StoragePartId } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';

export interface StorageDialogData {
  projectId: string;
  /** Free space of the disk, when known. */
  freeBytes?: number;
  /** The media directory of the server, when it has one. */
  mediaDir?: string;
}

/** What each part of a project is, and what cleaning it costs. */
const TEXT: Record<StoragePartId, { name: string; what: string }> = {
  cache: {
    name: $localize`:@@storage.cacheName:Scene cache`,
    what: $localize`:@@storage.cacheWhat:The pictures, animations and intermediate clips that avoid repeating the work. If you empty it, the next run makes every scene again (minutes of GPU).`,
  },
  leftovers: {
    name: $localize`:@@storage.leftoversName:Leftovers of scenes that no longer exist`,
    what: $localize`:@@storage.leftoversWhat:Files of scenes you removed or renamed. They can be deleted without losing anything.`,
  },
  clips: {
    name: $localize`:@@storage.clipsName:Clip of each scene`,
    what: $localize`:@@storage.clipsWhat:The finished clips the Gallery shows and other projects can copy. They are made again on the next run.`,
  },
  animations: {
    name: $localize`:@@storage.animationsName:Complete animations`,
    what: $localize`:@@storage.animationsWhat:The whole animation of each generated scene, which another project can reuse. If you delete them, that use is lost until the next run.`,
  },
  final: {
    name: $localize`:@@storage.finalName:Final video and exports`,
    what: $localize`:@@storage.finalWhat:Your results. They are not cleaned from here.`,
  },
  sources: {
    name: $localize`:@@storage.sourcesName:Sources`,
    what: $localize`:@@storage.sourcesWhat:Your audio, pictures and videos. They are not cleaned from here.`,
  },
  reviews: {
    name: $localize`:@@storage.reviewsName:Reviews`,
    what: $localize`:@@storage.reviewsWhat:The frames the reviews show. Saved reviews will stop showing their picture.`,
  },
  backups: {
    name: $localize`:@@storage.backupsName:Copies of scenes.yaml`,
    what: $localize`:@@storage.backupsWhat:scenes.yaml.bak and other copies. Without them you cannot go back to an earlier version of the project.`,
  },
};

/** The storage of a project part by part, with a clean button for each part that can be cleaned. */
@Component({
  selector: 'app-storage-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, BytesPipe],
  templateUrl: './storage-dialog.component.html',
  styleUrl: './storage-dialog.component.scss',
})
export class StorageDialogComponent implements OnInit {
  protected readonly data = inject<StorageDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly storage = signal<ProjectStorage | null>(null);
  protected readonly busy = signal(false);
  protected readonly text = TEXT;
  /** The parts that take space, biggest first. */
  protected readonly parts = computed(() => [...(this.storage()?.parts ?? [])].sort((a, b) => b.bytes - a.bytes));

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.storage.set(await firstValueFrom(this.api.getProjectStorage(this.data.projectId)));
  }

  protected async clean(part: StoragePart): Promise<void> {
    if (this.busy() || !part.cleanable || part.bytes === 0) return;
    const t = TEXT[part.id];
    const ok = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@storage.cleanTitle:Clean “${t.name}:name:”`,
        message: t.what,
        confirmLabel: $localize`:@@storage.cleanConfirm:Clean`,
        destructive: true,
      }),
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.cleanProjectStorage(this.data.projectId, [part.id]));
      this.snack.open($localize`:@@storage.cleaned:Freed ${mb(res.freed_bytes)}:size:.`, undefined, { duration: 4000 });
      await this.reload();
    } catch {
      // explained by the error interceptor (for example, a run is active)
    } finally {
      this.busy.set(false);
    }
  }
}

/** A size for a message, in the language of the UI. */
function mb(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}
