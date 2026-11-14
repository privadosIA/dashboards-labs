import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { LanguageService } from '../../core/language';
import { MOTION_EDIT_BASE } from '../../core/options';
import { textsFor } from '../../core/texts';
import { datasetFileName, saveText } from '../../editor/actions/save-text';
import { FlowStorage } from '../flow.storage';
import { FlowStore } from '../flow.store';
import { AUTO_STEPS, type Flow, type StepId } from '../model';

/** The flows kept in the browser: resume, delete, export as JSON, import from a file, and the "do not stop here" switches new flows start with. */
@Component({
  selector: 'app-flow-list',
  imports: [RouterLink],
  templateUrl: './flow-list.html',
  styleUrl: './flow-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowList {
  private readonly store = inject(FlowStore);
  private readonly router = inject(Router);
  private readonly storage = inject(FlowStorage);
  private readonly base = inject(MOTION_EDIT_BASE);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.flow.list;
  protected readonly steps = this.texts.flow.page.steps;

  protected readonly flows = this.store.flows;
  protected readonly defaults = this.store.defaults;
  protected readonly autoSteps = AUTO_STEPS;
  protected readonly importError = signal(false);
  protected readonly hasFlows = computed(() => this.flows().length > 0);

  protected link(flow: Flow): string[] {
    return [`${this.base}/flow`, flow.id];
  }

  protected when(flow: Flow): string {
    return this.t.updated(new Date(flow.updatedAt).toLocaleString(this.lang));
  }

  protected where(flow: Flow): string {
    return this.t.at(this.steps[flow.current as StepId]);
  }

  protected title(flow: Flow): string {
    return flow.plan.song.title || flow.prompt;
  }

  protected setDefault(step: StepId, on: boolean): void {
    this.store.setDefault(step, on);
  }

  protected remove(flow: Flow): void {
    if (confirm(this.t.deleteAsk(flow.prompt))) this.store.remove(flow.id);
  }

  protected export(flow: Flow): void {
    saveText(datasetFileName(this.title(flow)).replace('.motion.json', '.flow.json'), this.storage.export(flow));
  }

  /** Reads a flow from a file; it never overwrites one that is kept (it gets a new id) and opens at once. */
  protected async import(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importError.set(false);
    const flow = this.storage.import(await file.text(), () => `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    if (!flow) {
      this.importError.set(true);
      return;
    }
    this.store.refreshList();
    void this.router.navigate([`${this.base}/flow`, flow.id]);
  }
}
