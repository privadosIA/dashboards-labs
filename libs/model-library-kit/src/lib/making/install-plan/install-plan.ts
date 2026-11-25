import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { BackendId, InstallOptions, InstallPlan, PartId } from '../../port';
import type { MakingStore } from '../making.store';

export interface InstallPlanData {
  store: MakingStore;
  engine: string;
  label: string;
  /** The backend to install for; absent: the one the engine runs on now. */
  backend?: BackendId;
}

/**
 * Shows what an install of an engine needs, for a backend and by parts (the service, the image, the weights: the ones that are missing, which the person may untick), with the size, the licence, whether the weights are
 * gated and the free disk, and starts nothing until the person confirms. It asks the plan again when the parts change. It has no field for a key and accepts no licence: for a gated engine it says whose that is.
 * The install itself is followed in the engines panel.
 */
@Component({
  selector: 'lab-install-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule, MatIconModule],
  templateUrl: './install-plan.html',
  styleUrl: './install-plan.scss',
})
export class InstallPlanDialog {
  protected readonly data = inject<InstallPlanData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<InstallPlanDialog, boolean>>(MatDialogRef);
  protected readonly t = textsFor(inject(LanguageService).lang).making.plan;
  private readonly names = textsFor(inject(LanguageService).lang).making.backends.names;

  protected readonly plan = signal<InstallPlan | null>(null);
  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  /** The parts the first plan listed: what the person can tick. */
  protected readonly offered = signal<readonly string[]>([]);
  protected readonly ticked = signal<ReadonlySet<string>>(new Set());
  protected readonly problem = computed(() => this.data.store.problems()[this.data.engine] ?? '');
  protected readonly backendName = computed(() => {
    const b = this.plan()?.backend;
    return b ? (this.names[b] ?? b) : '';
  });
  /** The disk does not hold what the plan needs: it cannot be confirmed. */
  protected readonly noRoom = computed(() => {
    const p = this.plan();
    return !!p && p.bytes > p.free_bytes;
  });
  protected readonly noneTicked = computed(() => this.offered().length > 0 && this.ticked().size === 0);
  protected readonly canConfirm = computed(() => this.plan() !== null && !this.noRoom() && !this.noneTicked() && !this.loading() && !this.starting());

  constructor() {
    void this.ask({ ...(this.data.backend ? { backend: this.data.backend } : {}) }).then(() => {
      const parts = this.plan()?.parts ?? [];
      this.offered.set(parts);
      this.ticked.set(new Set(parts));
    });
  }

  private async ask(options: InstallOptions): Promise<void> {
    this.loading.set(true);
    const plan = await this.data.store.plan(this.data.engine, options);
    if (plan) this.plan.set(plan);
    this.loading.set(false);
  }

  protected label(part: string): string {
    return this.t.part[part] ?? this.t.unknownPart(part);
  }

  /** Ticks or unticks a part and asks the plan again for the ones that stay. */
  protected async toggle(part: string, on: boolean): Promise<void> {
    const next = new Set(this.ticked());
    if (on) next.add(part);
    else next.delete(part);
    this.ticked.set(next);
    if (next.size === 0) return;
    await this.ask(this.options(next));
  }

  private options(ticked: ReadonlySet<string>): InstallOptions {
    const backend = (this.plan()?.backend ?? this.data.backend) as BackendId | undefined;
    return { ...(backend ? { backend } : {}), ...(this.offered().length ? { parts: this.offered().filter((p) => ticked.has(p)) as PartId[] } : {}) };
  }

  protected async confirm(): Promise<void> {
    if (!this.canConfirm()) return;
    this.starting.set(true);
    await this.data.store.confirmInstall(this.data.engine, this.options(this.ticked()));
    this.starting.set(false);
    if (!this.problem()) this.ref.close(true);
  }
}
