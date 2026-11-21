import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AssetKind,
  AssetKindListing,
  CatalogEntry,
  DownloadRecord,
  DownloadRequest,
  DownloadState,
} from './api.models';
import { ApiService } from './api.service';
import { DownloadStreamService } from './download-stream.service';
import { EnvironmentStore } from './environment.store';

const ACTIVE: DownloadState[] = ['queued', 'running'];

/**
 * State of the "Modelos" screen: installed assets per kind, the catalog
 * and the download list. Each active download is followed over SSE; when
 * one succeeds the inventories refresh, including the environment report
 * the editor's dropdowns read.
 */
@Injectable({ providedIn: 'root' })
export class ModelsStore {
  private readonly api = inject(ApiService);
  private readonly streams = inject(DownloadStreamService);
  private readonly env = inject(EnvironmentStore);

  readonly kinds = signal<AssetKindListing[]>([]);
  readonly catalog = signal<CatalogEntry[]>([]);
  readonly downloads = signal<DownloadRecord[]>([]);
  readonly loading = signal(false);

  /** Queued or running download per catalog entry id (for card progress). */
  readonly activeByCatalog = computed(() => {
    const out = new Map<string, DownloadRecord>();
    for (const d of this.downloads()) {
      if (ACTIVE.includes(d.state) && d.source.startsWith('catalog:')) {
        out.set(d.source.slice('catalog:'.length), d);
      }
    }
    return out;
  });

  private readonly open = new Map<string, { close(): void }>();

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [assets, catalog, downloads] = await Promise.all([
        firstValueFrom(this.api.listAssets()),
        firstValueFrom(this.api.getCatalog()),
        firstValueFrom(this.api.listDownloads()),
      ]);
      this.kinds.set(assets.kinds);
      this.catalog.set(catalog.entries);
      this.downloads.set(downloads.downloads);
      for (const d of downloads.downloads) {
        if (ACTIVE.includes(d.state)) this.follow(d.id);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Refreshes only what a finished download or a deletion can change. */
  private async refreshInventory(): Promise<void> {
    const [assets, catalog] = await Promise.all([
      firstValueFrom(this.api.listAssets()),
      firstValueFrom(this.api.getCatalog()),
    ]);
    this.kinds.set(assets.kinds);
    this.catalog.set(catalog.entries);
    void this.env.refresh();
  }

  async start(req: DownloadRequest): Promise<DownloadRecord> {
    const { download } = await firstValueFrom(this.api.createDownload(req));
    this.downloads.update((l) => [download, ...l.filter((d) => d.id !== download.id)]);
    this.follow(download.id);
    return download;
  }

  async cancel(id: string): Promise<void> {
    const { download } = await firstValueFrom(this.api.cancelDownload(id));
    this.patch(id, { state: download.state, error: download.error });
  }

  async remove(kind: AssetKind, name: string): Promise<void> {
    await firstValueFrom(this.api.deleteAsset(kind, name));
    await this.refreshInventory();
  }

  private follow(id: string): void {
    if (this.open.has(id)) return;
    this.open.set(
      id,
      this.streams.connect(id, {
        onProgress: (p) => this.patch(id, { bytes: p.bytes, total: p.total || undefined }),
        onState: (s) => {
          this.patch(id, { state: s.state, error: s.error || undefined });
          if (s.state === 'succeeded') void this.refreshInventory();
        },
        onEnd: () => {
          this.open.delete(id);
        },
      }),
    );
  }

  private patch(id: string, change: Partial<DownloadRecord>): void {
    this.downloads.update((l) => l.map((d) => (d.id === id ? { ...d, ...change } : d)));
  }
}
