import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AutoAnimateDirective } from '@lab/motion-ui';
import { firstValueFrom } from 'rxjs';

import { ProjectVersion } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { ProjectsStore } from '../../core/projects.store';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog.component';
import { formatDateTime } from '../../shared/format';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';

export interface ProjectHistoryData {
  projectId: string;
  /** The editor that opened the dialog has edits that were not saved: a restore will lose them, and the confirmation says so. */
  unsaved?: boolean;
  /** Called after a version was restored (the editor reads the project again). */
  onRestored?: (version: number) => void;
}

/** What made a version, in the person's words. */
const REASON: Record<ProjectVersion['reason'], string> = {
  save: $localize`:@@projectHistory.reasonSave:Saved`,
  patch: $localize`:@@projectHistory.reasonPatch:Name, client or label changed`,
  fix: $localize`:@@projectHistory.reasonFix:Fix applied`,
  run: $localize`:@@projectHistory.reasonRun:Changed by a run`,
  extend: $localize`:@@projectHistory.reasonExtend:Clip extended`,
  restore: $localize`:@@projectHistory.reasonRestore:Restored`,
  import: $localize`:@@projectHistory.reasonImport:Imported`,
};

/**
 * The versions of a project's definition (the text each change replaced; the server keeps the 20 newest): read one, and restore it
 * after a confirmation. The current definition is kept as a new version, so a restore can be undone by restoring that one.
 */
@Component({
  selector: 'app-project-history-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, AutoAnimateDirective, BytesPipe],
  templateUrl: './project-history-dialog.component.html',
  styleUrl: './project-history-dialog.component.scss',
})
export class ProjectHistoryDialogComponent implements OnInit {
  protected readonly data = inject<ProjectHistoryData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly store = inject(ProjectsStore);
  private readonly dialog = inject(MatDialog);

  protected readonly versions = signal<ProjectVersion[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly busy = signal(false);
  protected readonly chosen = signal<number | null>(null);
  protected readonly text = signal<string | null>(null);
  /** The version just restored, for the message. */
  protected readonly restored = signal<number | null>(null);
  /** What the server refused, in its words. */
  protected readonly problem = signal('');

  ngOnInit(): void {
    void this.load();
  }

  protected reason(v: ProjectVersion): string {
    return REASON[v.reason] ?? v.reason;
  }
  protected when(v: ProjectVersion): string {
    return formatDateTime(v.created_at);
  }

  private async load(): Promise<void> {
    this.busy.set(true);
    try {
      this.versions.set(await firstValueFrom(this.api.listProjectVersions(this.data.projectId)));
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.busy.set(false);
      this.loaded.set(true);
    }
  }

  protected retry(): void {
    void this.load();
  }

  /** Reads the text of a version and shows it, read-only. Nothing is changed. */
  protected async choose(v: ProjectVersion): Promise<void> {
    this.problem.set('');
    this.chosen.set(v.version);
    this.text.set(null);
    this.busy.set(true);
    try {
      const read = await firstValueFrom(this.api.getProjectVersion(this.data.projectId, v.version));
      if (this.chosen() === v.version) this.text.set(read.yaml);
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@projectHistory.readFailed:The text of that version could not be read.`));
    } finally {
      this.busy.set(false);
    }
  }

  /** Makes a version the definition of the project, only after the person confirms. */
  protected async restore(v: ProjectVersion): Promise<void> {
    const unsaved = this.data.unsaved
      ? ' ' + $localize`:@@projectHistory.unsaved:The changes you have not saved in the editor will be lost.`
      : '';
    const confirmed = await firstValueFrom(
      openConfirm(this.dialog, {
        title: $localize`:@@projectHistory.restoreTitle:Restore version ${v.version}:version:`,
        message: $localize`:@@projectHistory.restoreMessage:The project goes back to the definition of version ${v.version}:version:. The definition it has now is kept as a new version, so you can come back to it.` + unsaved,
        confirmLabel: $localize`:@@projectHistory.restoreConfirm:Restore version ${v.version}:version:`,
        destructive: true,
      }),
    );
    if (!confirmed) return;
    this.busy.set(true);
    this.problem.set('');
    try {
      const answer = await this.store.restore(this.data.projectId, v.version);
      this.restored.set(answer.restored);
      this.chosen.set(null);
      this.text.set(null);
      this.data.onRestored?.(answer.restored);
    } catch (e) {
      this.problem.set(reasonOf(e, $localize`:@@projectHistory.restoreFailed:The version could not be restored.`));
      this.busy.set(false);
      return;
    }
    this.busy.set(false);
    await this.load();
  }
}

/** The server's reason, as it wrote it. */
function reasonOf(e: unknown, fallback: string): string {
  return (e as HttpErrorResponse)?.error?.error?.message ?? fallback;
}
